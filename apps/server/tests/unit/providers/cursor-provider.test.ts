import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { CursorProvider } from '@/providers/cursor-provider.js';
import { collectAsyncGenerator } from '../../utils/helpers.js';
import * as childProcess from 'child_process';

vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
    exec: vi.fn(),
  };
});

describe('cursor-provider.ts buffering', () => {
  let provider: CursorProvider;
  const spawnMock = vi.mocked(childProcess.spawn);

  const createFakeProcess = () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = new PassThrough();
    proc.kill = vi.fn();
    proc.pid = 123;
    return proc;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CursorProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates consecutive assistant text before emitting result', async () => {
    const fakeProcess = createFakeProcess();
    spawnMock.mockReturnValue(fakeProcess as any);

    const messages = [
      {
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: [{ type: 'text', text: 'Hello ' }] },
      },
      {
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: [{ type: 'text', text: 'world' }] },
      },
      { type: 'result' as const },
    ];

    vi.spyOn(provider as any, 'readCursorStream').mockImplementation(async function* () {
      for (const msg of messages) {
        yield msg;
      }
      setTimeout(() => fakeProcess.emit('close', 0, null), 0);
    });
    vi.spyOn(provider as any, 'collectStream').mockResolvedValue('');

    const results = await collectAsyncGenerator(
      provider.executeQuery({ prompt: 'Test', cwd: '/tmp', model: 'auto' })
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });
    expect(results[1]).toEqual({
      type: 'result',
      result: 'Hello world',
    });
  });

  it('flushes buffered text before tool messages and keeps tool intact', async () => {
    const fakeProcess = createFakeProcess();
    spawnMock.mockReturnValue(fakeProcess as any);

    const messages = [
      {
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: [{ type: 'text', text: 'foo' }] },
      },
      {
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: [{ type: 'text', text: 'bar' }] },
      },
      {
        type: 'assistant' as const,
        message: {
          role: 'assistant' as const,
          content: [{ type: 'tool_use', name: 'Read', input: { path: 'file' } }],
        },
      },
    ];

    vi.spyOn(provider as any, 'readCursorStream').mockImplementation(async function* () {
      for (const msg of messages) {
        yield msg;
      }
      setTimeout(() => fakeProcess.emit('close', 0, null), 0);
    });
    vi.spyOn(provider as any, 'collectStream').mockResolvedValue('');

    const results = await collectAsyncGenerator(
      provider.executeQuery({ prompt: 'Test', cwd: '/tmp', model: 'auto' })
    );

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'foobar' }],
      },
    });
    expect(results[1]).toEqual(messages[2]);
    expect(results[2]).toEqual({
      type: 'result',
      subtype: 'success',
      result: 'foobar',
    });
  });

  it('flushes buffered text and emits result when stream ends without explicit result', async () => {
    const fakeProcess = createFakeProcess();
    spawnMock.mockReturnValue(fakeProcess as any);

    const messages = [
      {
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: [{ type: 'text', text: 'Task ' }] },
      },
      {
        type: 'assistant' as const,
        message: { role: 'assistant' as const, content: [{ type: 'text', text: 'done' }] },
      },
    ];

    vi.spyOn(provider as any, 'readCursorStream').mockImplementation(async function* () {
      for (const msg of messages) {
        yield msg;
      }
      setTimeout(() => fakeProcess.emit('close', 0, null), 0);
    });
    vi.spyOn(provider as any, 'collectStream').mockResolvedValue('');

    const results = await collectAsyncGenerator(
      provider.executeQuery({ prompt: 'Test', cwd: '/tmp', model: 'auto' })
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Task done' }],
      },
    });
    expect(results[1]).toEqual({
      type: 'result',
      subtype: 'success',
      result: 'Task done',
    });
  });
});
