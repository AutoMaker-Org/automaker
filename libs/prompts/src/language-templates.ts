/**
 * Language Templates - Predefined language instructions for AI prompts
 *
 * Each template defines how the AI should respond in a specific language,
 * including rules for code, technical terms, and documentation.
 */

export interface LanguageTemplate {
  /** Language identifier */
  id: string;
  /** Display name for the UI */
  name: string;
  /** Native name of the language */
  nativeName: string;
  /** The full instruction text */
  instruction: string;
}

/**
 * Predefined language templates
 */
export const LANGUAGE_TEMPLATES: LanguageTemplate[] = [
  {
    id: 'english',
    name: 'English',
    nativeName: 'English',
    instruction: `Respond in English.
- Write all explanations, descriptions, and conversational text in English
- Keep code, variable names, function names, and technical identifiers in English
- Use English for commit messages and PR descriptions
- Technical terms should be in English`,
  },
  {
    id: 'german',
    name: 'German',
    nativeName: 'Deutsch',
    instruction: `Respond in German (Deutsch).
- Write all explanations, descriptions, and conversational text in German
- Keep code, variable names, function names, and technical identifiers in English
- Use German for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'spanish',
    name: 'Spanish',
    nativeName: 'Español',
    instruction: `Respond in Spanish (Español).
- Write all explanations, descriptions, and conversational text in Spanish
- Keep code, variable names, function names, and technical identifiers in English
- Use Spanish for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'french',
    name: 'French',
    nativeName: 'Français',
    instruction: `Respond in French (Français).
- Write all explanations, descriptions, and conversational text in French
- Keep code, variable names, function names, and technical identifiers in English
- Use French for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'portuguese',
    name: 'Portuguese',
    nativeName: 'Português',
    instruction: `Respond in Portuguese (Português).
- Write all explanations, descriptions, and conversational text in Portuguese
- Keep code, variable names, function names, and technical identifiers in English
- Use Portuguese for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'italian',
    name: 'Italian',
    nativeName: 'Italiano',
    instruction: `Respond in Italian (Italiano).
- Write all explanations, descriptions, and conversational text in Italian
- Keep code, variable names, function names, and technical identifiers in English
- Use Italian for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'dutch',
    name: 'Dutch',
    nativeName: 'Nederlands',
    instruction: `Respond in Dutch (Nederlands).
- Write all explanations, descriptions, and conversational text in Dutch
- Keep code, variable names, function names, and technical identifiers in English
- Use Dutch for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'polish',
    name: 'Polish',
    nativeName: 'Polski',
    instruction: `Respond in Polish (Polski).
- Write all explanations, descriptions, and conversational text in Polish
- Keep code, variable names, function names, and technical identifiers in English
- Use Polish for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'russian',
    name: 'Russian',
    nativeName: 'Русский',
    instruction: `Respond in Russian (Русский).
- Write all explanations, descriptions, and conversational text in Russian
- Keep code, variable names, function names, and technical identifiers in English
- Use Russian for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'japanese',
    name: 'Japanese',
    nativeName: '日本語',
    instruction: `Respond in Japanese (日本語).
- Write all explanations, descriptions, and conversational text in Japanese
- Keep code, variable names, function names, and technical identifiers in English
- Use Japanese for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'chinese',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    instruction: `Respond in Simplified Chinese (简体中文).
- Write all explanations, descriptions, and conversational text in Simplified Chinese
- Keep code, variable names, function names, and technical identifiers in English
- Use Simplified Chinese for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
  {
    id: 'korean',
    name: 'Korean',
    nativeName: '한국어',
    instruction: `Respond in Korean (한국어).
- Write all explanations, descriptions, and conversational text in Korean
- Keep code, variable names, function names, and technical identifiers in English
- Use Korean for commit messages and PR descriptions
- Technical terms may remain in English if commonly used (e.g., "Repository", "Branch", "Merge", "Commit")
- Error messages and logs should be in English for debugging purposes`,
  },
];

/**
 * Get a language template by ID
 */
export function getLanguageTemplate(id: string): LanguageTemplate | undefined {
  return LANGUAGE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get the default language instruction for a language ID
 */
export function getDefaultLanguageInstruction(languageId: string): string {
  const template = getLanguageTemplate(languageId);
  return template?.instruction ?? '';
}

/**
 * Get all available language IDs
 */
export function getAvailableLanguages(): string[] {
  return LANGUAGE_TEMPLATES.map((t) => t.id);
}
