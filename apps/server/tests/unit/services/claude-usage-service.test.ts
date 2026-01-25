import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeUsageService } from '@/services/claude-usage-service.js';
import { spawn } from 'child_process';
import * as pty from 'node-pty';
import * as os from 'os';

vi.mock('child_process');
vi.mock('node-pty');
vi.mock('os');

describe('claude-usage-service.ts', () => {
  let service: ClaudeUsageService;
  let mockSpawnProcess: any;
  let mockPtyProcess: any;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClaudeUsageService();

    // Mock spawn process for isAvailable and Mac commands
    mockSpawnProcess = {
      on: vi.fn(),
      kill: vi.fn(),
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
    };

    // Mock PTY process for Windows
    mockPtyProcess = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      kill: vi.fn(),
    };

    vi.mocked(spawn).mockReturnValue(mockSpawnProcess as any);
    vi.mocked(pty.spawn).mockReturnValue(mockPtyProcess);
  });

  describe('isAvailable', () => {
    it('should return true when Claude CLI is available', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');

      // Simulate successful which/where command
      mockSpawnProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0); // Exit code 0 = found
        }
        return mockSpawnProcess;
      });

      const result = await service.isAvailable();

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith('which', ['claude']);
    });

    it('should return false when Claude CLI is not available', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');

      mockSpawnProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1); // Exit code 1 = not found
        }
        return mockSpawnProcess;
      });

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');

      mockSpawnProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Command failed'));
        }
        return mockSpawnProcess;
      });

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });

    it("should use 'where' command on Windows", async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const ptyService = new ClaudeUsageService(); // Create new service after platform mock

      mockSpawnProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
        return mockSpawnProcess;
      });

      await ptyService.isAvailable();

      expect(spawn).toHaveBeenCalledWith('where', ['claude']);
    });
  });

  describe('stripAnsiCodes', () => {
    it('should strip ANSI color codes from text', () => {
      const service = new ClaudeUsageService();
      const input = '\x1B[31mRed text\x1B[0m Normal text';
      // @ts-expect-error - accessing private method for testing
      const result = service.stripAnsiCodes(input);

      expect(result).toBe('Red text Normal text');
    });

    it('should handle text without ANSI codes', () => {
      const service = new ClaudeUsageService();
      const input = 'Plain text';
      // @ts-expect-error - accessing private method for testing
      const result = service.stripAnsiCodes(input);

      expect(result).toBe('Plain text');
    });

    it('should strip OSC sequences (window title, etc.)', () => {
      const service = new ClaudeUsageService();
      // OSC sequence to set window title: ESC ] 0 ; title BEL
      const input = '\x1B]0;Claude Code\x07Regular text';
      // @ts-expect-error - accessing private method for testing
      const result = service.stripAnsiCodes(input);

      expect(result).toBe('Regular text');
    });

    it('should strip DEC private mode sequences', () => {
      const service = new ClaudeUsageService();
      // DEC private mode sequences like ESC[?2026h and ESC[?2026l
      const input = '\x1B[?2026lClaude Code\x1B[?2026h more text';
      // @ts-expect-error - accessing private method for testing
      const result = service.stripAnsiCodes(input);

      expect(result).toBe('Claude Code more text');
    });

    it('should handle complex terminal output with mixed escape sequences', () => {
      const service = new ClaudeUsageService();
      // Simulate the garbled output seen in the bug: "[?2026l ]0;❇ Claude Code [?2026h"
      // This contains OSC (set title) and DEC private mode sequences
      const input =
        '\x1B[?2026l\x1B]0;❇ Claude Code\x07\x1B[?2026hCurrent session 0%used Resets3am';
      // @ts-expect-error - accessing private method for testing
      const result = service.stripAnsiCodes(input);

      expect(result).toBe('Current session 0%used Resets3am');
    });

    it('should strip single character escape sequences', () => {
      const service = new ClaudeUsageService();
      // ESC c is the reset terminal command
      const input = '\x1BcReset text';
      // @ts-expect-error - accessing private method for testing
      const result = service.stripAnsiCodes(input);

      expect(result).toBe('Reset text');
    });

    it('should remove control characters but preserve newlines and tabs', () => {
      const service = new ClaudeUsageService();
      // BEL character (\x07) should be stripped, but the word "Bell" is regular text
      const input = 'Line 1\nLine 2\tTabbed\x07 with bell';
      // @ts-expect-error - accessing private method for testing
      const result = service.stripAnsiCodes(input);

      // BEL is stripped, newlines and tabs preserved
      expect(result).toBe('Line 1\nLine 2\tTabbed with bell');
    });
  });

  describe('parseResetTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should parse duration format with hours and minutes', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets in 2h 15m';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'session');

      const expected = new Date('2025-01-15T12:15:00Z');
      expect(new Date(result)).toEqual(expected);
    });

    it('should parse duration format with only minutes', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets in 30m';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'session');

      const expected = new Date('2025-01-15T10:30:00Z');
      expect(new Date(result)).toEqual(expected);
    });

    it('should parse simple time format (AM)', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets 11am';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'session');

      // Should be today at 11am, or tomorrow if already passed
      const resultDate = new Date(result);
      expect(resultDate.getHours()).toBe(11);
      expect(resultDate.getMinutes()).toBe(0);
    });

    it('should parse simple time format (PM)', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets 3pm';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'session');

      const resultDate = new Date(result);
      expect(resultDate.getHours()).toBe(15);
      expect(resultDate.getMinutes()).toBe(0);
    });

    it('should parse date format with month, day, and time', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets Dec 22 at 8pm';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'weekly');

      const resultDate = new Date(result);
      expect(resultDate.getMonth()).toBe(11); // December = 11
      expect(resultDate.getDate()).toBe(22);
      expect(resultDate.getHours()).toBe(20);
    });

    it('should parse date format with comma separator', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets Jan 15, 3:30pm';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'weekly');

      const resultDate = new Date(result);
      expect(resultDate.getMonth()).toBe(0); // January = 0
      expect(resultDate.getDate()).toBe(15);
      expect(resultDate.getHours()).toBe(15);
      expect(resultDate.getMinutes()).toBe(30);
    });

    it('should handle 12am correctly', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets 12am';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'session');

      const resultDate = new Date(result);
      expect(resultDate.getHours()).toBe(0);
    });

    it('should handle 12pm correctly', () => {
      const service = new ClaudeUsageService();
      const text = 'Resets 12pm';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'session');

      const resultDate = new Date(result);
      expect(resultDate.getHours()).toBe(12);
    });

    it('should return default reset time for unparseable text', () => {
      const service = new ClaudeUsageService();
      const text = 'Invalid reset text';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseResetTime(text, 'session');
      // @ts-expect-error - accessing private method for testing
      const defaultResult = service.getDefaultResetTime('session');

      expect(result).toBe(defaultResult);
    });
  });

  describe('getDefaultResetTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T10:00:00Z')); // Wednesday
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return session default (5 hours from now)', () => {
      const service = new ClaudeUsageService();
      // @ts-expect-error - accessing private method for testing
      const result = service.getDefaultResetTime('session');

      const expected = new Date('2025-01-15T15:00:00Z');
      expect(new Date(result)).toEqual(expected);
    });

    it('should return weekly default (next Monday at noon)', () => {
      const service = new ClaudeUsageService();
      // @ts-expect-error - accessing private method for testing
      const result = service.getDefaultResetTime('weekly');

      const resultDate = new Date(result);
      // Next Monday from Wednesday should be 5 days away
      expect(resultDate.getDay()).toBe(1); // Monday
      expect(resultDate.getHours()).toBe(12);
      expect(resultDate.getMinutes()).toBe(59);
    });
  });

  describe('parseSection', () => {
    it('should parse section with percentage left', () => {
      const service = new ClaudeUsageService();
      const lines = ['Current session', '████████████████░░░░ 65% left', 'Resets in 2h 15m'];
      // @ts-expect-error - accessing private method for testing
      const result = service.parseSection(lines, 'Current session', 'session');

      expect(result.percentage).toBe(35); // 100 - 65 = 35% used
      expect(result.resetText).toBe('Resets in 2h 15m');
    });

    it('should parse section with percentage used', () => {
      const service = new ClaudeUsageService();
      const lines = [
        'Current week (all models)',
        '██████████░░░░░░░░░░ 40% used',
        'Resets Jan 15, 3:30pm',
      ];
      // @ts-expect-error - accessing private method for testing
      const result = service.parseSection(lines, 'Current week (all models)', 'weekly');

      expect(result.percentage).toBe(40); // Already in % used
    });

    it('should return zero percentage when section not found', () => {
      const service = new ClaudeUsageService();
      const lines = ['Some other text', 'No matching section'];
      // @ts-expect-error - accessing private method for testing
      const result = service.parseSection(lines, 'Current session', 'session');

      expect(result.percentage).toBe(0);
    });

    it('should strip timezone from reset text', () => {
      const service = new ClaudeUsageService();
      const lines = ['Current session', '65% left', 'Resets 3pm (America/Los_Angeles)'];
      // @ts-expect-error - accessing private method for testing
      const result = service.parseSection(lines, 'Current session', 'session');

      expect(result.resetText).toBe('Resets 3pm');
      expect(result.resetText).not.toContain('America/Los_Angeles');
    });

    it('should handle case-insensitive section matching', () => {
      const service = new ClaudeUsageService();
      const lines = ['CURRENT SESSION', '65% left', 'Resets in 2h'];
      // @ts-expect-error - accessing private method for testing
      const result = service.parseSection(lines, 'current session', 'session');

      expect(result.percentage).toBe(35);
    });
  });

  describe('parseUsageOutput', () => {
    it('should parse complete usage output', () => {
      const service = new ClaudeUsageService();
      const output = `
Claude Code v1.0.27

Current session
████████████████░░░░ 65% left
Resets in 2h 15m

Current week (all models)
██████████░░░░░░░░░░ 35% left
Resets Jan 15, 3:30pm (America/Los_Angeles)

Current week (Sonnet only)
████████████████████ 80% left
Resets Jan 15, 3:30pm (America/Los_Angeles)
`;
      // @ts-expect-error - accessing private method for testing
      const result = service.parseUsageOutput(output);

      expect(result.sessionPercentage).toBe(35); // 100 - 65
      expect(result.weeklyPercentage).toBe(65); // 100 - 35
      expect(result.sonnetWeeklyPercentage).toBe(20); // 100 - 80
      expect(result.sessionResetText).toContain('Resets in 2h 15m');
      expect(result.weeklyResetText).toContain('Resets Jan 15, 3:30pm');
      expect(result.userTimezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });

    it('should handle output with ANSI codes', () => {
      const service = new ClaudeUsageService();
      const output = `
\x1B[1mClaude Code v1.0.27\x1B[0m

\x1B[1mCurrent session\x1B[0m
\x1B[32m████████████████░░░░\x1B[0m 65% left
Resets in 2h 15m
`;
      // @ts-expect-error - accessing private method for testing
      const result = service.parseUsageOutput(output);

      expect(result.sessionPercentage).toBe(35);
    });

    it('should handle Opus section name', () => {
      const service = new ClaudeUsageService();
      const output = `
Current session
65% left
Resets in 2h

Current week (all models)
35% left
Resets Jan 15, 3pm

Current week (Opus)
90% left
Resets Jan 15, 3pm
`;
      // @ts-expect-error - accessing private method for testing
      const result = service.parseUsageOutput(output);

      expect(result.sonnetWeeklyPercentage).toBe(10); // 100 - 90
    });

    it('should set default values for missing sections', () => {
      const service = new ClaudeUsageService();
      const output = 'Claude Code v1.0.27';
      // @ts-expect-error - accessing private method for testing
      const result = service.parseUsageOutput(output);

      expect(result.sessionPercentage).toBe(0);
      expect(result.weeklyPercentage).toBe(0);
      expect(result.sonnetWeeklyPercentage).toBe(0);
      expect(result.sessionTokensUsed).toBe(0);
      expect(result.sessionLimit).toBe(0);
      expect(result.costUsed).toBeNull();
      expect(result.costLimit).toBeNull();
      expect(result.costCurrency).toBeNull();
    });
  });

  // Note: executeClaudeUsageCommandMac tests removed - the service now uses PTY for all platforms
  // The executeClaudeUsageCommandMac method exists but is dead code (never called)
  describe.skip('executeClaudeUsageCommandMac (deprecated - uses PTY now)', () => {
    it('should be skipped - service now uses PTY for all platforms', () => {
      expect(true).toBe(true);
    });
  });

  describe('executeClaudeUsageCommandPty', () => {
    // Note: The service now uses PTY for all platforms, using process.cwd() as the working directory
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('win32');
    });

    it('should use node-pty and return output', async () => {
      const ptyService = new ClaudeUsageService();
      const mockOutput = `
Current session
65% left
Resets in 2h
`;

      let dataCallback: Function | undefined;
      let exitCallback: Function | undefined;

      const mockPty = {
        onData: vi.fn((callback: Function) => {
          dataCallback = callback;
        }),
        onExit: vi.fn((callback: Function) => {
          exitCallback = callback;
        }),
        write: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      const promise = ptyService.fetchUsageData();

      // Simulate data
      dataCallback!(mockOutput);

      // Simulate successful exit
      exitCallback!({ exitCode: 0 });

      const result = await promise;

      expect(result.sessionPercentage).toBe(35);
      // Service uses process.cwd() for --add-dir
      expect(pty.spawn).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'claude', '--add-dir', process.cwd()],
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
    });

    it('should send escape key after seeing usage data', async () => {
      vi.useFakeTimers();
      const ptyService = new ClaudeUsageService();

      const mockOutput = 'Current session\n65% left';

      let dataCallback: Function | undefined;
      let exitCallback: Function | undefined;

      const mockPty = {
        onData: vi.fn((callback: Function) => {
          dataCallback = callback;
        }),
        onExit: vi.fn((callback: Function) => {
          exitCallback = callback;
        }),
        write: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      const promise = ptyService.fetchUsageData();

      // Simulate seeing usage data
      dataCallback!(mockOutput);

      // Advance time to trigger escape key sending (impl uses 3000ms delay)
      vi.advanceTimersByTime(3100);

      expect(mockPty.write).toHaveBeenCalledWith('\x1b');

      // Complete the promise to avoid unhandled rejection
      exitCallback!({ exitCode: 0 });
      await promise;

      vi.useRealTimers();
    });

    it('should handle authentication errors', async () => {
      const ptyService = new ClaudeUsageService();
      let dataCallback: Function | undefined;
      let exitCallback: Function | undefined;

      const mockPty = {
        onData: vi.fn((callback: Function) => {
          dataCallback = callback;
        }),
        onExit: vi.fn((callback: Function) => {
          exitCallback = callback;
        }),
        write: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      const promise = ptyService.fetchUsageData();

      // Send data containing the authentication error pattern the service looks for
      dataCallback!('"type":"authentication_error"');

      // Trigger the exit handler which checks for auth errors
      exitCallback!({ exitCode: 1 });

      await expect(promise).rejects.toThrow(
        "Claude CLI authentication issue. Please run 'claude logout' and then 'claude login' in your terminal to refresh permissions."
      );
    });

    it('should handle timeout with no data', async () => {
      vi.useFakeTimers();
      const ptyService = new ClaudeUsageService();

      const mockPty = {
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(),
        kill: vi.fn(),
        killed: false,
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      const promise = ptyService.fetchUsageData();

      // Advance time past timeout (45 seconds)
      vi.advanceTimersByTime(46000);

      await expect(promise).rejects.toThrow(
        'The Claude CLI took too long to respond. This can happen if the CLI is waiting for a trust prompt or is otherwise busy.'
      );
      expect(mockPty.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should return data on timeout if data was captured', async () => {
      vi.useFakeTimers();
      const ptyService = new ClaudeUsageService();

      let dataCallback: Function | undefined;

      const mockPty = {
        onData: vi.fn((callback: Function) => {
          dataCallback = callback;
        }),
        onExit: vi.fn(),
        write: vi.fn(),
        kill: vi.fn(),
        killed: false,
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      const promise = ptyService.fetchUsageData();

      // Simulate receiving usage data
      dataCallback!('Current session\n65% left\nResets in 2h');

      // Advance time past timeout (45 seconds)
      vi.advanceTimersByTime(46000);

      // Should resolve with data instead of rejecting
      const result = await promise;
      expect(result.sessionPercentage).toBe(35); // 100 - 65
      expect(mockPty.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should send SIGTERM after ESC if process does not exit', async () => {
      vi.useFakeTimers();
      // Mock Unix platform to test SIGTERM behavior (Windows calls kill() without signal)
      vi.mocked(os.platform).mockReturnValue('darwin');
      const ptyService = new ClaudeUsageService();

      let dataCallback: Function | undefined;

      const mockPty = {
        onData: vi.fn((callback: Function) => {
          dataCallback = callback;
        }),
        onExit: vi.fn(),
        write: vi.fn(),
        kill: vi.fn(),
        killed: false,
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      ptyService.fetchUsageData();

      // Simulate seeing usage data
      dataCallback!('Current session\n65% left');

      // Advance 3s to trigger ESC (impl uses 3000ms delay)
      vi.advanceTimersByTime(3100);
      expect(mockPty.write).toHaveBeenCalledWith('\x1b');

      // Advance another 2s to trigger SIGTERM fallback
      vi.advanceTimersByTime(2100);
      expect(mockPty.kill).toHaveBeenCalledWith('SIGTERM');

      vi.useRealTimers();
    });
  });
});
