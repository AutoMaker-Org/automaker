#!/usr/bin/env node

/**
 * Postinstall script for @automaker/ui
 * Handles native module installation for Electron with different package managers
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Detects the currently active package manager
 */
function detectPackageManager() {
  const { env } = process;

  // Check npm config (set by npm when running scripts)
  if (env.npm_config_user_agent?.startsWith('npm')) {
    return 'npm';
  }

  // Check pnpm
  if (env.npm_config_user_agent?.includes('pnpm')) {
    return 'pnpm';
  }

  // Check Yarn
  if (env.npm_config_user_agent?.includes('yarn')) {
    return 'yarn';
  }

  // Check Bun
  if (env.BUN_INSTALL_CACHE_DIR || env.npm_config_user_agent?.includes('bun')) {
    return 'bun';
  }

  // Default to npm
  return 'npm';
}

/**
 * Runs electron-builder install-app-deps using npm explicitly
 * This is needed because electron-builder internally uses npm
 */
function installElectronDeps() {
  // For bun, we need to use npx to run electron-builder which will use npm internally
  // This is necessary because electron-builder doesn't support bun directly
  const packageManager = detectPackageManager();

  console.log(`📦 Detected package manager: ${packageManager}`);
  console.log('🔧 Installing Electron native dependencies...');

  try {
    if (packageManager === 'bun') {
      // For bun, use npx to run electron-builder which will use npm internally
      // This is necessary because electron-builder calls npm internally
      console.log('  Using npx electron-builder (bun mode)...');

      // First, ensure the native modules are rebuilt for Electron
      // We use @electron/rebuild which is more reliable than electron-builder for this
      const rebuildPath = path.join(__dirname, '../node_modules/@electron/rebuild/lib/index.js');

      if (existsSync(rebuildPath)) {
        console.log('  Running @electron/rebuild for native modules...');
        execSync('node ' + rebuildPath, {
          stdio: 'inherit',
          cwd: path.join(__dirname, '..'),
        });
      } else {
        // Fallback to electron-builder install-app-deps via npx
        console.log('  Running electron-builder install-app-deps via npx...');
        execSync('npx electron-builder install-app-deps', {
          stdio: 'inherit',
          cwd: path.join(__dirname, '..'),
        });
      }
    } else {
      // For npm, pnpm, yarn - use standard electron-builder command
      console.log(`  Running electron-builder install-app-deps (${packageManager} mode)...`);
      execSync('npx electron-builder install-app-deps', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
      });
    }

    console.log('✅ Electron dependencies installed successfully');
  } catch (error) {
    console.error('❌ Failed to install Electron dependencies:', error.message);
    // Don't fail the build, just warn - native deps may be optional for some builds
    console.warn('⚠️  Continuing without native dependencies (may affect Electron functionality)');
  }
}

// Run the installation
installElectronDeps();
