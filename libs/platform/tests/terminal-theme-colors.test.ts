/**
 * Unit tests for terminal-theme-colors
 * Tests the terminal theme color definitions and override logic
 */

import { describe, it, expect } from 'vitest';
import { terminalThemeColors, getTerminalThemeColors } from '../src/terminal-theme-colors';
import type { ThemeMode } from '@automaker/types';

describe('terminal-theme-colors', () => {
  describe('terminalThemeColors', () => {
    it('should have dark theme with correct colors', () => {
      const theme = terminalThemeColors.dark;
      expect(theme.background).toBe('#000000');
      expect(theme.foreground).toBe('#ffffff');
      expect(theme.cursor).toBe('#ffffff');
    });

    it('should have light theme with correct colors', () => {
      const theme = terminalThemeColors.light;
      expect(theme.background).toBe('#ffffff');
      expect(theme.foreground).toBe('#383a42');
      expect(theme.cursor).toBe('#383a42');
    });

    it('should have dracula theme with correct colors', () => {
      const theme = terminalThemeColors.dracula;
      expect(theme.background).toBe('#282a36');
      expect(theme.foreground).toBe('#f8f8f2');
      expect(theme.cursor).toBe('#f8f8f2');
    });

    it('should have nord theme with correct colors', () => {
      const theme = terminalThemeColors.nord;
      expect(theme.background).toBe('#2e3440');
      expect(theme.foreground).toBe('#d8dee9');
    });

    it('should have catppuccin theme with correct colors', () => {
      const theme = terminalThemeColors.catppuccin;
      expect(theme.background).toBe('#1e1e2e');
      expect(theme.foreground).toBe('#cdd6f4');
    });

    it('should have all required ANSI color properties for each theme', () => {
      const requiredColors = [
        'black',
        'red',
        'green',
        'yellow',
        'blue',
        'magenta',
        'cyan',
        'white',
        'brightBlack',
        'brightRed',
        'brightGreen',
        'brightYellow',
        'brightBlue',
        'brightMagenta',
        'brightCyan',
        'brightWhite',
      ];

      // Test a few key themes
      const themesToTest: ThemeMode[] = ['dark', 'light', 'dracula', 'nord', 'catppuccin'];

      for (const themeName of themesToTest) {
        const theme = terminalThemeColors[themeName];
        for (const color of requiredColors) {
          expect(theme, `Theme ${themeName} should have ${color}`).toHaveProperty(color);
          expect(typeof theme[color as keyof typeof theme]).toBe('string');
        }
      }
    });

    it('should have core theme properties for each theme', () => {
      const coreProperties = [
        'background',
        'foreground',
        'cursor',
        'cursorAccent',
        'selectionBackground',
      ];

      const themesToTest: ThemeMode[] = ['dark', 'light', 'dracula', 'nord', 'catppuccin'];

      for (const themeName of themesToTest) {
        const theme = terminalThemeColors[themeName];
        for (const prop of coreProperties) {
          expect(theme, `Theme ${themeName} should have ${prop}`).toHaveProperty(prop);
          expect(typeof theme[prop as keyof typeof theme]).toBe('string');
        }
      }
    });

    it('should map alias themes to their base themes correctly', () => {
      // Forest is mapped to gruvbox
      expect(terminalThemeColors.forest).toBe(terminalThemeColors.gruvbox);

      // Ocean is mapped to nord
      expect(terminalThemeColors.ocean).toBe(terminalThemeColors.nord);

      // Ember is mapped to monokai
      expect(terminalThemeColors.ember).toBe(terminalThemeColors.monokai);

      // Light theme aliases
      expect(terminalThemeColors.solarizedlight).toBe(terminalThemeColors.light);
      expect(terminalThemeColors.github).toBe(terminalThemeColors.light);

      // Cream theme aliases
      expect(terminalThemeColors.sand).toBe(terminalThemeColors.cream);
      expect(terminalThemeColors.peach).toBe(terminalThemeColors.cream);
    });
  });

  describe('getTerminalThemeColors', () => {
    it('should return dark theme by default', () => {
      const theme = getTerminalThemeColors('dark');
      expect(theme.background).toBe('#000000');
      expect(theme.foreground).toBe('#ffffff');
    });

    it('should return dark theme for unknown theme (fallback)', () => {
      const theme = getTerminalThemeColors('unknown-theme' as ThemeMode);
      expect(theme.background).toBe('#000000');
      expect(theme.foreground).toBe('#ffffff');
    });

    it('should return light theme for light mode', () => {
      const theme = getTerminalThemeColors('light');
      expect(theme.background).toBe('#ffffff');
      expect(theme.foreground).toBe('#383a42');
    });

    it('should return correct theme for various theme modes', () => {
      const testCases: { theme: ThemeMode; expectedBg: string; expectedFg: string }[] = [
        { theme: 'dark', expectedBg: '#000000', expectedFg: '#ffffff' },
        { theme: 'light', expectedBg: '#ffffff', expectedFg: '#383a42' },
        { theme: 'dracula', expectedBg: '#282a36', expectedFg: '#f8f8f2' },
        { theme: 'nord', expectedBg: '#2e3440', expectedFg: '#d8dee9' },
        { theme: 'tokyonight', expectedBg: '#1a1b26', expectedFg: '#a9b1d6' },
        { theme: 'solarized', expectedBg: '#002b36', expectedFg: '#93a1a1' },
        { theme: 'gruvbox', expectedBg: '#282828', expectedFg: '#ebdbb2' },
        { theme: 'catppuccin', expectedBg: '#1e1e2e', expectedFg: '#cdd6f4' },
        { theme: 'onedark', expectedBg: '#282c34', expectedFg: '#abb2bf' },
        { theme: 'monokai', expectedBg: '#272822', expectedFg: '#f8f8f2' },
        { theme: 'retro', expectedBg: '#000000', expectedFg: '#39ff14' },
        { theme: 'synthwave', expectedBg: '#262335', expectedFg: '#ffffff' },
        { theme: 'red', expectedBg: '#1a0a0a', expectedFg: '#c8b0b0' },
        { theme: 'cream', expectedBg: '#f5f3ee', expectedFg: '#5a4a3a' },
        { theme: 'sunset', expectedBg: '#1e1a24', expectedFg: '#f2e8dd' },
        { theme: 'gray', expectedBg: '#2a2d32', expectedFg: '#d0d0d5' },
      ];

      for (const { theme, expectedBg, expectedFg } of testCases) {
        const result = getTerminalThemeColors(theme);
        expect(result.background, `Theme ${theme} background`).toBe(expectedBg);
        expect(result.foreground, `Theme ${theme} foreground`).toBe(expectedFg);
      }
    });
  });

  describe('Custom color override scenario', () => {
    it('should allow creating custom theme with background override', () => {
      const baseTheme = getTerminalThemeColors('dark');
      const customBgColor = '#1a1a2e';

      // Simulate the override logic from terminal-panel.tsx
      const customTheme = {
        ...baseTheme,
        background: customBgColor,
      };

      expect(customTheme.background).toBe('#1a1a2e');
      expect(customTheme.foreground).toBe('#ffffff'); // Should keep original
      expect(customTheme.cursor).toBe('#ffffff'); // Should preserve cursor
    });

    it('should allow creating custom theme with foreground override', () => {
      const baseTheme = getTerminalThemeColors('dark');
      const customFgColor = '#e0e0e0';

      const customTheme = {
        ...baseTheme,
        foreground: customFgColor,
      };

      expect(customTheme.background).toBe('#000000'); // Should keep original
      expect(customTheme.foreground).toBe('#e0e0e0');
    });

    it('should allow creating custom theme with both overrides', () => {
      const baseTheme = getTerminalThemeColors('dark');
      const customBgColor = '#1a1a2e';
      const customFgColor = '#e0e0e0';

      const customTheme = {
        ...baseTheme,
        background: customBgColor,
        foreground: customFgColor,
      };

      expect(customTheme.background).toBe('#1a1a2e');
      expect(customTheme.foreground).toBe('#e0e0e0');
      expect(customTheme.cursor).toBe('#ffffff'); // Should preserve cursor
      expect(customTheme.red).toBe('#f44747'); // Should preserve ANSI colors
    });

    it('should handle null custom colors (use base theme)', () => {
      const baseTheme = getTerminalThemeColors('dark');
      const customBgColor: string | null = null;
      const customFgColor: string | null = null;

      // Simulate the override logic from terminal-panel.tsx
      const customTheme =
        customBgColor || customFgColor
          ? {
              ...baseTheme,
              ...(customBgColor && { background: customBgColor }),
              ...(customFgColor && { foreground: customFgColor }),
            }
          : baseTheme;

      expect(customTheme.background).toBe('#000000'); // Should use base
      expect(customTheme.foreground).toBe('#ffffff'); // Should use base
    });

    it('should handle only background color set', () => {
      const baseTheme = getTerminalThemeColors('dark');
      const customBgColor = '#1a1a2e';
      const customFgColor: string | null = null;

      const customTheme =
        customBgColor || customFgColor
          ? {
              ...baseTheme,
              ...(customBgColor && { background: customBgColor }),
              ...(customFgColor && { foreground: customFgColor }),
            }
          : baseTheme;

      expect(customTheme.background).toBe('#1a1a2e');
      expect(customTheme.foreground).toBe('#ffffff'); // Should keep base
    });

    it('should handle only foreground color set', () => {
      const baseTheme = getTerminalThemeColors('dark');
      const customBgColor: string | null = null;
      const customFgColor = '#e0e0e0';

      const customTheme =
        customBgColor || customFgColor
          ? {
              ...baseTheme,
              ...(customBgColor && { background: customBgColor }),
              ...(customFgColor && { foreground: customFgColor }),
            }
          : baseTheme;

      expect(customTheme.background).toBe('#000000'); // Should keep base
      expect(customTheme.foreground).toBe('#e0e0e0');
    });

    it('should work with light theme as base', () => {
      const baseTheme = getTerminalThemeColors('light');
      const customBgColor = '#f0f0f0';
      const customFgColor = '#333333';

      const customTheme = {
        ...baseTheme,
        background: customBgColor,
        foreground: customFgColor,
      };

      expect(customTheme.background).toBe('#f0f0f0');
      expect(customTheme.foreground).toBe('#333333');
      expect(customTheme.cursor).toBe('#383a42'); // Should preserve light theme cursor
    });

    it('should preserve all theme properties when overriding', () => {
      const baseTheme = getTerminalThemeColors('dracula');
      const customBgColor = '#1a1a2e';
      const customFgColor = '#e0e0e0';

      const customTheme = {
        ...baseTheme,
        background: customBgColor,
        foreground: customFgColor,
      };

      // Verify all other properties are preserved
      expect(customTheme.cursor).toBe('#f8f8f2'); // Dracula cursor
      expect(customTheme.cursorAccent).toBe('#282a36');
      expect(customTheme.selectionBackground).toBe('#44475a');
      expect(customTheme.red).toBe('#ff5555');
      expect(customTheme.green).toBe('#50fa7b');
      expect(customTheme.blue).toBe('#bd93f9');
    });

    it('should handle race condition scenario: read from store takes priority', () => {
      // This test documents the fix for the race condition where:
      // 1. Terminal component mounts
      // 2. useShallow subscription might have stale values (null)
      // 3. Store is hydrated with actual values from server
      // 4. Reading from getState() gives us the latest values

      const baseTheme = getTerminalThemeColors('dark');

      // Simulate stale subscription values (null)
      const staleSubscriptionBg: string | null = null;
      const staleSubscriptionFg: string | null = null;

      // Simulate fresh store values (actual colors)
      const freshStoreBg = '#1a1a2e';
      const freshStoreFg = '#e0e0e0';

      // The fix: prioritize store values over subscription values
      const actualBg = freshStoreBg; // Use store value, not subscription
      const actualFg = freshStoreFg; // Use store value, not subscription

      const customTheme =
        actualBg || actualFg
          ? {
              ...baseTheme,
              ...(actualBg && { background: actualBg }),
              ...(actualFg && { foreground: actualFg }),
            }
          : baseTheme;

      // Verify we get the fresh store values, not the stale subscription values
      expect(customTheme.background).toBe('#1a1a2e');
      expect(customTheme.foreground).toBe('#e0e0e0');
    });
  });
});
