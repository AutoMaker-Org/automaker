/**
 * POST /test-provider endpoint - Test AI provider by writing a simple file
 *
 * This endpoint tests the configured provider by asking it to write
 * a "Hello World" file to /tmp/hello.md
 */

import type { Request, Response } from 'express';
import { ProviderFactory } from '../../../providers/provider-factory.js';
import { getErrorMessage, logError } from '../common.js';

export function createTestProviderHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const { provider: requestedProvider } = req.body || {};

    try {
      // Get the provider to use
      const providerName = requestedProvider || ProviderFactory.getDefaultProvider();
      const provider = ProviderFactory.getProviderByName(providerName);

      if (!provider) {
        res.status(400).json({
          success: false,
          error: `Unknown provider: ${providerName}`,
        });
        return;
      }

      console.log(`[TestProvider] Testing provider: ${providerName}`);

      // Check if provider is installed
      const installStatus = await provider.detectInstallation();
      if (!installStatus.installed) {
        res.json({
          success: false,
          provider: providerName,
          error: `${providerName} is not installed`,
          installStatus,
        });
        return;
      }

      // Define the test prompt
      const providerLabel =
        providerName === 'cursor'
          ? 'Cursor CLI'
          : providerName === 'opencode'
            ? 'OpenCode CLI'
            : providerName === 'codex'
              ? 'Codex CLI'
              : 'Claude SDK';

      const testPrompt = `Create a file at /tmp/hello.md with the following content:

# Hello World

This file was created by **${providerLabel}** on ${new Date().toISOString()}.

## Test Successful! 🎉

The AI provider integration is working correctly.
`;

      // Execute the query
      let output = '';
      let hasError = false;
      let errorMessage = '';

      const model =
        providerName === 'cursor'
          ? 'auto'
          : providerName === 'opencode'
            ? 'glm4.7'
            : providerName === 'codex'
              ? 'gpt-5.2-codex'
              : 'claude-sonnet-4-20250514';

      try {
        for await (const message of provider.executeQuery({
          prompt: testPrompt,
          model,
          cwd: '/tmp',
          maxTurns: 5,
        })) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                output += block.text;
              }
            }
          } else if (message.type === 'error') {
            hasError = true;
            errorMessage = message.error || 'Unknown error';
          } else if (message.type === 'result') {
            if (message.subtype === 'error') {
              hasError = true;
              errorMessage = message.error || 'Execution failed';
            } else {
              output += message.result || '';
            }
          }
        }
      } catch (error) {
        hasError = true;
        errorMessage = getErrorMessage(error);
      }

      // Check if file was created
      const fs = await import('fs/promises');
      let fileCreated = false;
      let fileContent = '';
      try {
        fileContent = await fs.readFile('/tmp/hello.md', 'utf-8');
        fileCreated = true;
      } catch {
        // File not created
      }

      res.json({
        success: !hasError && fileCreated,
        provider: providerName,
        model,
        fileCreated,
        filePath: '/tmp/hello.md',
        fileContent: fileCreated ? fileContent : undefined,
        output: output.slice(0, 1000), // Limit output size
        error: hasError ? errorMessage : undefined,
      });
    } catch (error) {
      logError(error, 'Test provider failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
