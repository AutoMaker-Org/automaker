"use client";

import { useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

interface XmlSyntaxEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

// Tokenize XML content into parts for highlighting
interface Token {
  type:
    | "tag-bracket"
    | "tag-name"
    | "attribute-name"
    | "attribute-equals"
    | "attribute-value"
    | "text"
    | "comment"
    | "cdata"
    | "doctype";
  value: string;
}

function tokenizeXml(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    // Comment: <!-- ... -->
    if (text.slice(i, i + 4) === "<!--") {
      const end = text.indexOf("-->", i + 4);
      if (end !== -1) {
        tokens.push({ type: "comment", value: text.slice(i, end + 3) });
        i = end + 3;
        continue;
      }
    }

    // CDATA: <![CDATA[ ... ]]>
    if (text.slice(i, i + 9) === "<![CDATA[") {
      const end = text.indexOf("]]>", i + 9);
      if (end !== -1) {
        tokens.push({ type: "cdata", value: text.slice(i, end + 3) });
        i = end + 3;
        continue;
      }
    }

    // DOCTYPE: <!DOCTYPE ... >
    if (text.slice(i, i + 9).toUpperCase() === "<!DOCTYPE") {
      const end = text.indexOf(">", i + 9);
      if (end !== -1) {
        tokens.push({ type: "doctype", value: text.slice(i, end + 1) });
        i = end + 1;
        continue;
      }
    }

    // Tag: < ... >
    if (text[i] === "<") {
      // Find the end of the tag
      let tagEnd = i + 1;
      let inString: string | null = null;

      while (tagEnd < text.length) {
        const char = text[tagEnd];

        if (inString) {
          if (char === inString && text[tagEnd - 1] !== "\\") {
            inString = null;
          }
        } else {
          if (char === '"' || char === "'") {
            inString = char;
          } else if (char === ">") {
            tagEnd++;
            break;
          }
        }
        tagEnd++;
      }

      const tagContent = text.slice(i, tagEnd);
      const tagTokens = tokenizeTag(tagContent);
      tokens.push(...tagTokens);
      i = tagEnd;
      continue;
    }

    // Text content between tags
    const nextTag = text.indexOf("<", i);
    if (nextTag === -1) {
      tokens.push({ type: "text", value: text.slice(i) });
      break;
    } else if (nextTag > i) {
      tokens.push({ type: "text", value: text.slice(i, nextTag) });
      i = nextTag;
    }
  }

  return tokens;
}

function tokenizeTag(tag: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  // Opening bracket (< or </ or <?)
  if (tag.startsWith("</")) {
    tokens.push({ type: "tag-bracket", value: "</" });
    i = 2;
  } else if (tag.startsWith("<?")) {
    tokens.push({ type: "tag-bracket", value: "<?" });
    i = 2;
  } else {
    tokens.push({ type: "tag-bracket", value: "<" });
    i = 1;
  }

  // Skip whitespace
  while (i < tag.length && /\s/.test(tag[i])) {
    tokens.push({ type: "text", value: tag[i] });
    i++;
  }

  // Tag name
  let tagName = "";
  while (i < tag.length && /[a-zA-Z0-9_:-]/.test(tag[i])) {
    tagName += tag[i];
    i++;
  }
  if (tagName) {
    tokens.push({ type: "tag-name", value: tagName });
  }

  // Attributes and closing
  while (i < tag.length) {
    // Skip whitespace
    if (/\s/.test(tag[i])) {
      let ws = "";
      while (i < tag.length && /\s/.test(tag[i])) {
        ws += tag[i];
        i++;
      }
      tokens.push({ type: "text", value: ws });
      continue;
    }

    // Closing bracket
    if (tag[i] === ">" || tag.slice(i, i + 2) === "/>" || tag.slice(i, i + 2) === "?>") {
      tokens.push({ type: "tag-bracket", value: tag.slice(i) });
      break;
    }

    // Attribute name
    let attrName = "";
    while (i < tag.length && /[a-zA-Z0-9_:-]/.test(tag[i])) {
      attrName += tag[i];
      i++;
    }
    if (attrName) {
      tokens.push({ type: "attribute-name", value: attrName });
    }

    // Skip whitespace around =
    while (i < tag.length && /\s/.test(tag[i])) {
      tokens.push({ type: "text", value: tag[i] });
      i++;
    }

    // Equals sign
    if (tag[i] === "=") {
      tokens.push({ type: "attribute-equals", value: "=" });
      i++;
    }

    // Skip whitespace after =
    while (i < tag.length && /\s/.test(tag[i])) {
      tokens.push({ type: "text", value: tag[i] });
      i++;
    }

    // Attribute value
    if (tag[i] === '"' || tag[i] === "'") {
      const quote = tag[i];
      let value = quote;
      i++;
      while (i < tag.length && tag[i] !== quote) {
        value += tag[i];
        i++;
      }
      if (i < tag.length) {
        value += tag[i];
        i++;
      }
      tokens.push({ type: "attribute-value", value });
    }
  }

  return tokens;
}

export function XmlSyntaxEditor({
  value,
  onChange,
  placeholder,
  className,
  "data-testid": testId,
}: XmlSyntaxEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlight layer
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Handle tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);
        // Reset cursor position after state update
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange]
  );

  // Memoize the highlighted content
  const highlightedContent = useMemo(() => {
    const tokens = tokenizeXml(value);

    return tokens.map((token, index) => {
      const className = `xml-${token.type}`;
      // React handles escaping automatically, just render the raw value
      return (
        <span key={index} className={className}>
          {token.value}
        </span>
      );
    });
  }, [value]);

  return (
    <div className={cn("relative w-full h-full xml-editor", className)}>
      {/* Syntax highlighted layer (read-only, behind textarea) */}
      <div
        ref={highlightRef}
        className="absolute inset-0 overflow-auto pointer-events-none font-mono text-sm p-4 whitespace-pre-wrap break-words"
        aria-hidden="true"
      >
        {value ? (
          <code className="xml-highlight">{highlightedContent}</code>
        ) : (
          <span className="text-muted-foreground opacity-50">{placeholder}</span>
        )}
      </div>

      {/* Actual textarea (transparent text, handles input) */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        placeholder=""
        spellCheck={false}
        className="absolute inset-0 w-full h-full font-mono text-sm p-4 bg-transparent resize-none focus:outline-none text-transparent caret-foreground selection:bg-primary/30"
        data-testid={testId}
      />
    </div>
  );
}
