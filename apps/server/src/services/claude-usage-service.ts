import { spawn } from 'child_process';
import * as os from 'os';
import * as pty from 'node-pty';
import { ClaudeUsage } from '../routes/claude/types.js';
import { createLogger } from '@automaker/utils';

/**
 * Claude Usage Service
 *
 * Fetches usage data by executing the Claude CLI's /usage command.
 * This approach doesn't require any API keys - it relies on the user
 * having already authenticated via `claude login`.
 *
 * Platform-specific implementations:
 * - macOS: Uses 'expect' command for PTY
 * - Windows/Linux: Uses node-pty for PTY
 */
const logger = createLogger('ClaudeUsage');

export class ClaudeUsageService {
  private claudeBinary = 'claude';
  private timeout = 30000; // 30 second timeout
  private isWindows = os.platform() === 'win32';
  private isLinux = os.platform() === 'linux';

  /**
   * Check if Claude CLI is available on the system
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkCmd = this.isWindows ? 'where' : 'which';
      const proc = spawn(checkCmd, [this.claudeBinary]);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Fetch usage data by executing the Claude CLI
   */
  async fetchUsageData(): Promise<ClaudeUsage> {
    const output = await this.executeClaudeUsageCommand();
    return this.parseUsageOutput(output);
  }

  /**
   * Execute the claude /usage command and return the output
   * Uses platform-specific PTY implementation
   */
  private executeClaudeUsageCommand(): Promise<string> {
    if (this.isWindows || this.isLinux) {
      return this.executeClaudeUsageCommandPty();
    }
    return this.executeClaudeUsageCommandMac();
  }

  /**
   * macOS implementation using 'expect' command
   */
  private executeClaudeUsageCommandMac(): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      // Use a simple working directory (home or tmp)
      const workingDirectory = process.env.HOME || '/tmp';

      // Use 'expect' with an inline script to run claude /usage with a PTY
      // Wait for "Current session" header, then wait for full output before exiting
      const expectScript = `
        set timeout 20
        spawn claude /usage
        expect {
          "Current session" {
            sleep 2
            send "\\x1b"
          }
          "Esc to cancel" {
            sleep 3
            send "\\x1b"
          }
          timeout {}
          eof {}
        }
        expect eof
      `;

      const proc = spawn('expect', ['-c', expectScript], {
        cwd: workingDirectory,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
        },
      });

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.kill();
          reject(new Error('Command timed out'));
        }
      }, this.timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;

        // Check for authentication errors in output
        if (
          stdout.includes('token_expired') ||
          stdout.includes('authentication_error') ||
          stderr.includes('token_expired') ||
          stderr.includes('authentication_error')
        ) {
          reject(new Error("Authentication required - please run 'claude login'"));
          return;
        }

        // Even if exit code is non-zero, we might have useful output
        if (stdout.trim()) {
          resolve(stdout);
        } else if (code !== 0) {
          reject(new Error(stderr || `Command exited with code ${code}`));
        } else {
          reject(new Error('No output from claude command'));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to execute claude: ${err.message}`));
        }
      });
    });
  }

  /**
   * Windows/Linux implementation using node-pty
   */
  private executeClaudeUsageCommandPty(): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      let settled = false;
      let hasSeenUsageData = false;

      const workingDirectory = this.isWindows
        ? process.env.USERPROFILE || os.homedir() || 'C:\\'
        : process.env.HOME || os.homedir() || '/tmp';

      // Use platform-appropriate shell and command
      const shell = this.isWindows ? 'cmd.exe' : '/bin/sh';
      const args = this.isWindows ? ['/c', 'claude', '/usage'] : ['-c', 'claude /usage'];

      let ptyProcess: any = null;

      try {
        ptyProcess = pty.spawn(shell, args, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: workingDirectory,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
          } as Record<string, string>,
        });
      } catch (spawnError) {
        // pty.spawn() can throw synchronously if the native module fails to load
        // or if PTY is not available in the current environment (e.g., containers without /dev/pts)
        const errorMessage = spawnError instanceof Error ? spawnError.message : String(spawnError);
        logger.error('[executeClaudeUsageCommandPty] Failed to spawn PTY:', errorMessage);

        // Return a user-friendly error instead of crashing
        reject(
          new Error(
            `Unable to access terminal: ${errorMessage}. Claude CLI may not be available or PTY support is limited in this environment.`
          )
        );
        return;
      }

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (ptyProcess && !ptyProcess.killed) {
            ptyProcess.kill();
          }
          // Don't fail if we have data - return it instead
          if (output.includes('Current session')) {
            resolve(output);
          } else {
            reject(new Error('Command timed out'));
          }
        }
      }, this.timeout);

      ptyProcess.onData((data: string) => {
        output += data;

        // Check if we've seen the usage data (look for "Current session")
        if (!hasSeenUsageData && output.includes('Current session')) {
          hasSeenUsageData = true;
          // Wait for full output, then send escape to exit
          setTimeout(() => {
            if (!settled && ptyProcess && !ptyProcess.killed) {
              ptyProcess.write('\x1b'); // Send escape key

              // Fallback: if ESC doesn't exit (Linux), use SIGTERM after 2s
              setTimeout(() => {
                if (!settled && ptyProcess && !ptyProcess.killed) {
                  ptyProcess.kill('SIGTERM');
                }
              }, 2000);
            }
          }, 2000);
        }

        // Fallback: if we see "Esc to cancel" but haven't seen usage data yet
        if (!hasSeenUsageData && output.includes('Esc to cancel')) {
          setTimeout(() => {
            if (!settled && ptyProcess && !ptyProcess.killed) {
              ptyProcess.write('\x1b'); // Send escape key
            }
          }, 3000);
        }
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;

        // Check for authentication errors in output
        if (output.includes('token_expired') || output.includes('authentication_error')) {
          reject(new Error("Authentication required - please run 'claude login'"));
          return;
        }

        if (output.trim()) {
          resolve(output);
        } else if (exitCode !== 0) {
          reject(new Error(`Command exited with code ${exitCode}`));
        } else {
          reject(new Error('No output from claude command'));
        }
      });
    });
  }

  /**
   * Strip ANSI escape codes from text
   */
  private stripAnsiCodes(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
  }

  /**
   * Parse the Claude CLI output to extract usage information
   *
   * Expected output format:
   * ```
   * Claude Code v1.0.27
   *
   * Current session
   * ████████████████░░░░ 65% left
   * Resets in 2h 15m
   *
   * Current week (all models)
   * ██████████░░░░░░░░░░ 35% left
   * Resets Jan 15, 3:30pm (America/Los_Angeles)
   *
   * Current week (Opus)
   * ████████████████████ 80% left
   * Resets Jan 15, 3:30pm (America/Los_Angeles)
   * ```
   */
  private parseUsageOutput(rawOutput: string): ClaudeUsage {
    const output = this.stripAnsiCodes(rawOutput);
    const lines = output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    // Parse session usage
    const sessionData = this.parseSection(lines, 'Current session', 'session');

    // Parse weekly usage (all models)
    const weeklyData = this.parseSection(lines, 'Current week (all models)', 'weekly');

    // Parse Sonnet/Opus usage - try different labels
    let sonnetData = this.parseSection(lines, 'Current week (Sonnet only)', 'sonnet');
    if (sonnetData.percentage === 0) {
      sonnetData = this.parseSection(lines, 'Current week (Sonnet)', 'sonnet');
    }
    if (sonnetData.percentage === 0) {
      sonnetData = this.parseSection(lines, 'Current week (Opus)', 'sonnet');
    }

    return {
      sessionTokensUsed: 0, // Not available from CLI
      sessionLimit: 0, // Not available from CLI
      sessionPercentage: sessionData.percentage,
      sessionResetTime: sessionData.resetTime,
      sessionResetText: sessionData.resetText,

      weeklyTokensUsed: 0, // Not available from CLI
      weeklyLimit: 0, // Not available from CLI
      weeklyPercentage: weeklyData.percentage,
      weeklyResetTime: weeklyData.resetTime,
      weeklyResetText: weeklyData.resetText,

      sonnetWeeklyTokensUsed: 0, // Not available from CLI
      sonnetWeeklyPercentage: sonnetData.percentage,
      sonnetResetText: sonnetData.resetText,

      costUsed: null, // Not available from CLI
      costLimit: null,
      costCurrency: null,

      lastUpdated: new Date().toISOString(),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Parse a section of the usage output to extract percentage and reset time
   */
  private parseSection(
    lines: string[],
    sectionLabel: string,
    type: string
  ): { percentage: number; resetTime: string; resetText: string } {
    let percentage = 0;
    let resetTime = this.getDefaultResetTime(type);
    let resetText = '';

    // Find the LAST occurrence of the section (terminal output has multiple screen refreshes)
    let sectionIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].toLowerCase().includes(sectionLabel.toLowerCase())) {
        sectionIndex = i;
        break;
      }
    }

    if (sectionIndex === -1) {
      return { percentage, resetTime, resetText };
    }

    // Look at the lines following the section header (within a window of 5 lines)
    const searchWindow = lines.slice(sectionIndex, sectionIndex + 5);

    for (const line of searchWindow) {
      // Extract percentage - only take the first match (avoid picking up next section's data)
      if (percentage === 0) {
        const percentMatch = line.match(/(\d{1,3})\s*%\s*(left|used|remaining)/i);
        if (percentMatch) {
          const value = parseInt(percentMatch[1], 10);
          const isUsed = percentMatch[2].toLowerCase() === 'used';
          // Convert "left" to "used" percentage (our UI shows % used)
          percentage = isUsed ? value : 100 - value;
        }
      }

      // Extract reset time - only take the first match
      if (!resetText && line.toLowerCase().includes('reset')) {
        resetText = line;
      }
    }

    // Parse the reset time if we found one
    if (resetText) {
      resetTime = this.parseResetTime(resetText, type);
      // Strip timezone like "(Asia/Dubai)" from the display text
      resetText = resetText.replace(/\s*\([A-Za-z_\/]+\)\s*$/, '').trim();
    }

    return { percentage, resetTime, resetText };
  }

  /**
   * Parse reset time from text like "Resets in 2h 15m", "Resets 11am", or "Resets Dec 22 at 8pm"
   */
  private parseResetTime(text: string, type: string): string {
    const now = new Date();

    // Try to parse duration format: "Resets in 2h 15m" or "Resets in 30m"
    const durationMatch = text.match(
      /(\d+)\s*h(?:ours?)?(?:\s+(\d+)\s*m(?:in)?)?|(\d+)\s*m(?:in)?/i
    );
    if (durationMatch) {
      let hours = 0;
      let minutes = 0;

      if (durationMatch[1]) {
        hours = parseInt(durationMatch[1], 10);
        minutes = durationMatch[2] ? parseInt(durationMatch[2], 10) : 0;
      } else if (durationMatch[3]) {
        minutes = parseInt(durationMatch[3], 10);
      }

      const resetDate = new Date(now.getTime() + (hours * 60 + minutes) * 60 * 1000);
      return resetDate.toISOString();
    }

    // Try to parse simple time-only format: "Resets 11am" or "Resets 3pm"
    const simpleTimeMatch = text.match(/resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (simpleTimeMatch) {
      let hours = parseInt(simpleTimeMatch[1], 10);
      const minutes = simpleTimeMatch[2] ? parseInt(simpleTimeMatch[2], 10) : 0;
      const ampm = simpleTimeMatch[3].toLowerCase();

      // Convert 12-hour to 24-hour
      if (ampm === 'pm' && hours !== 12) {
        hours += 12;
      } else if (ampm === 'am' && hours === 12) {
        hours = 0;
      }

      // Create date for today at specified time
      const resetDate = new Date(now);
      resetDate.setHours(hours, minutes, 0, 0);

      // If time has passed, use tomorrow
      if (resetDate <= now) {
        resetDate.setDate(resetDate.getDate() + 1);
      }
      return resetDate.toISOString();
    }

    // Try to parse date format: "Resets Dec 22 at 8pm" or "Resets Jan 15, 3:30pm"
    const dateMatch = text.match(
      /([A-Za-z]{3,})\s+(\d{1,2})(?:\s+at\s+|\s*,?\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
    );
    if (dateMatch) {
      const monthName = dateMatch[1];
      const day = parseInt(dateMatch[2], 10);
      let hours = parseInt(dateMatch[3], 10);
      const minutes = dateMatch[4] ? parseInt(dateMatch[4], 10) : 0;
      const ampm = dateMatch[5].toLowerCase();

      // Convert 12-hour to 24-hour
      if (ampm === 'pm' && hours !== 12) {
        hours += 12;
      } else if (ampm === 'am' && hours === 12) {
        hours = 0;
      }

      // Parse month name
      const months: Record<string, number> = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };
      const month = months[monthName.toLowerCase().substring(0, 3)];

      if (month !== undefined) {
        let year = now.getFullYear();
        // If the date appears to be in the past, assume next year
        const resetDate = new Date(year, month, day, hours, minutes);
        if (resetDate < now) {
          resetDate.setFullYear(year + 1);
        }
        return resetDate.toISOString();
      }
    }

    // Fallback to default
    return this.getDefaultResetTime(type);
  }

  /**
   * Get default reset time based on usage type
   */
  private getDefaultResetTime(type: string): string {
    const now = new Date();

    if (type === 'session') {
      // Session resets in ~5 hours
      return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString();
    } else {
      // Weekly resets on next Monday around noon
      const result = new Date(now);
      const currentDay = now.getDay();
      let daysUntilMonday = (1 + 7 - currentDay) % 7;
      if (daysUntilMonday === 0) daysUntilMonday = 7;
      result.setDate(result.getDate() + daysUntilMonday);
      result.setHours(12, 59, 0, 0);
      return result.toISOString();
    }
  }
}
