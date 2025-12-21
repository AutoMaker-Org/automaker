import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  spawnJSONLProcess,
  spawnProcess,
  type SubprocessOptions,
} from "../src/subprocess";
import * as cp from "child_process";
import { EventEmitter } from "events";
import { Readable } from "stream";

vi.mock("child_process");

/**
 * Helper to collect all items from an async generator
 */
async function collectAsyncGenerator<T>(
  generator: AsyncGenerator<T>
): Promise<T[]> {
  const results: T[] = [];
  for await (const item of generator) {
    results.push(item);
  }
  return results;
}

describe("subprocess.ts", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
  });

  /**
   * Helper to create a mock ChildProcess with stdout/stderr streams
   */
  function createMockProcess(config: {
    stdoutLines?: string[];
    stderrLines?: string[];
    exitCode?: number;
    error?: Error;
    delayMs?: number;
  }) {
    const mockProcess = new EventEmitter() as cp.ChildProcess & {
      stdout: Readable;
      stderr: Readable;
      kill: ReturnType<typeof vi.fn>;
    };

    // Create readable streams for stdout and stderr
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });

    mockProcess.stdout = stdout;
    mockProcess.stderr = stderr;
    mockProcess.kill = vi.fn().mockReturnValue(true);

    // Use process.nextTick to ensure readline interface is set up first
    process.nextTick(() => {
      // Emit stderr lines immediately
      if (config.stderrLines) {
        for (const line of config.stderrLines) {
          stderr.emit("data", Buffer.from(line));
        }
      }

      // Emit stdout lines with small delays to ensure readline processes them
      const emitLines = async () => {
        if (config.stdoutLines) {
          for (const line of config.stdoutLines) {
            stdout.push(line + "\n");
            // Small delay to allow readline to process
            await new Promise((resolve) => setImmediate(resolve));
          }
        }

        // Small delay before ending stream
        await new Promise((resolve) => setImmediate(resolve));
        stdout.push(null); // End stdout

        // Small delay before exit
        await new Promise((resolve) =>
          setTimeout(resolve, config.delayMs ?? 10)
        );

        // Emit exit or error
        if (config.error) {
          mockProcess.emit("error", config.error);
        } else {
          mockProcess.emit("exit", config.exitCode ?? 0);
        }
      };

      emitLines();
    });

    return mockProcess;
  }

  describe("spawnJSONLProcess", () => {
    const baseOptions: SubprocessOptions = {
      command: "test-command",
      args: ["arg1", "arg2"],
      cwd: "/test/dir",
    };

    it("should yield parsed JSONL objects line by line", async () => {
      const mockProcess = createMockProcess({
        stdoutLines: [
          '{"type":"start","id":1}',
          '{"type":"progress","value":50}',
          '{"type":"complete","result":"success"}',
        ],
        exitCode: 0,
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      const results = await collectAsyncGenerator(generator);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ type: "start", id: 1 });
      expect(results[1]).toEqual({ type: "progress", value: 50 });
      expect(results[2]).toEqual({ type: "complete", result: "success" });
    });

    it("should skip empty lines", async () => {
      const mockProcess = createMockProcess({
        stdoutLines: [
          '{"type":"first"}',
          "",
          "   ",
          '{"type":"second"}',
        ],
        exitCode: 0,
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      const results = await collectAsyncGenerator(generator);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ type: "first" });
      expect(results[1]).toEqual({ type: "second" });
    });

    it("should yield error for malformed JSON and continue processing", async () => {
      const mockProcess = createMockProcess({
        stdoutLines: [
          '{"type":"valid"}',
          "{invalid json}",
          '{"type":"also_valid"}',
        ],
        exitCode: 0,
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      const results = await collectAsyncGenerator(generator);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ type: "valid" });
      expect(results[1]).toMatchObject({
        type: "error",
        error: expect.stringContaining("Failed to parse output"),
      });
      expect(results[2]).toEqual({ type: "also_valid" });
    });

    it("should collect stderr output", async () => {
      const mockProcess = createMockProcess({
        stdoutLines: ['{"type":"test"}'],
        stderrLines: ["Warning: something happened", "Error: critical issue"],
        exitCode: 0,
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      await collectAsyncGenerator(generator);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("Warning: something happened")
      );
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining("Error: critical issue")
      );
    });

    it("should yield error on non-zero exit code", async () => {
      const mockProcess = createMockProcess({
        stdoutLines: ['{"type":"started"}'],
        stderrLines: ["Process failed with error"],
        exitCode: 1,
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      const results = await collectAsyncGenerator(generator);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ type: "started" });
      expect(results[1]).toMatchObject({
        type: "error",
        error: expect.stringContaining("Process failed with error"),
      });
    });

    it("should yield error with exit code when stderr is empty", async () => {
      const mockProcess = createMockProcess({
        stdoutLines: ['{"type":"test"}'],
        exitCode: 127,
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      const results = await collectAsyncGenerator(generator);

      expect(results).toHaveLength(2);
      expect(results[1]).toMatchObject({
        type: "error",
        error: "Process exited with code 127",
      });
    });

    it("should handle process spawn errors", async () => {
      const mockProcess = createMockProcess({
        error: new Error("Command not found"),
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      const results = await collectAsyncGenerator(generator);

      // When process.on('error') fires, exitCode is null
      // The generator should handle this gracefully
      expect(results).toEqual([]);
    });

    it("should kill process on AbortController signal", async () => {
      const abortController = new AbortController();
      const mockProcess = createMockProcess({
        stdoutLines: ['{"type":"start"}'],
        exitCode: 0,
        delayMs: 100, // Delay to allow abort
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess({
        ...baseOptions,
        abortController,
      });

      // Start consuming the generator
      const promise = collectAsyncGenerator(generator);

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 20);

      await promise;

      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining("Abort signal received")
      );
    });

    it("should spawn process with correct arguments", async () => {
      const mockProcess = createMockProcess({ exitCode: 0 });
      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const options: SubprocessOptions = {
        command: "my-command",
        args: ["--flag", "value"],
        cwd: "/work/dir",
        env: { CUSTOM_VAR: "test" },
      };

      const generator = spawnJSONLProcess(options);
      await collectAsyncGenerator(generator);

      expect(cp.spawn).toHaveBeenCalledWith("my-command", ["--flag", "value"], {
        cwd: "/work/dir",
        env: expect.objectContaining({ CUSTOM_VAR: "test" }),
        stdio: ["ignore", "pipe", "pipe"],
      });
    });

    it("should merge env with process.env", async () => {
      const mockProcess = createMockProcess({ exitCode: 0 });
      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const options: SubprocessOptions = {
        command: "test",
        args: [],
        cwd: "/test",
        env: { CUSTOM: "value" },
      };

      const generator = spawnJSONLProcess(options);
      await collectAsyncGenerator(generator);

      expect(cp.spawn).toHaveBeenCalledWith(
        "test",
        [],
        expect.objectContaining({
          env: expect.objectContaining({
            CUSTOM: "value",
            // Should also include existing process.env
            NODE_ENV: process.env.NODE_ENV,
          }),
        })
      );
    });

    it("should handle complex JSON objects", async () => {
      const complexObject = {
        type: "complex",
        nested: { deep: { value: [1, 2, 3] } },
        array: [{ id: 1 }, { id: 2 }],
        string: 'with "quotes" and \\backslashes',
      };

      const mockProcess = createMockProcess({
        stdoutLines: [JSON.stringify(complexObject)],
        exitCode: 0,
      });

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      const generator = spawnJSONLProcess(baseOptions);
      const results = await collectAsyncGenerator(generator);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(complexObject);
    });
  });

  describe("spawnProcess", () => {
    const baseOptions: SubprocessOptions = {
      command: "test-command",
      args: ["arg1"],
      cwd: "/test",
    };

    it("should collect stdout and stderr", async () => {
      const mockProcess = new EventEmitter() as cp.ChildProcess & {
        stdout: Readable;
        stderr: Readable;
        kill: ReturnType<typeof vi.fn>;
      };
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });

      mockProcess.stdout = stdout;
      mockProcess.stderr = stderr;
      mockProcess.kill = vi.fn().mockReturnValue(true);

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      setTimeout(() => {
        stdout.push("line 1\n");
        stdout.push("line 2\n");
        stdout.push(null);

        stderr.push("error 1\n");
        stderr.push("error 2\n");
        stderr.push(null);

        mockProcess.emit("exit", 0);
      }, 10);

      const result = await spawnProcess(baseOptions);

      expect(result.stdout).toBe("line 1\nline 2\n");
      expect(result.stderr).toBe("error 1\nerror 2\n");
      expect(result.exitCode).toBe(0);
    });

    it("should return correct exit code", async () => {
      const mockProcess = new EventEmitter() as cp.ChildProcess & {
        stdout: Readable;
        stderr: Readable;
        kill: ReturnType<typeof vi.fn>;
      };
      mockProcess.stdout = new Readable({ read() {} });
      mockProcess.stderr = new Readable({ read() {} });
      mockProcess.kill = vi.fn().mockReturnValue(true);

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      setTimeout(() => {
        mockProcess.stdout.push(null);
        mockProcess.stderr.push(null);
        mockProcess.emit("exit", 42);
      }, 10);

      const result = await spawnProcess(baseOptions);

      expect(result.exitCode).toBe(42);
    });

    it("should handle process errors", async () => {
      const mockProcess = new EventEmitter() as cp.ChildProcess & {
        stdout: Readable;
        stderr: Readable;
        kill: ReturnType<typeof vi.fn>;
      };
      mockProcess.stdout = new Readable({ read() {} });
      mockProcess.stderr = new Readable({ read() {} });
      mockProcess.kill = vi.fn().mockReturnValue(true);

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      setTimeout(() => {
        mockProcess.emit("error", new Error("Spawn failed"));
      }, 10);

      await expect(spawnProcess(baseOptions)).rejects.toThrow("Spawn failed");
    });

    it("should handle AbortController signal", async () => {
      const abortController = new AbortController();
      const mockProcess = new EventEmitter() as cp.ChildProcess & {
        stdout: Readable;
        stderr: Readable;
        kill: ReturnType<typeof vi.fn>;
      };
      mockProcess.stdout = new Readable({ read() {} });
      mockProcess.stderr = new Readable({ read() {} });
      mockProcess.kill = vi.fn().mockReturnValue(true);

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      setTimeout(() => abortController.abort(), 20);

      await expect(
        spawnProcess({ ...baseOptions, abortController })
      ).rejects.toThrow("Process aborted");

      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("should spawn with correct options", async () => {
      const mockProcess = new EventEmitter() as cp.ChildProcess & {
        stdout: Readable;
        stderr: Readable;
        kill: ReturnType<typeof vi.fn>;
      };
      mockProcess.stdout = new Readable({ read() {} });
      mockProcess.stderr = new Readable({ read() {} });
      mockProcess.kill = vi.fn().mockReturnValue(true);

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      setTimeout(() => {
        mockProcess.stdout.push(null);
        mockProcess.stderr.push(null);
        mockProcess.emit("exit", 0);
      }, 10);

      const options: SubprocessOptions = {
        command: "my-cmd",
        args: ["--verbose"],
        cwd: "/my/dir",
        env: { MY_VAR: "value" },
      };

      await spawnProcess(options);

      expect(cp.spawn).toHaveBeenCalledWith("my-cmd", ["--verbose"], {
        cwd: "/my/dir",
        env: expect.objectContaining({ MY_VAR: "value" }),
        stdio: ["ignore", "pipe", "pipe"],
      });
    });

    it("should handle empty stdout and stderr", async () => {
      const mockProcess = new EventEmitter() as cp.ChildProcess & {
        stdout: Readable;
        stderr: Readable;
        kill: ReturnType<typeof vi.fn>;
      };
      mockProcess.stdout = new Readable({ read() {} });
      mockProcess.stderr = new Readable({ read() {} });
      mockProcess.kill = vi.fn().mockReturnValue(true);

      vi.mocked(cp.spawn).mockReturnValue(mockProcess);

      setTimeout(() => {
        mockProcess.stdout.push(null);
        mockProcess.stderr.push(null);
        mockProcess.emit("exit", 0);
      }, 10);

      const result = await spawnProcess(baseOptions);

      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    });
  });
});
