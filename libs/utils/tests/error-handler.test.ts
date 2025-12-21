import { describe, it, expect } from "vitest";
import {
  isAbortError,
  isCancellationError,
  isAuthenticationError,
  classifyError,
  getUserFriendlyErrorMessage,
} from "../src/error-handler";

describe("error-handler.ts", () => {
  describe("isAbortError", () => {
    it("should return true for Error with name 'AbortError'", () => {
      const error = new Error("Operation aborted");
      error.name = "AbortError";
      expect(isAbortError(error)).toBe(true);
    });

    it("should return true for Error with message containing 'abort'", () => {
      const error = new Error("Request was aborted");
      expect(isAbortError(error)).toBe(true);
    });

    it("should return false for regular Error", () => {
      const error = new Error("Something went wrong");
      expect(isAbortError(error)).toBe(false);
    });

    it("should return false for non-Error values", () => {
      expect(isAbortError("abort")).toBe(false);
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
      expect(isAbortError({})).toBe(false);
    });

    it("should handle Error with both AbortError name and abort message", () => {
      const error = new Error("abort");
      error.name = "AbortError";
      expect(isAbortError(error)).toBe(true);
    });
  });

  describe("isCancellationError", () => {
    it("should return true for 'cancelled' message", () => {
      expect(isCancellationError("Operation cancelled")).toBe(true);
      expect(isCancellationError("CANCELLED")).toBe(true);
    });

    it("should return true for 'canceled' message (US spelling)", () => {
      expect(isCancellationError("Operation canceled")).toBe(true);
      expect(isCancellationError("CANCELED")).toBe(true);
    });

    it("should return true for 'stopped' message", () => {
      expect(isCancellationError("Process stopped")).toBe(true);
      expect(isCancellationError("STOPPED")).toBe(true);
    });

    it("should return true for 'aborted' message", () => {
      expect(isCancellationError("Request aborted")).toBe(true);
      expect(isCancellationError("ABORTED")).toBe(true);
    });

    it("should return false for non-cancellation messages", () => {
      expect(isCancellationError("Something went wrong")).toBe(false);
      expect(isCancellationError("Error occurred")).toBe(false);
      expect(isCancellationError("")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isCancellationError("CaNcElLeD")).toBe(true);
      expect(isCancellationError("StOpPeD")).toBe(true);
    });
  });

  describe("isAuthenticationError", () => {
    it("should return true for 'Authentication failed' message", () => {
      expect(isAuthenticationError("Authentication failed")).toBe(true);
    });

    it("should return true for 'Invalid API key' message", () => {
      expect(isAuthenticationError("Invalid API key provided")).toBe(true);
    });

    it("should return true for 'authentication_failed' message", () => {
      expect(isAuthenticationError("Error: authentication_failed")).toBe(true);
    });

    it("should return true for 'Fix external API key' message", () => {
      expect(isAuthenticationError("Fix external API key configuration")).toBe(true);
    });

    it("should return false for non-authentication errors", () => {
      expect(isAuthenticationError("Something went wrong")).toBe(false);
      expect(isAuthenticationError("Network error")).toBe(false);
      expect(isAuthenticationError("")).toBe(false);
    });

    it("should be case-sensitive", () => {
      expect(isAuthenticationError("authentication failed")).toBe(false);
      expect(isAuthenticationError("AUTHENTICATION FAILED")).toBe(false);
    });
  });

  describe("classifyError", () => {
    it("should classify authentication errors", () => {
      const error = new Error("Authentication failed");
      const result = classifyError(error);

      expect(result.type).toBe("authentication");
      expect(result.isAuth).toBe(true);
      expect(result.isAbort).toBe(false);
      expect(result.isCancellation).toBe(false);
      expect(result.message).toBe("Authentication failed");
      expect(result.originalError).toBe(error);
    });

    it("should classify abort errors", () => {
      const error = new Error("aborted");
      const result = classifyError(error);

      expect(result.type).toBe("abort");
      expect(result.isAbort).toBe(true);
      expect(result.isAuth).toBe(false);
      expect(result.message).toBe("aborted");
    });

    it("should classify AbortError by name", () => {
      const error = new Error("Request cancelled");
      error.name = "AbortError";
      const result = classifyError(error);

      expect(result.type).toBe("abort");
      expect(result.isAbort).toBe(true);
    });

    it("should classify cancellation errors", () => {
      const error = new Error("Operation cancelled");
      const result = classifyError(error);

      expect(result.type).toBe("cancellation");
      expect(result.isCancellation).toBe(true);
      expect(result.isAbort).toBe(false);
    });

    it("should classify execution errors (regular Error)", () => {
      const error = new Error("Something went wrong");
      const result = classifyError(error);

      expect(result.type).toBe("execution");
      expect(result.isAuth).toBe(false);
      expect(result.isAbort).toBe(false);
      expect(result.isCancellation).toBe(false);
    });

    it("should classify unknown errors (non-Error)", () => {
      const result = classifyError("string error");

      expect(result.type).toBe("unknown");
      expect(result.message).toBe("string error");
    });

    it("should handle null/undefined errors", () => {
      const result1 = classifyError(null);
      expect(result1.type).toBe("unknown");
      expect(result1.message).toBe("Unknown error");

      const result2 = classifyError(undefined);
      expect(result2.type).toBe("unknown");
      expect(result2.message).toBe("Unknown error");
    });

    it("should prioritize authentication over abort", () => {
      const error = new Error("Authentication failed - aborted");
      const result = classifyError(error);

      expect(result.type).toBe("authentication");
      expect(result.isAuth).toBe(true);
      expect(result.isAbort).toBe(true); // Both flags can be true
    });

    it("should prioritize abort over cancellation", () => {
      const error = new Error("Request cancelled");
      error.name = "AbortError";
      const result = classifyError(error);

      expect(result.type).toBe("abort");
      expect(result.isAbort).toBe(true);
      expect(result.isCancellation).toBe(true); // Both flags can be true
    });

    it("should convert object errors to string", () => {
      const result = classifyError({ code: 500, message: "Server error" });
      expect(result.message).toContain("Object");
    });

    it("should convert number errors to string", () => {
      const result = classifyError(404);
      expect(result.message).toBe("404");
      expect(result.type).toBe("unknown");
    });
  });

  describe("getUserFriendlyErrorMessage", () => {
    it("should return friendly message for abort errors", () => {
      const error = new Error("abort");
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe("Operation was cancelled");
    });

    it("should return friendly message for AbortError by name", () => {
      const error = new Error("Something");
      error.name = "AbortError";
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe("Operation was cancelled");
    });

    it("should return friendly message for authentication errors", () => {
      const error = new Error("Authentication failed");
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe("Authentication failed. Please check your API key.");
    });

    it("should prioritize abort message over auth", () => {
      const error = new Error("Authentication failed - abort");
      const message = getUserFriendlyErrorMessage(error);

      // Auth is checked first in classifyError, but abort check happens before auth in getUserFriendlyErrorMessage
      expect(message).toBe("Operation was cancelled");
    });

    it("should return original message for other errors", () => {
      const error = new Error("Network timeout");
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe("Network timeout");
    });

    it("should handle non-Error values", () => {
      expect(getUserFriendlyErrorMessage("string error")).toBe("string error");
      expect(getUserFriendlyErrorMessage(null)).toBe("Unknown error");
      expect(getUserFriendlyErrorMessage(undefined)).toBe("Unknown error");
    });

    it("should return original message for cancellation errors", () => {
      const error = new Error("Operation cancelled by user");
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe("Operation cancelled by user");
    });

    it("should handle Error without message", () => {
      const error = new Error();
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe("");
    });
  });
});
