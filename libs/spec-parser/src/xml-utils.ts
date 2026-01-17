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
 * Extract the content of a specific XML section.
 *
 * @param xmlContent - The full XML content
 * @param tagName - The tag name to extract (e.g., 'implemented_features')
 * @returns The content between the tags, or null if not found
 */
export function extractXmlSection(xmlContent: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlContent.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract all values from repeated XML elements.
 *
 * @param xmlContent - The XML content to search
 * @param tagName - The tag name to extract values from
 * @returns Array of extracted values (unescaped and trimmed)
 */
export function extractXmlElements(xmlContent: string, tagName: string): string[] {
  const values: string[] = [];
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const matches = xmlContent.matchAll(regex);

  for (const match of matches) {
    values.push(unescapeXml(match[1].trim()));
  }

  return values;
}
