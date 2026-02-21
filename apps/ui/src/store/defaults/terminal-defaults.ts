import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import type { TerminalState } from '../types/terminal-types';

// Default terminal state values
export const defaultTerminalState: TerminalState = {
  isUnlocked: false,
  authToken: null,
  tabs: [],
  activeTabId: null,
  activeSessionId: null,
  maximizedSessionId: null,
  defaultFontSize: 14,
  defaultRunScript: '',
  screenReaderMode: false,
  fontFamily: DEFAULT_FONT_VALUE,
  scrollbackLines: 5000,
  lineHeight: 1.0,
  maxSessions: 100,
  lastActiveProjectPath: null,
  openTerminalMode: 'newTab',
  customBackgroundColor: null,
  customForegroundColor: null,
};
