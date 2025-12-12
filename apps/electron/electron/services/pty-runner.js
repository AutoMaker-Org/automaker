const os = require("os");

// Prefer prebuilt to avoid native build issues.
const pty = require("@homebridge/node-pty-prebuilt-multiarch");

/**
 * Minimal PTY helper to run CLI commands with a pseudo-terminal.
 * Useful for CLIs (like Claude) that need raw mode on Windows.
 *
 * @param {string} command Executable path
 * @param {string[]} args Arguments for the executable
 * @param {Object} options Additional spawn options
 * @param {(chunk: string) => void} [options.onData] Data callback
 * @param {string} [options.cwd] Working directory
 * @param {Object} [options.env] Extra env vars
 * @param {number} [options.cols] Terminal columns
 * @param {number} [options.rows] Terminal rows
 * @returns {Promise<{ success: boolean, exitCode: number, signal?: number, output: string, errorOutput: string }>}
 */
function runPtyCommand(command, args = [], options = {}) {
  const {
    onData,
    cwd = process.cwd(),
    env = {},
    cols = 120,
    rows = 30,
  } = options;

  const mergedEnv = {
    ...process.env,
    TERM: process.env.TERM || "xterm-256color",
    ...env,
  };

  return new Promise((resolve, reject) => {
    let ptyProcess;

    try {
      ptyProcess = pty.spawn(command, args, {
        name: os.platform() === "win32" ? "Windows.Terminal" : "xterm-color",
        cols,
        rows,
        cwd,
        env: mergedEnv,
        useConpty: true,
      });
    } catch (error) {
      return reject(error);
    }

    let output = "";
    let errorOutput = "";

    ptyProcess.onData((data) => {
      output += data;
      if (typeof onData === "function") {
        onData(data);
      }
    });

    // node-pty does not emit 'error' in practice, but guard anyway
    if (ptyProcess.on) {
      ptyProcess.on("error", (err) => {
        errorOutput += err?.message || "";
        reject(err);
      });
    }

    ptyProcess.onExit(({ exitCode, signal }) => {
      resolve({
        success: exitCode === 0,
        exitCode,
        signal,
        output,
        errorOutput,
      });
    });
  });
}

module.exports = {
  runPtyCommand,
};

