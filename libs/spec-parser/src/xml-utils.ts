/**
 * XML utility functions for escaping, unescaping, and extracting XML content.
 * These are pure functions with no dependencies for maximum reusability.
 */

/**
 * Escape special XML characters.
 * Handles undefined/null values by converting them to empty strings.
 */
export function escapeXml(str: string | undefined | null): string {
  if (str == null) {
    return '';
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Unescape XML entities back to regular characters.
 */
export function unescapeXml(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Escape special RegExp characters in a string.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the content of a specific XML section.
 *
 * Note: This function only matches bare tags without attributes.
 * Tags with attributes (e.g., `<tag id="1">`) are not supported.
 *
 * @param xmlContent - The full XML content
 * @param tagName - The tag name to extract (e.g., 'implemented_features')
 * @returns The content between the tags, or null if not found
 */
export function extractXmlSection(xmlContent: string, tagName: string): string | null {
  const safeTag = escapeRegExp(tagName);
  const regex = new RegExp(`<${safeTag}>([\\s\\S]*?)<\\/${safeTag}>`, 'i');
  const match = xmlContent.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract all values from repeated XML elements.
 *
 * Note: This function only matches bare tags without attributes.
 * Tags with attributes (e.g., `<tag id="1">`) are not supported.
 *
 * @param xmlContent - The XML content to search
 * @param tagName - The tag name to extract values from
 * @returns Array of extracted values (unescaped and trimmed)
 */
export function extractXmlElements(xmlContent: string, tagName: string): string[] {
  const values: string[] = [];
  const safeTag = escapeRegExp(tagName);
  const regex = new RegExp(`<${safeTag}>([\\s\\S]*?)<\\/${safeTag}>`, 'g');
  const matches = xmlContent.matchAll(regex);

  for (const match of matches) {
    values.push(unescapeXml(match[1].trim()));
  }

  return values;
}
