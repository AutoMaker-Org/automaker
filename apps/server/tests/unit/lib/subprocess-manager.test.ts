import { describe, it, expect } from 'vitest';
import { spawnJSONLProcess } from '@/lib/subprocess-manager';

const nodeBinary = process.execPath;
const cwd = process.cwd();

describe('spawnJSONLProcess', () => {
  it('parses JSONL output line by line', async () => {
    const script = [
      'console.log(JSON.stringify({ type: "start" }));',
      'console.log(JSON.stringify({ type: "done", ok: true }));',
    ].join('\n');

    const events: Array<{ type: string; ok?: boolean }> = [];
    const stream = spawnJSONLProcess({
      command: nodeBinary,
      args: ['-e', script],
      cwd,
      timeout: 1000,
    });

    for await (const event of stream) {
      events.push(event as { type: string; ok?: boolean });
    }

    expect(events).toEqual([{ type: 'start' }, { type: 'done', ok: true }]);
  });

  it('treats stderr activity as output to prevent idle timeouts', async () => {
    const script = [
      'let count = 0;',
      'const interval = setInterval(() => {',
      '  console.error("tick");',
      '  count += 1;',
      '  if (count >= 3) {',
      '    clearInterval(interval);',
      '    setTimeout(() => process.exit(0), 20);',
      '  }',
      '}, 50);',
    ].join('\n');

    const stream = spawnJSONLProcess({
      command: nodeBinary,
      args: ['-e', script],
      cwd,
      timeout: 250,
    });

    const events: unknown[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toEqual([]);
  });

  it('allows a longer startup timeout before the first output', async () => {
    const script = [
      'setTimeout(() => {',
      '  console.log(JSON.stringify({ ok: true }));',
      '  process.exit(0);',
      '}, 120);',
    ].join('\n');

    const events: Array<{ ok: boolean }> = [];
    const stream = spawnJSONLProcess({
      command: nodeBinary,
      args: ['-e', script],
      cwd,
      timeout: 50,
      startupTimeout: 200,
    });

    for await (const event of stream) {
      events.push(event as { ok: boolean });
    }

    expect(events).toEqual([{ ok: true }]);
  });

  it('times out when there is no stdout or stderr activity', async () => {
    const script = ['setTimeout(() => {', '  process.exit(0);', '}, 400);'].join('\n');

    const stream = spawnJSONLProcess({
      command: nodeBinary,
      args: ['-e', script],
      cwd,
      timeout: 150,
    });

    const run = async () => {
      for await (const _event of stream) {
        // no-op
      }
    };

    await expect(run()).rejects.toThrow('timed out');
  });
});
