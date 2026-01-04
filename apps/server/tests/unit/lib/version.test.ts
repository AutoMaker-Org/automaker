import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

const PACKAGE_VERSION = '1.2.3';
const DEFAULT_VERSION = '0.0.0';
const WARNING_MESSAGE = 'Failed to read version from package.json:';
const PACKAGE_JSON = JSON.stringify({ version: PACKAGE_VERSION });
const READ_ERROR_MESSAGE = 'read failed';

describe('version.ts', () => {
  let warnSpy: ReturnType<typeof vi.spyOn> | null;

  beforeEach(() => {
    vi.resetModules();
    warnSpy = null;
    vi.mocked(readFileSync).mockReset();
  });

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  it('should return package.json version and cache it', async () => {
    const readFileMock = vi.mocked(readFileSync);
    readFileMock.mockReturnValue(PACKAGE_JSON);

    const { getVersion } = await import('@/lib/version.js');

    expect(getVersion()).toBe(PACKAGE_VERSION);
    expect(getVersion()).toBe(PACKAGE_VERSION);
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it('should return default version and warn on read errors', async () => {
    const readError = new Error(READ_ERROR_MESSAGE);
    const readFileMock = vi.mocked(readFileSync);
    readFileMock.mockImplementation(() => {
      throw readError;
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getVersion } = await import('@/lib/version.js');

    expect(getVersion()).toBe(DEFAULT_VERSION);
    expect(warnSpy).toHaveBeenCalledWith(WARNING_MESSAGE, readError);
  });
});
