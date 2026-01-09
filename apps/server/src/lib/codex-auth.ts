/**
 * Shared utility for checking Codex CLI authentication status
 *
 * Uses 'codex login status' command to verify authentication.
 * Never assumes authenticated - only returns true if CLI confirms.
 */

import { spawnProcess, getCodexAuthPath } from '@automaker/platform';
import { findCodexCliPath } from '@automaker/platform';
import * as fs from 'fs';

const CODEX_COMMAND = 'codex';
const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';

export interface CodexAuthCheckResult {
  authenticated: boolean;
  method: 'api_key_env' | 'cli_authenticated' | 'none';
}

/**
 * Check Codex authentication status using 'codex login status' command
 *
 * @param cliPath Optional CLI path. If not provided, will attempt to find it.
 * @returns Authentication status and method
 */
export async function checkCodexAuthentication(
  cliPath?: string | null
): Promise<CodexAuthCheckResult> {
  console.log('[CodexAuth] checkCodexAuthentication called with cliPath:', cliPath);

  const resolvedCliPath = cliPath || (await findCodexCliPath());
  const hasApiKey = !!process.env[OPENAI_API_KEY_ENV];

  console.log('[CodexAuth] resolvedCliPath:', resolvedCliPath);
  console.log('[CodexAuth] hasApiKey:', hasApiKey);

  // Debug: Check auth file
  const authFilePath = getCodexAuthPath();
  console.log('[CodexAuth] Auth file path:', authFilePath);
  try {
    const authFileExists = fs.existsSync(authFilePath);
    console.log('[CodexAuth] Auth file exists:', authFileExists);
    if (authFileExists) {
      const authContent = fs.readFileSync(authFilePath, 'utf-8');
      console.log('[CodexAuth] Auth file content:', authContent.substring(0, 500)); // First 500 chars
    }
  } catch (error) {
    console.log('[CodexAuth] Error reading auth file:', error);
  }

  // If CLI is not installed, cannot be authenticated
  if (!resolvedCliPath) {
    console.log('[CodexAuth] No CLI path found, returning not authenticated');
    return { authenticated: false, method: 'none' };
  }

  try {
    console.log('[CodexAuth] Running: ' + resolvedCliPath + ' login status');
    const result = await spawnProcess({
      command: resolvedCliPath || CODEX_COMMAND,
      args: ['login', 'status'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: 'dumb', // Avoid interactive output
      },
    });

    console.log('[CodexAuth] Command result:');
    console.log('[CodexAuth]   exitCode:', result.exitCode);
    console.log('[CodexAuth]   stdout:', JSON.stringify(result.stdout));
    console.log('[CodexAuth]   stderr:', JSON.stringify(result.stderr));

    // Check both stdout and stderr for "logged in" - Codex CLI outputs to stderr
    const combinedOutput = (result.stdout + result.stderr).toLowerCase();
    const isLoggedIn = combinedOutput.includes('logged in');
    console.log('[CodexAuth] isLoggedIn (contains "logged in" in stdout or stderr):', isLoggedIn);

    if (result.exitCode === 0 && isLoggedIn) {
      // Determine auth method based on what we know
      const method = hasApiKey ? 'api_key_env' : 'cli_authenticated';
      console.log('[CodexAuth] Authenticated! method:', method);
      return { authenticated: true, method };
    }

    console.log(
      '[CodexAuth] Not authenticated. exitCode:',
      result.exitCode,
      'isLoggedIn:',
      isLoggedIn
    );
  } catch (error) {
    console.log('[CodexAuth] Error running command:', error);
  }

  console.log('[CodexAuth] Returning not authenticated');
  return { authenticated: false, method: 'none' };
}
