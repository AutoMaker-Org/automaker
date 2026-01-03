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
      const windowsService = new ClaudeUsageService(); // Create new service after platform mock

      mockSpawnProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
        return mockSpawnProcess;
      });

      await windowsService.isAvailable();

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

  describe('executeClaudeUsageCommandMac', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.spyOn(process, 'env', 'get').mockReturnValue({ HOME: '/Users/testuser' });
    });

    it('should execute expect script and return output', async () => {
      const mockOutput = `
Current session
65% left
Resets in 2h
`;

      let stdoutCallback: Function;
      let closeCallback: Function;

      mockSpawnProcess.stdout = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'data') {
            stdoutCallback = callback;
          }
        }),
      };
      mockSpawnProcess.stderr = {
        on: vi.fn(),
      };
      mockSpawnProcess.on = vi.fn((event: string, callback: Function) => {
        if (event === 'close') {
          closeCallback = callback;
        }
        return mockSpawnProcess;
      });

      const promise = service.fetchUsageData();

      // Simulate stdout data
      stdoutCallback!(Buffer.from(mockOutput));

      // Simulate successful close
      closeCallback!(0);

      const result = await promise;

      expect(result.sessionPercentage).toBe(35); // 100 - 65
      expect(spawn).toHaveBeenCalledWith(
        'expect',
        expect.arrayContaining(['-c']),
        expect.any(Object)
      );
    });

    it('should handle authentication errors', async () => {
      const mockOutput = 'token_expired';

      let stdoutCallback: Function;
      let closeCallback: Function;

      mockSpawnProcess.stdout = {
        on: vi.fn((event: string, callback: Function) => {
          if (event === 'data') {
            stdoutCallback = callback;
          }
        }),
      };
      mockSpawnProcess.stderr = {
        on: vi.fn(),
      };
      mockSpawnProcess.on = vi.fn((event: string, callback: Function) => {
        if (event === 'close') {
          closeCallback = callback;
        }
        return mockSpawnProcess;
      });

      const promise = service.fetchUsageData();

      stdoutCallback!(Buffer.from(mockOutput));
      closeCallback!(1);

      await expect(promise).rejects.toThrow('Authentication required');
    });

    it('should handle timeout with no data', async () => {
      vi.useFakeTimers();

      mockSpawnProcess.stdout = {
        on: vi.fn(),
      };
      mockSpawnProcess.stderr = {
        on: vi.fn(),
      };
      mockSpawnProcess.on = vi.fn(() => mockSpawnProcess);
      mockSpawnProcess.kill = vi.fn();

      const promise = service.fetchUsageData();

      // Advance time past timeout (30 seconds)
      vi.advanceTimersByTime(31000);

      await expect(promise).rejects.toThrow('Command timed out');

      vi.useRealTimers();
    });
  });

  describe('executeClaudeUsageCommandWindows', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\testuser');
      vi.spyOn(process, 'env', 'get').mockReturnValue({ USERPROFILE: 'C:\\Users\\testuser' });
    });

    it('should use node-pty on Windows and return output', async () => {
      const windowsService = new ClaudeUsageService(); // Create new service for Windows platform
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

      const promise = windowsService.fetchUsageData();

      // Simulate data
      dataCallback!(mockOutput);

      // Simulate successful exit
      exitCallback!({ exitCode: 0 });

      const result = await promise;

      expect(result.sessionPercentage).toBe(35);
      expect(pty.spawn).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'claude', '/usage'],
        expect.any(Object)
      );
    });

    it('should send escape key after seeing usage data', async () => {
      vi.useFakeTimers();
      const windowsService = new ClaudeUsageService();

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

      const promise = windowsService.fetchUsageData();

      // Simulate seeing usage data
      dataCallback!(mockOutput);

      // Advance time to trigger escape key sending
      vi.advanceTimersByTime(2100);

      expect(mockPty.write).toHaveBeenCalledWith('\x1b');

      // Complete the promise to avoid unhandled rejection
      exitCallback!({ exitCode: 0 });
      await promise;

      vi.useRealTimers();
    });

    it('should handle authentication errors on Windows', async () => {
      const windowsService = new ClaudeUsageService();
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

      const promise = windowsService.fetchUsageData();

      dataCallback!('authentication_error');
      exitCallback!({ exitCode: 1 });

      await expect(promise).rejects.toThrow('Authentication required');
    });

    it('should handle timeout with no data on Windows', async () => {
      vi.useFakeTimers();
      const windowsService = new ClaudeUsageService();

      const mockPty = {
        onData: vi.fn(),
        onExit: vi.fn(),
        write: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      const promise = windowsService.fetchUsageData();

      vi.advanceTimersByTime(31000);

      await expect(promise).rejects.toThrow('Command timed out');
      expect(mockPty.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should return data on timeout if data was captured', async () => {
      vi.useFakeTimers();
      const windowsService = new ClaudeUsageService();

      let dataCallback: Function | undefined;

      const mockPty = {
        onData: vi.fn((callback: Function) => {
          dataCallback = callback;
        }),
        onExit: vi.fn(),
        write: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      const promise = windowsService.fetchUsageData();

      // Simulate receiving usage data
      dataCallback!('Current session\n65% left\nResets in 2h');

      // Advance time past timeout (30 seconds)
      vi.advanceTimersByTime(31000);

      // Should resolve with data instead of rejecting
      const result = await promise;
      expect(result.sessionPercentage).toBe(35); // 100 - 65
      expect(mockPty.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should send SIGTERM after ESC if process does not exit', async () => {
      vi.useFakeTimers();
      const windowsService = new ClaudeUsageService();

      let dataCallback: Function | undefined;

      const mockPty = {
        onData: vi.fn((callback: Function) => {
          dataCallback = callback;
        }),
        onExit: vi.fn(),
        write: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(pty.spawn).mockReturnValue(mockPty as any);

      windowsService.fetchUsageData();

      // Simulate seeing usage data
      dataCallback!('Current session\n65% left');

      // Advance 2s to trigger ESC
      vi.advanceTimersByTime(2100);
      expect(mockPty.write).toHaveBeenCalledWith('\x1b');

      // Advance another 2s to trigger SIGTERM fallback
      vi.advanceTimersByTime(2100);
      expect(mockPty.kill).toHaveBeenCalledWith('SIGTERM');

      vi.useRealTimers();
    });
  });
});
