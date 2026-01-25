/**
 * String utility functions for common text operations
 */

/**
 * Truncate a string to a maximum length, adding an ellipsis if truncated
 * @param str - The string to truncate
 * @param maxLength - Maximum length of the result (including ellipsis)
 * @param ellipsis - The ellipsis string to use (default: '...')
 * @returns The truncated string
 */
export function truncate(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (maxLength < ellipsis.length) {
    throw new Error(
      `maxLength (${maxLength}) must be at least the length of ellipsis (${ellipsis.length})`
    );
  }

  if (str.length <= maxLength) {
    return str;
  }

  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Convert a string to kebab-case (e.g., "Hello World" -> "hello-world")
 * @param str - The string to convert
 * @returns The kebab-case string
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase -> camel-Case
    .replace(/[\s_]+/g, '-') // spaces and underscores -> hyphens
    .replace(/[^a-zA-Z0-9-]/g, '') // remove non-alphanumeric (except hyphens)
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-|-$/g, '') // remove leading/trailing hyphens
    .toLowerCase();
}

/**
 * Convert a string to camelCase (e.g., "hello-world" -> "helloWorld")
 * @param str - The string to convert
 * @returns The camelCase string
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s_-]/g, '') // remove special characters
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

/**
 * Convert a string to PascalCase (e.g., "hello-world" -> "HelloWorld")
 * @param str - The string to convert
 * @returns The PascalCase string
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Capitalize the first letter of a string
 * @param str - The string to capitalize
 * @returns The string with first letter capitalized
 */
export function capitalize(str: string): string {
  if (str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Remove duplicate whitespace from a string, preserving single spaces
 * @param str - The string to clean
 * @returns The string with duplicate whitespace removed
 */
export function collapseWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Check if a string is empty or contains only whitespace
 * @param str - The string to check
 * @returns True if the string is blank
 */
export function isBlank(str: string | null | undefined): boolean {
  return str === null || str === undefined || str.trim().length === 0;
}

/**
 * Check if a string is not empty and contains non-whitespace characters
 * @param str - The string to check
 * @returns True if the string is not blank
 */
export function isNotBlank(str: string | null | undefined): boolean {
  return !isBlank(str);
}

/**
 * Safely parse a string to an integer, returning a default value on failure
 * @param str - The string to parse
 * @param defaultValue - The default value if parsing fails (default: 0)
 * @returns The parsed integer or the default value
 */
export function safeParseInt(str: string | null | undefined, defaultValue: number = 0): number {
  if (isBlank(str)) {
    return defaultValue;
  }

  const parsed = parseInt(str!, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Generate a slug from a string (URL-friendly identifier)
 * @param str - The string to convert to a slug
 * @param maxLength - Optional maximum length for the slug
 * @returns The slugified string
 */
export function slugify(str: string, maxLength?: number): string {
  let slug = str
    .toLowerCase()
    .normalize('NFD') // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  if (maxLength !== undefined && slug.length > maxLength) {
    // Truncate at word boundary if possible
    slug = slug.slice(0, maxLength);
    const lastHyphen = slug.lastIndexOf('-');
    if (lastHyphen > maxLength * 0.5) {
      slug = slug.slice(0, lastHyphen);
    }
    slug = slug.replace(/-$/g, ''); // Remove trailing hyphen after truncation
  }

  return slug;
}

/**
 * Escape special regex characters in a string
 * @param str - The string to escape
 * @returns The escaped string safe for use in a RegExp
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pluralize a word based on count
 * @param word - The singular form of the word
 * @param count - The count to base pluralization on
 * @param pluralForm - Optional custom plural form (default: word + 's')
 * @returns The word in singular or plural form
 */
export function pluralize(word: string, count: number, pluralForm?: string): string {
  if (count === 1) {
    return word;
  }
  return pluralForm || `${word}s`;
}

/**
 * Format a count with its associated word (e.g., "1 item", "3 items")
 * @param count - The count
 * @param singular - The singular form of the word
 * @param plural - Optional custom plural form
 * @returns Formatted string with count and word
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(singular, count, plural)}`;
}
