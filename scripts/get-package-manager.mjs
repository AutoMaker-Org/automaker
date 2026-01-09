#!/usr/bin/env node

/**
 * Detects the currently active package manager
 * Returns: 'npm' | 'pnpm' | 'yarn' | 'bun'
 */

const { env, argv } = process;

// Check npm config (set by npm when running scripts)
if (env.npm_config_user_agent?.startsWith('npm')) {
  console.log('npm');
  process.exit(0);
}

// Check pnpm
if (env.npm_config_user_agent?.includes('pnpm')) {
  console.log('pnpm');
  process.exit(0);
}

// Check Yarn
if (env.npm_config_user_agent?.includes('yarn')) {
  console.log('yarn');
  process.exit(0);
}

// Check Bun (Bun sets BUN_INSTALL_CACHE_DIR and has distinct npm_config_user_agent)
if (env.BUN_INSTALL_CACHE_DIR || env.npm_config_user_agent?.includes('bun')) {
  console.log('bun');
  process.exit(0);
}

// Fallback: check which command is available
// This is a fallback when the above detection fails
const { execSync } = await import('child_process');

try {
  // Try bun first (fastest)
  execSync('bun --version', { stdio: 'ignore' });
  console.log('bun');
  process.exit(0);
} catch {
  // Bun not available
}

try {
  // Try pnpm
  execSync('pnpm --version', { stdio: 'ignore' });
  console.log('pnpm');
  process.exit(0);
} catch {
  // pnpm not available
}

try {
  // Try yarn
  execSync('yarn --version', { stdio: 'ignore' });
  console.log('yarn');
  process.exit(0);
} catch {
  // yarn not available
}

// Default to npm as it's guaranteed to be available in Node environments
console.log('npm');
