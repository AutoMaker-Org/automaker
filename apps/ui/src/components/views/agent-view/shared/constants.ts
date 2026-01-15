// Agent view constants

/**
 * Default welcome message structure.
 * Note: The actual content is loaded from translations via useTranslation('agent')
 * and the key 'welcome.greeting'. This constant serves as a template for the
 * message structure when there are no messages in the chat.
 *
 * @see apps/ui/public/locales/en/agent.json for the translated content
 */
export const WELCOME_MESSAGE_ID = 'welcome';
export const WELCOME_MESSAGE_ROLE = 'assistant' as const;
