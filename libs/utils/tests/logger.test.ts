import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createLogger,
  LogLevel,
  getLogLevel,
  setLogLevel,
} from "../src/logger";

describe("logger.ts", () => {
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleLog: typeof console.log;
  let originalLogLevel: LogLevel;

  beforeEach(() => {
    // Save original console methods and log level
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    originalConsoleLog = console.log;
    originalLogLevel = getLogLevel();

    // Mock console methods
    console.error = vi.fn();
    console.warn = vi.fn();
    console.log = vi.fn();
  });

  afterEach(() => {
    // Restore original console methods and log level
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
    setLogLevel(originalLogLevel);
  });

  describe("createLogger", () => {
    it("should create logger with context prefix", () => {
      const logger = createLogger("TestContext");
      setLogLevel(LogLevel.INFO);

      logger.info("test message");

      expect(console.log).toHaveBeenCalledWith(
        "[TestContext]",
        "test message"
      );
    });

    it("should handle multiple arguments", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.INFO);

      logger.info("message", { data: 123 }, [1, 2, 3]);

      expect(console.log).toHaveBeenCalledWith(
        "[Test]",
        "message",
        { data: 123 },
        [1, 2, 3]
      );
    });
  });

  describe("Log levels", () => {
    it("should log error at ERROR level", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.ERROR);

      logger.error("error message");
      logger.warn("warn message");
      logger.info("info message");
      logger.debug("debug message");

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should log error and warn at WARN level", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.WARN);

      logger.error("error message");
      logger.warn("warn message");
      logger.info("info message");
      logger.debug("debug message");

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should log error, warn, and info at INFO level", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.INFO);

      logger.error("error message");
      logger.warn("warn message");
      logger.info("info message");
      logger.debug("debug message");

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledTimes(1); // Only info, not debug
    });

    it("should log all messages at DEBUG level", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.DEBUG);

      logger.error("error message");
      logger.warn("warn message");
      logger.info("info message");
      logger.debug("debug message");

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledTimes(2); // info + debug
    });
  });

  describe("error method", () => {
    it("should use console.error", () => {
      const logger = createLogger("ErrorTest");
      setLogLevel(LogLevel.ERROR);

      logger.error("error occurred", { code: 500 });

      expect(console.error).toHaveBeenCalledWith(
        "[ErrorTest]",
        "error occurred",
        { code: 500 }
      );
    });

    it("should not log when level is below ERROR", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.ERROR - 1 as LogLevel);

      logger.error("should not appear");

      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("warn method", () => {
    it("should use console.warn", () => {
      const logger = createLogger("WarnTest");
      setLogLevel(LogLevel.WARN);

      logger.warn("warning message");

      expect(console.warn).toHaveBeenCalledWith("[WarnTest]", "warning message");
    });

    it("should not log when level is below WARN", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.ERROR);

      logger.warn("should not appear");

      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("info method", () => {
    it("should use console.log", () => {
      const logger = createLogger("InfoTest");
      setLogLevel(LogLevel.INFO);

      logger.info("info message");

      expect(console.log).toHaveBeenCalledWith("[InfoTest]", "info message");
    });

    it("should not log when level is below INFO", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.WARN);

      logger.info("should not appear");

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe("debug method", () => {
    it("should use console.log with DEBUG prefix", () => {
      const logger = createLogger("DebugTest");
      setLogLevel(LogLevel.DEBUG);

      logger.debug("debug details", { trace: "..." });

      expect(console.log).toHaveBeenCalledWith(
        "[DebugTest]",
        "[DEBUG]",
        "debug details",
        { trace: "..." }
      );
    });

    it("should not log when level is below DEBUG", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.INFO);

      logger.debug("should not appear");

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe("getLogLevel", () => {
    it("should return current log level", () => {
      setLogLevel(LogLevel.DEBUG);
      expect(getLogLevel()).toBe(LogLevel.DEBUG);

      setLogLevel(LogLevel.ERROR);
      expect(getLogLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe("setLogLevel", () => {
    it("should change log level", () => {
      setLogLevel(LogLevel.WARN);
      expect(getLogLevel()).toBe(LogLevel.WARN);

      setLogLevel(LogLevel.DEBUG);
      expect(getLogLevel()).toBe(LogLevel.DEBUG);
    });

    it("should affect subsequent logging", () => {
      const logger = createLogger("Test");

      setLogLevel(LogLevel.ERROR);
      logger.info("should not log");
      expect(console.log).not.toHaveBeenCalled();

      setLogLevel(LogLevel.INFO);
      logger.info("should log");
      expect(console.log).toHaveBeenCalledWith("[Test]", "should log");
    });
  });

  describe("Multiple logger instances", () => {
    it("should maintain separate contexts", () => {
      const logger1 = createLogger("Service1");
      const logger2 = createLogger("Service2");
      setLogLevel(LogLevel.INFO);

      logger1.info("from service 1");
      logger2.info("from service 2");

      expect(console.log).toHaveBeenNthCalledWith(
        1,
        "[Service1]",
        "from service 1"
      );
      expect(console.log).toHaveBeenNthCalledWith(
        2,
        "[Service2]",
        "from service 2"
      );
    });

    it("should share log level setting", () => {
      const logger1 = createLogger("Service1");
      const logger2 = createLogger("Service2");

      setLogLevel(LogLevel.ERROR);

      logger1.info("should not log");
      logger2.info("should not log");

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty context string", () => {
      const logger = createLogger("");
      setLogLevel(LogLevel.INFO);

      logger.info("message");

      expect(console.log).toHaveBeenCalledWith("[]", "message");
    });

    it("should handle context with special characters", () => {
      const logger = createLogger("Test-Service_v2.0");
      setLogLevel(LogLevel.INFO);

      logger.info("message");

      expect(console.log).toHaveBeenCalledWith(
        "[Test-Service_v2.0]",
        "message"
      );
    });

    it("should handle no arguments to log methods", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.INFO);

      logger.info();

      expect(console.log).toHaveBeenCalledWith("[Test]");
    });

    it("should handle complex object arguments", () => {
      const logger = createLogger("Test");
      setLogLevel(LogLevel.INFO);

      const complexObj = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        fn: () => {},
      };

      logger.info("complex", complexObj);

      expect(console.log).toHaveBeenCalledWith("[Test]", "complex", complexObj);
    });
  });
});
