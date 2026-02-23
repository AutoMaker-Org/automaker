/**
 * Shared CodeMirror language detection utilities.
 *
 * Extracted from code-editor.tsx so that both the file editor and
 * the diff viewer can resolve language extensions from file paths.
 */

import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { sql } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';
import { xml } from '@codemirror/lang-xml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { go } from '@codemirror/legacy-modes/mode/go';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { swift } from '@codemirror/legacy-modes/mode/swift';

/** Detect language extension based on file extension */
export function getLanguageExtension(filePath: string): Extension | null {
  const name = filePath.split(/[/\\]/).pop()?.toLowerCase() || '';
  const dotIndex = name.lastIndexOf('.');
  // Files without an extension (no dot, or dotfile with dot at position 0)
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  // Handle files by name first
  switch (name) {
    case 'dockerfile':
    case 'dockerfile.dev':
    case 'dockerfile.prod':
      return StreamLanguage.define(dockerFile);
    case 'makefile':
    case 'gnumakefile':
      return StreamLanguage.define(shell);
    case '.gitignore':
    case '.dockerignore':
    case '.npmignore':
    case '.eslintignore':
      return StreamLanguage.define(shell);
    case '.env':
    case '.env.local':
    case '.env.development':
    case '.env.production':
      return StreamLanguage.define(shell);
  }

  switch (ext) {
    // JavaScript/TypeScript
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });

    // Web
    case 'html':
    case 'htm':
    case 'svelte':
    case 'vue':
      return html();
    case 'css':
    case 'scss':
    case 'less':
      return css();
    case 'json':
    case 'jsonc':
    case 'json5':
      return json();
    case 'xml':
    case 'svg':
    case 'xsl':
    case 'xslt':
    case 'plist':
      return xml();

    // Markdown
    case 'md':
    case 'mdx':
    case 'markdown':
      return markdown();

    // Python
    case 'py':
    case 'pyx':
    case 'pyi':
      return python();

    // Java/Kotlin
    case 'java':
    case 'kt':
    case 'kts':
      return java();

    // Systems
    case 'rs':
      return rust();
    case 'c':
    case 'h':
      return cpp();
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hxx':
      return cpp();
    case 'go':
      return StreamLanguage.define(go);
    case 'swift':
      return StreamLanguage.define(swift);

    // Scripting
    case 'rb':
    case 'erb':
      return StreamLanguage.define(ruby);
    case 'php':
      return php();
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return StreamLanguage.define(shell);

    // Data
    case 'sql':
    case 'mysql':
    case 'pgsql':
      return sql();
    case 'yaml':
    case 'yml':
      return StreamLanguage.define(yaml);
    case 'toml':
      return StreamLanguage.define(toml);

    default:
      return null; // Plain text fallback
  }
}
