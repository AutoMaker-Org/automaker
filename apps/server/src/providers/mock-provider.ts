/**
 * Mock Provider - No-op AI provider for E2E and CI testing
 *
 * When AUTOMAKER_MOCK_AGENT=true, the server uses this provider instead of
 * real backends (Claude, Codex, etc.) so tests never call external APIs.
 */

import type { ExecuteOptions } from '@automaker/types';
import { BaseProvider } from './base-provider.js';
import type { ProviderMessage, InstallationStatus, ModelDefinition } from './types.js';

const MOCK_TEXT = 'Mock agent output for testing.';

export class MockProvider extends BaseProvider {
  getName(): string {
    return 'mock';
  }

  async *executeQuery(_options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    yield {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: MOCK_TEXT }],
      },
    };
    yield {
      type: 'result',
      subtype: 'success',
    };
  }

  async detectInstallation(): Promise<InstallationStatus> {
    return {
      installed: true,
      method: 'sdk',
      hasApiKey: true,
      authenticated: true,
    };
  }

  getAvailableModels(): ModelDefinition[] {
    return [
      {
        id: 'mock-model',
        name: 'Mock Model',
        modelString: 'mock-model',
        provider: 'mock',
        description: 'Mock model for testing',
      },
    ];
  }
}
