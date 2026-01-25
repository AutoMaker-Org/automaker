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
  // On Windows, ConPTY requires AttachConsole which fails in Electron/service mode
  // Detect Electron by checking for electron-specific env vars or process properties
  // When in Electron, always use winpty to avoid ConPTY's AttachConsole errors
  private isElectron =
    !!(process.versions && (process.versions as Record<string, string>).electron) ||
    !!process.env.ELECTRON_RUN_AS_NODE;
  private useConptyFallback = false; // Track if we need to use winpty fallback on Windows

  /**
   * Kill a PTY process with platform-specific handling.
   * Windows doesn't support Unix signals like SIGTERM, so we call kill() without arguments.
   * On Unix-like systems (macOS, Linux), we can specify the signal.
   *
   * @param ptyProcess - The PTY process to kill
   * @param signal - The signal to send on Unix-like systems (default: 'SIGTERM')
   */
  private killPtyProcess(ptyProcess: pty.IPty, signal: string = 'SIGTERM'): void {
    if (this.isWindows) {
      ptyProcess.kill();
    } else {
      ptyProcess.kill(signal);
    }
  }

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
   * Uses node-pty on all platforms for consistency
   */
  private executeClaudeUsageCommand(): Promise<string> {
    // Use node-pty on all platforms - it's more reliable than expect on macOS
    return this.executeClaudeUsageCommandPty();
  }

  /**
   * macOS implementation using 'expect' command
   */
  private executeClaudeUsageCommandMac(): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      // Use current working directory - likely already trusted by Claude CLI
      const workingDirectory = process.cwd();

      // Use 'expect' with an inline script to run claude /usage with a PTY
      // Running from cwd which should already be trusted
      const expectScript = `
        set timeout 30
        spawn claude /usage

        # Wait for usage data or handle trust prompt if needed
        expect {
          -re "Ready to code|permission to work|Do you want to work" {
            # Trust prompt appeared - send Enter to approve
            sleep 1
            send "\\r"
            exp_continue
          }
          "Current session" {
            # Usage data appeared - wait for full output, then exit
            sleep 3
            send "\\x1b"
          }
          "% left" {
            # Usage percentage appeared
            sleep 3
            send "\\x1b"
          }
          timeout {
            send "\\x1b"
          }
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
      let hasSeenTrustPrompt = false;

      // Use current working directory (project dir) - most likely already trusted by Claude CLI
      const workingDirectory = process.cwd();

      // Use platform-appropriate shell and command
      const shell = this.isWindows ? 'cmd.exe' : '/bin/sh';
      // Use --add-dir to whitelist the current directory and bypass the trust prompt
      // We don't pass /usage here, we'll type it into the REPL
      const args = this.isWindows
        ? ['/c', 'claude', '--add-dir', workingDirectory]
        : ['-c', `claude --add-dir "${workingDirectory}"`];

      // Using 'any' for ptyProcess because node-pty types don't include 'killed' property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ptyProcess: any = null;

      // Build PTY spawn options
      const ptyOptions: pty.IPtyForkOptions = {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: workingDirectory,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
        } as Record<string, string>,
      };

      // On Windows, always use winpty instead of ConPTY
      // ConPTY requires AttachConsole which fails in many contexts:
      // - Electron apps without a console
      // - VS Code integrated terminal
      // - Spawned from other applications
      // The error happens in a subprocess so we can't catch it - must proactively disable
      if (this.isWindows) {
        (ptyOptions as pty.IWindowsPtyForkOptions).useConpty = false;
        logger.info(
          '[executeClaudeUsageCommandPty] Using winpty on Windows (ConPTY disabled for compatibility)'
        );
      }

      try {
        ptyProcess = pty.spawn(shell, args, ptyOptions);
      } catch (spawnError) {
        const errorMessage = spawnError instanceof Error ? spawnError.message : String(spawnError);

        // Check for Windows ConPTY-specific errors
        if (this.isWindows && errorMessage.includes('AttachConsole failed')) {
          // ConPTY failed - try winpty fallback
          if (!this.useConptyFallback) {
            logger.warn(
              '[executeClaudeUsageCommandPty] ConPTY AttachConsole failed, retrying with winpty fallback'
            );
            this.useConptyFallback = true;

            try {
              (ptyOptions as pty.IWindowsPtyForkOptions).useConpty = false;
              ptyProcess = pty.spawn(shell, args, ptyOptions);
              logger.info(
                '[executeClaudeUsageCommandPty] Successfully spawned with winpty fallback'
              );
            } catch (fallbackError) {
              const fallbackMessage =
                fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
              logger.error(
                '[executeClaudeUsageCommandPty] Winpty fallback also failed:',
                fallbackMessage
              );
              reject(
                new Error(
                  `Windows PTY unavailable: Both ConPTY and winpty failed. This typically happens when running in Electron without a console. ConPTY error: ${errorMessage}. Winpty error: ${fallbackMessage}`
                )
              );
              return;
            }
          } else {
            logger.error('[executeClaudeUsageCommandPty] Winpty fallback failed:', errorMessage);
            reject(
              new Error(
                `Windows PTY unavailable: ${errorMessage}. The application is running without console access (common in Electron). Try running from a terminal window.`
              )
            );
            return;
          }
        } else {
          logger.error('[executeClaudeUsageCommandPty] Failed to spawn PTY:', errorMessage);
          reject(
            new Error(
              `Unable to access terminal: ${errorMessage}. Claude CLI may not be available or PTY support is limited in this environment.`
            )
          );
          return;
        }
      }

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (ptyProcess && !ptyProcess.killed) {
            this.killPtyProcess(ptyProcess);
          }
          // Don't fail if we have data - return it instead
          if (output.includes('Current session')) {
            resolve(output);
          } else if (hasSeenTrustPrompt) {
            // Trust prompt was shown but we couldn't auto-approve it
            reject(
              new Error(
                'TRUST_PROMPT_PENDING: Claude CLI is waiting for folder permission. Please run "claude" in your terminal and approve access to continue.'
              )
            );
          } else {
            reject(
              new Error(
                'The Claude CLI took too long to respond. This can happen if the CLI is waiting for a trust prompt or is otherwise busy.'
              )
            );
          }
        }
      }, 45000); // 45 second timeout

      let hasSentCommand = false;
      let hasApprovedTrust = false;

      ptyProcess.onData((data: string) => {
        output += data;

        // Strip ANSI codes for easier matching
        // eslint-disable-next-line no-control-regex
        const cleanOutput = output.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

        // Check for specific authentication/permission errors
        // Must be very specific to avoid false positives from garbled terminal encoding
        // Removed permission_error check as it was causing false positives with winpty encoding
        const authChecks = {
          oauth: cleanOutput.includes('OAuth token does not meet scope requirement'),
          tokenExpired: cleanOutput.includes('token_expired'),
          // Only match if it looks like a JSON API error response
          authError:
            cleanOutput.includes('"type":"authentication_error"') ||
            cleanOutput.includes('"type": "authentication_error"'),
        };
        const hasAuthError = authChecks.oauth || authChecks.tokenExpired || authChecks.authError;

        if (hasAuthError) {
          if (!settled) {
            settled = true;
            if (ptyProcess && !ptyProcess.killed) {
              this.killPtyProcess(ptyProcess);
            }
            reject(
              new Error(
                "Claude CLI authentication issue. Please run 'claude logout' and then 'claude login' in your terminal to refresh permissions."
              )
            );
          }
          return;
        }

        // Check if we've seen the usage data (look for "Current session" or the TUI Usage header)
        // Also check for percentage patterns that appear in usage output
        const hasUsageIndicators =
          cleanOutput.includes('Current session') ||
          (cleanOutput.includes('Usage') && cleanOutput.includes('% left')) ||
          // Additional patterns for winpty - look for percentage patterns
          /\d+%\s*(left|used|remaining)/i.test(cleanOutput) ||
          cleanOutput.includes('Resets in') ||
          cleanOutput.includes('Current week');

        if (!hasSeenUsageData && hasUsageIndicators) {
          hasSeenUsageData = true;
          // Wait for full output, then send escape to exit
          setTimeout(() => {
            if (!settled && ptyProcess && !ptyProcess.killed) {
              ptyProcess.write('\x1b'); // Send escape key

              // Fallback: if ESC doesn't exit (Linux), use SIGTERM after 2s
              // Windows doesn't support signals, so killPtyProcess handles platform differences
              setTimeout(() => {
                if (!settled && ptyProcess && !ptyProcess.killed) {
                  this.killPtyProcess(ptyProcess);
                }
              }, 2000);
            }
          }, 3000);
        }

        // Handle Trust Dialog - multiple variants:
        // - "Do you want to work in this folder?"
        // - "Ready to code here?" / "I'll need permission to work with your files"
        // Since we are running in cwd (project dir), it is safe to approve.
        if (
          !hasApprovedTrust &&
          (cleanOutput.includes('Do you want to work in this folder?') ||
            cleanOutput.includes('Ready to code here') ||
            cleanOutput.includes('permission to work with your files'))
        ) {
          hasApprovedTrust = true;
          hasSeenTrustPrompt = true;
          // Wait a tiny bit to ensure prompt is ready, then send Enter
          setTimeout(() => {
            if (!settled && ptyProcess && !ptyProcess.killed) {
              ptyProcess.write('\r');
            }
          }, 1000);
        }

        // Detect REPL prompt and send /usage command
        // On Windows with winpty, Unicode prompt char ❯ gets garbled, so also check for ASCII indicators
        const isReplReady =
          cleanOutput.includes('❯') ||
          cleanOutput.includes('? for shortcuts') ||
          // Fallback for winpty garbled encoding - detect CLI welcome screen elements
          (cleanOutput.includes('Welcome back') && cleanOutput.includes('Claude')) ||
          (cleanOutput.includes('Tips for getting started') && cleanOutput.includes('Claude')) ||
          // Detect model indicator which appears when REPL is ready
          (cleanOutput.includes('Opus') && cleanOutput.includes('Claude API')) ||
          (cleanOutput.includes('Sonnet') && cleanOutput.includes('Claude API'));

        if (!hasSentCommand && isReplReady) {
          hasSentCommand = true;
          // Wait for REPL to fully settle
          setTimeout(() => {
            if (!settled && ptyProcess && !ptyProcess.killed) {
              // Send command with carriage return
              ptyProcess.write('/usage\r');

              // Send another enter after 1 second to confirm selection if autocomplete menu appeared
              setTimeout(() => {
                if (!settled && ptyProcess && !ptyProcess.killed) {
                  ptyProcess.write('\r');
                }
              }, 1200);
            }
          }, 1500);
        }

        // Fallback: if we see "Esc to cancel" but haven't seen usage data yet
        if (
          !hasSeenUsageData &&
          cleanOutput.includes('Esc to cancel') &&
          !cleanOutput.includes('Do you want to work in this folder?')
        ) {
          setTimeout(() => {
            if (!settled && ptyProcess && !ptyProcess.killed) {
              ptyProcess.write('\x1b'); // Send escape key
            }
          }, 5000);
        }
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;

        // Check for auth errors - must be specific to avoid false positives
        // Removed permission_error check as it was causing false positives with winpty encoding
        if (output.includes('token_expired') || output.includes('"type":"authentication_error"')) {
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
   * Handles CSI, OSC, and other common ANSI sequences
   */
  private stripAnsiCodes(text: string): string {
    // First strip ANSI sequences (colors, etc) and handle CR
    // eslint-disable-next-line no-control-regex
    let clean = text
      // CSI sequences: ESC [ ... (letter or @)
      .replace(/\x1B\[[0-9;?]*[A-Za-z@]/g, '')
      // OSC sequences: ESC ] ... terminated by BEL, ST, or another ESC
      .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)?/g, '')
      // Other ESC sequences: ESC (letter)
      .replace(/\x1B[A-Za-z]/g, '')
      // Carriage returns: replace with newline to avoid concatenation
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // Handle backspaces (\x08) by applying them
    // If we encounter a backspace, remove the character before it
    while (clean.includes('\x08')) {
      clean = clean.replace(/[^\x08]\x08/, '');
      clean = clean.replace(/^\x08+/, '');
    }

    // Explicitly strip known "Synchronized Output" and "Window Title" garbage
    // even if ESC is missing (seen in some environments)
    clean = clean
      .replace(/\[\?2026[hl]/g, '') // CSI ? 2026 h/l
      .replace(/\]0;[^\x07]*\x07/g, '') // OSC 0; Title BEL
      .replace(/\]0;.*?(\[\?|$)/g, ''); // OSC 0; Title ... (unterminated or hit next sequence)

    // Strip remaining non-printable control characters (except newline \n)
    // ASCII 0-8, 11-31, 127
    clean = clean.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');

    return clean;
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
    let percentage: number | null = null;
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
      return { percentage: 0, resetTime, resetText };
    }

    // Look at the lines following the section header (within a window of 5 lines)
    const searchWindow = lines.slice(sectionIndex, sectionIndex + 5);

    for (const line of searchWindow) {
      // Extract percentage - only take the first match (avoid picking up next section's data)
      // Use null to track "not found" since 0% is a valid percentage (100% left = 0% used)
      if (percentage === null) {
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
        // Only extract the part starting from "Resets" (or "Reset") to avoid garbage prefixes
        const match = line.match(/(Resets?.*)$/i);
        // If regex fails despite 'includes', likely a complex string issues - verify match before using line
        // Only fallback to line if it's reasonably short/clean, otherwise skip it to avoid showing garbage
        if (match) {
          resetText = match[1];
        }
      }
    }

    // Parse the reset time if we found one
    if (resetText) {
      // Clean up resetText: remove percentage info if it was matched on the same line
      // e.g. "46%used Resets5:59pm" -> " Resets5:59pm"
      resetText = resetText.replace(/(\d{1,3})\s*%\s*(left|used|remaining)/i, '').trim();

      // Ensure space after "Resets" if missing (e.g. "Resets5:59pm" -> "Resets 5:59pm")
      resetText = resetText.replace(/(resets?)(\d)/i, '$1 $2');

      resetTime = this.parseResetTime(resetText, type);
      // Strip timezone like "(Asia/Dubai)" from the display text
      resetText = resetText.replace(/\s*\([A-Za-z_\/]+\)\s*$/, '').trim();
    }

    return { percentage: percentage ?? 0, resetTime, resetText };
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
    const simpleTimeMatch = text.match(/resets\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
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
    // The regex explicitly matches only valid 3-letter month abbreviations to avoid
    // matching words like "Resets" when there's no space separator.
    // Optional "resets\s*" prefix handles cases with or without space after "Resets"
    const dateMatch = text.match(
      /(?:resets\s*)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+at\s+|\s*,?\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
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
