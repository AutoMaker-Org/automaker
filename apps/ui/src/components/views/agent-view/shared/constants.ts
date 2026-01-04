// Agent view constants

export const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant' as const,
  content:
    "Hello! I'm the Automaker Agent. I can help you build software autonomously. I can read and modify files in this project, run commands, and execute tests. What would you like to create today?",
  timestamp: new Date().toISOString(),
};
