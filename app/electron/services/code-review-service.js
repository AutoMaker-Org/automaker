const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs/promises");

/**
 * Code Review Service - Automated code review for agent-generated changes
 *
 * Runs TypeScript checks, build verification, and pattern analysis
 * to ensure code quality before features are marked as verified.
 */
class CodeReviewService {
  constructor() {
    this.runningReviews = new Map(); // featureId -> { abortController }
  }

  /**
   * Run a code review on a feature
   * @param {string} projectPath - Path to the project
   * @param {string} featureId - Feature ID being reviewed
   * @param {Object} options - Review options
   * @param {string[]} options.checks - Which checks to run ('typescript', 'build', 'patterns')
   * @param {Function} sendToRenderer - Function to send events to renderer
   */
  async runReview(projectPath, featureId, options = {}, sendToRenderer) {
    const { checks = ["typescript", "build", "patterns"] } = options;

    console.log(`[CodeReview] Starting review for feature ${featureId}`);
    console.log(`[CodeReview] Checks to run: ${checks.join(", ")}`);

    // Register this review as running
    const abortController = new AbortController();
    this.runningReviews.set(featureId, { abortController });

    const results = {
      overallPass: true,
      timestamp: new Date().toISOString(),
      checks: [],
    };

    try {
      // Emit start event
      this.emitEvent(sendToRenderer, {
        type: "review_start",
        featureId,
        projectPath,
      });

      // Run each enabled check
      if (checks.includes("typescript")) {
        this.emitEvent(sendToRenderer, {
          type: "review_progress",
          featureId,
          check: "typescript",
          message: "Running TypeScript type check...",
        });

        const typescriptResult = await this.runTypescriptCheck(
          projectPath,
          featureId,
          abortController.signal
        );
        results.checks.push(typescriptResult);

        if (!typescriptResult.passed) {
          results.overallPass = false;
        }
      }

      if (checks.includes("build")) {
        this.emitEvent(sendToRenderer, {
          type: "review_progress",
          featureId,
          check: "build",
          message: "Running build verification...",
        });

        const buildResult = await this.runBuildCheck(
          projectPath,
          featureId,
          abortController.signal
        );
        results.checks.push(buildResult);

        if (!buildResult.passed) {
          results.overallPass = false;
        }
      }

      if (checks.includes("patterns")) {
        this.emitEvent(sendToRenderer, {
          type: "review_progress",
          featureId,
          check: "patterns",
          message: "Running pattern analysis...",
        });

        const patternsResult = await this.runPatternAnalysis(
          projectPath,
          featureId,
          abortController.signal
        );
        results.checks.push(patternsResult);

        if (!patternsResult.passed) {
          results.overallPass = false;
        }
      }

      // Emit completion event
      this.emitEvent(sendToRenderer, {
        type: "review_complete",
        featureId,
        results,
      });

      console.log(
        `[CodeReview] Review complete for ${featureId}. Pass: ${results.overallPass}`
      );

      return { success: true, results };
    } catch (error) {
      console.error(`[CodeReview] Error during review:`, error);

      this.emitEvent(sendToRenderer, {
        type: "review_error",
        featureId,
        error: error.message,
      });

      return { success: false, error: error.message };
    } finally {
      this.runningReviews.delete(featureId);
    }
  }

  /**
   * Run TypeScript type check using tsc --noEmit
   */
  async runTypescriptCheck(projectPath, featureId, signal) {
    const startTime = Date.now();
    const issues = [];

    try {
      // Check if tsconfig.json exists
      const tsconfigPath = path.join(projectPath, "tsconfig.json");
      const hasTsConfig = await fs
        .access(tsconfigPath)
        .then(() => true)
        .catch(() => false);

      if (!hasTsConfig) {
        return {
          name: "typescript",
          passed: true,
          duration: Date.now() - startTime,
          issues: [
            {
              severity: "info",
              message: "No tsconfig.json found - skipping TypeScript check",
            },
          ],
        };
      }

      // Run tsc --noEmit
      const output = await this.runCommand("npx", ["tsc", "--noEmit"], {
        cwd: projectPath,
        signal,
      });

      // Parse TypeScript errors from output
      if (output.exitCode !== 0) {
        const errorLines = output.stderr.split("\n").filter((line) => line.trim());
        
        for (const line of errorLines) {
          // Parse TypeScript error format: file(line,col): error TSxxxx: message
          const match = line.match(
            /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/
          );
          
          if (match) {
            const [, file, lineNum, col, severity, code, message] = match;
            issues.push({
              severity: severity === "error" ? "error" : "warning",
              message,
              file: path.relative(projectPath, file),
              line: parseInt(lineNum, 10),
              column: parseInt(col, 10),
              code,
            });
          } else if (line.includes("error") || line.includes("Error")) {
            // Generic error line
            issues.push({
              severity: "error",
              message: line.trim(),
            });
          }
        }
      }

      const passed = issues.filter((i) => i.severity === "error").length === 0;

      return {
        name: "typescript",
        passed,
        duration: Date.now() - startTime,
        issues,
      };
    } catch (error) {
      return {
        name: "typescript",
        passed: false,
        duration: Date.now() - startTime,
        issues: [
          {
            severity: "error",
            message: `TypeScript check failed: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Run build verification
   */
  async runBuildCheck(projectPath, featureId, signal) {
    const startTime = Date.now();
    const issues = [];

    try {
      // Check for package.json to determine build command
      const packageJsonPath = path.join(projectPath, "package.json");
      const hasPackageJson = await fs
        .access(packageJsonPath)
        .then(() => true)
        .catch(() => false);

      if (!hasPackageJson) {
        return {
          name: "build",
          passed: true,
          duration: Date.now() - startTime,
          issues: [
            {
              severity: "info",
              message: "No package.json found - skipping build check",
            },
          ],
        };
      }

      // Read package.json to check for build script
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8")
      );

      if (!packageJson.scripts?.build) {
        return {
          name: "build",
          passed: true,
          duration: Date.now() - startTime,
          issues: [
            {
              severity: "info",
              message: "No build script found in package.json",
            },
          ],
        };
      }

      // Run npm run build
      const output = await this.runCommand("npm", ["run", "build"], {
        cwd: projectPath,
        signal,
        timeout: 300000, // 5 minute timeout for builds
      });

      if (output.exitCode !== 0) {
        // Parse build errors
        const errorOutput = output.stderr || output.stdout;
        const errorLines = errorOutput.split("\n").filter((line) => {
          const lower = line.toLowerCase();
          return (
            lower.includes("error") ||
            lower.includes("failed") ||
            lower.includes("cannot find")
          );
        });

        for (const line of errorLines.slice(0, 10)) {
          // Limit to 10 errors
          issues.push({
            severity: "error",
            message: line.trim(),
          });
        }

        if (errorLines.length === 0) {
          issues.push({
            severity: "error",
            message: "Build failed (see logs for details)",
          });
        }
      }

      const passed = issues.filter((i) => i.severity === "error").length === 0;

      return {
        name: "build",
        passed,
        duration: Date.now() - startTime,
        issues,
      };
    } catch (error) {
      return {
        name: "build",
        passed: false,
        duration: Date.now() - startTime,
        issues: [
          {
            severity: "error",
            message: `Build check failed: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Run pattern analysis on changed files
   */
  async runPatternAnalysis(projectPath, featureId, signal) {
    const startTime = Date.now();
    const issues = [];

    try {
      // Get list of changed files (from feature context or git)
      const changedFiles = await this.getChangedFiles(projectPath, featureId);

      for (const file of changedFiles) {
        const filePath = path.join(projectPath, file);

        // Only analyze TypeScript/JavaScript files
        if (!/\.(tsx?|jsx?)$/.test(file)) continue;

        try {
          const content = await fs.readFile(filePath, "utf-8");
          const fileIssues = this.analyzeFilePatterns(file, content);
          issues.push(...fileIssues);
        } catch (err) {
          // File might have been deleted
          console.log(`[CodeReview] Could not read ${file}: ${err.message}`);
        }
      }

      // Pattern analysis is advisory - only fail on errors
      const passed = issues.filter((i) => i.severity === "error").length === 0;

      return {
        name: "patterns",
        passed,
        duration: Date.now() - startTime,
        issues,
      };
    } catch (error) {
      return {
        name: "patterns",
        passed: true, // Don't fail on pattern analysis errors
        duration: Date.now() - startTime,
        issues: [
          {
            severity: "warning",
            message: `Pattern analysis could not complete: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Analyze a file for common anti-patterns
   */
  analyzeFilePatterns(file, content) {
    const issues = [];
    const lines = content.split("\n");

    // Check 1: Overly large files (>500 lines for components)
    if (file.endsWith(".tsx") && lines.length > 500) {
      issues.push({
        severity: "warning",
        message: `Component file exceeds 500 lines (${lines.length} lines). Consider splitting into smaller components.`,
        file,
        line: 1,
        code: "large-component",
      });
    }

    // Check 2: Missing error handling in async functions
    const asyncFunctionRegex = /async\s+(?:function\s+\w+|(?:\w+\s*=\s*)?\([^)]*\)\s*=>)/g;
    const tryCatchRegex = /try\s*\{/g;
    const asyncMatches = content.match(asyncFunctionRegex) || [];
    const tryCatchMatches = content.match(tryCatchRegex) || [];

    if (asyncMatches.length > 0 && tryCatchMatches.length === 0) {
      issues.push({
        severity: "warning",
        message: `File has async functions but no try-catch blocks. Consider adding error handling.`,
        file,
        code: "missing-error-handling",
      });
    }

    // Check 3: Direct state mutations (common React anti-pattern)
    const stateMutationRegex = /(?:state|props)\.\w+\s*=/g;
    const stateMutations = content.match(stateMutationRegex);
    if (stateMutations) {
      issues.push({
        severity: "warning",
        message: `Possible direct state/props mutation detected. Use setState or immutable updates.`,
        file,
        code: "direct-mutation",
      });
    }

    // Check 4: console.log statements (should be removed in production)
    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      if (/console\.(log|debug|info)\(/.test(line) && !/\/\//.test(line.split("console")[0])) {
        issues.push({
          severity: "info",
          message: "console statement found - consider removing before production",
          file,
          line: lineNum,
          code: "console-statement",
        });
      }
    }

    // Check 5: TODO/FIXME comments
    lineNum = 0;
    for (const line of lines) {
      lineNum++;
      if (/\/\/.*(?:TODO|FIXME|HACK|XXX)/i.test(line)) {
        issues.push({
          severity: "info",
          message: "TODO/FIXME comment found",
          file,
          line: lineNum,
          code: "todo-comment",
        });
      }
    }

    // Check 6: Missing TypeScript types (any usage)
    const anyMatches = content.match(/:\s*any(?:\s|[,)\]}>])/g);
    if (anyMatches && anyMatches.length > 3) {
      issues.push({
        severity: "warning",
        message: `Excessive use of 'any' type (${anyMatches.length} occurrences). Consider adding proper types.`,
        file,
        code: "excessive-any",
      });
    }

    return issues;
  }

  /**
   * Get list of files changed by a feature
   */
  async getChangedFiles(projectPath, featureId) {
    try {
      // Try to get files from git diff
      const output = await this.runCommand(
        "git",
        ["diff", "--name-only", "HEAD~5"],
        { cwd: projectPath }
      );

      if (output.exitCode === 0 && output.stdout) {
        return output.stdout
          .split("\n")
          .filter((f) => f.trim())
          .slice(0, 50); // Limit to 50 files
      }
    } catch (error) {
      console.log(`[CodeReview] Could not get git diff: ${error.message}`);
    }

    // Fallback: scan src directory for recent files
    try {
      const srcPath = path.join(projectPath, "src");
      const files = await this.findRecentFiles(srcPath, 20);
      return files.map((f) => path.relative(projectPath, f));
    } catch {
      return [];
    }
  }

  /**
   * Find recently modified files in a directory
   */
  async findRecentFiles(dirPath, limit = 20) {
    const files = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= limit) break;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          const subFiles = await this.findRecentFiles(fullPath, limit - files.length);
          files.push(...subFiles);
        } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory might not exist
    }

    return files;
  }

  /**
   * Run a command and capture output
   */
  runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const { cwd, signal, timeout = 60000 } = options;

      const proc = spawn(command, args, {
        cwd,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      // Handle timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill("SIGTERM");
      }, timeout);

      // Handle abort signal
      if (signal) {
        signal.addEventListener("abort", () => {
          killed = true;
          proc.kill("SIGTERM");
        });
      }

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (exitCode) => {
        clearTimeout(timeoutId);

        if (killed) {
          reject(new Error("Command was aborted"));
        } else {
          resolve({ exitCode, stdout, stderr });
        }
      });

      proc.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Helper to emit events
   */
  emitEvent(sendToRenderer, event) {
    if (sendToRenderer) {
      sendToRenderer(event);
    }
  }

  /**
   * Stop a running review
   */
  stopReview(featureId) {
    const review = this.runningReviews.get(featureId);
    if (review) {
      review.abortController.abort();
      this.runningReviews.delete(featureId);
      return { success: true };
    }
    return { success: false, error: "No review running for this feature" };
  }

  /**
   * Get diff for a feature
   */
  async getFeatureDiff(projectPath, featureId) {
    try {
      const output = await this.runCommand("git", ["diff", "HEAD~5"], {
        cwd: projectPath,
      });

      if (output.exitCode === 0) {
        // Get list of files
        const filesOutput = await this.runCommand(
          "git",
          ["diff", "--name-only", "HEAD~5"],
          { cwd: projectPath }
        );

        return {
          success: true,
          diff: output.stdout,
          files: filesOutput.stdout.split("\n").filter((f) => f.trim()),
        };
      }

      return {
        success: false,
        error: "Failed to get git diff",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new CodeReviewService();
