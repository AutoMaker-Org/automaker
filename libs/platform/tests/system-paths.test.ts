import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getCodexAuthIndicators, getCodexConfigDir } from '../src/system-paths';

const AUTH_FILENAME = 'auth.json';
const CODEX_DIR_NAME = '.codex';
const OPENAI_KEY_NAME = 'OPENAI_API_KEY';

describe('system-paths Codex auth indicators', () => {
  let tempDir: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-auth-test-'));
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tempDir;
    process.env.USERPROFILE = tempDir;
    await fs.mkdir(path.join(tempDir, CODEX_DIR_NAME), { recursive: true });
  });

  afterEach(async () => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    } else {
      delete process.env.USERPROFILE;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects nested OAuth tokens in auth.json', async () => {
    const authPath = path.join(getCodexConfigDir(), AUTH_FILENAME);
    await fs.writeFile(authPath, JSON.stringify({ tokens: { access_token: 'token' } }), 'utf-8');

    const indicators = await getCodexAuthIndicators();
    expect(indicators.hasAuthFile).toBe(true);
    expect(indicators.hasOAuthToken).toBe(true);
    expect(indicators.hasApiKey).toBe(false);
  });

  it('detects OPENAI_API_KEY in auth.json', async () => {
    const authPath = path.join(getCodexConfigDir(), AUTH_FILENAME);
    await fs.writeFile(authPath, JSON.stringify({ [OPENAI_KEY_NAME]: 'sk-test' }), 'utf-8');

    const indicators = await getCodexAuthIndicators();
    expect(indicators.hasAuthFile).toBe(true);
    expect(indicators.hasOAuthToken).toBe(false);
    expect(indicators.hasApiKey).toBe(true);
  });
});
