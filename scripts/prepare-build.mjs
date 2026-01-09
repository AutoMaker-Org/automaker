#!/usr/bin/env node

/**
 * Prepare script that builds packages with the detected package manager
 * This replaces "npm run build:packages" in the prepare script to support bun
 */

import { execSync } from 'child_process';
import path from 'path';
import { existsSync, mkdirSync, symlinkSync, statSync } from 'fs';

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
 * Create workspace symlinks for bun
 * Bun doesn't create workspace symlinks until after prepare, so we create them manually
 */
function createWorkspaceSymlinks() {
  const rootDir = process.cwd();
  const nodeModulesDir = path.join(rootDir, 'node_modules');

  if (!existsSync(nodeModulesDir)) {
    mkdirSync(nodeModulesDir, { recursive: true });
  }

  // Create @automaker scope directory
  const scopeDir = path.join(nodeModulesDir, '@automaker');
  if (!existsSync(scopeDir)) {
    mkdirSync(scopeDir, { recursive: true });
  }

  const packages = [
    'types',
    'platform',
    'utils',
    'prompts',
    'model-resolver',
    'dependency-resolver',
    'git-utils',
  ];

  for (const pkgName of packages) {
    const targetDir = path.join(rootDir, 'libs', pkgName);
    const linkPath = path.join(scopeDir, pkgName);

    // Skip if symlink already exists
    if (existsSync(linkPath)) {
      try {
        const stats = statSync(linkPath);
        if (stats.isSymbolicLink()) {
          continue; // Already symlinked
        }
      } catch {
        // Error reading stats, will try to recreate
      }
    }

    try {
      // Remove existing file/directory if any (Windows-safe)
      if (existsSync(linkPath)) {
        if (process.platform === 'win32') {
          execSync(`rmdir /S /Q "${linkPath}"`, { cwd: rootDir, shell: true });
        } else {
          execSync(`rm -rf "${linkPath}"`, { cwd: rootDir, shell: true });
        }
      }

      // Create junction on Windows, symlink on Unix
      const relativeTarget = path.relative(scopeDir, targetDir);

      if (process.platform === 'win32') {
        // On Windows, use junctions for directories
        execSync(`mklink /J "${linkPath}" "${targetDir}"`, {
          cwd: rootDir,
          shell: true,
          windowsHide: true,
        });
      } else {
        // On Unix, use symlinks
        symlinkSync(relativeTarget, linkPath);
      }
      console.log(`  Created symlink: @automaker/${pkgName}`);
    } catch (error) {
      console.warn(`  Warning: Could not create symlink for ${pkgName}:`, error.message);
      // Non-fatal - continue without symlink
    }
  }
}

/**
 * Build all shared packages
 */
function buildPackages() {
  const pm = detectPackageManager();
  console.log(`📦 Building packages with ${pm}...`);

  try {
    const packages = [
      { name: '@automaker/types', path: 'libs/types' },
      { name: '@automaker/platform', path: 'libs/platform' },
      { name: '@automaker/utils', path: 'libs/utils' },
      { name: '@automaker/prompts', path: 'libs/prompts' },
      { name: '@automaker/model-resolver', path: 'libs/model-resolver' },
      { name: '@automaker/dependency-resolver', path: 'libs/dependency-resolver' },
      { name: '@automaker/git-utils', path: 'libs/git-utils' },
    ];

    // For bun, create workspace symlinks first
    if (pm === 'bun') {
      console.log('  Creating workspace symlinks...');
      createWorkspaceSymlinks();
    }

    for (const pkg of packages) {
      console.log(`  Building ${pkg.name}...`);

      if (pm === 'bun') {
        // For bun, use plain tsc from the package directory
        // Workspace symlinks ensure dependencies are resolvable
        const pkgDir = path.join(process.cwd(), pkg.path);

        execSync(`npx tsc`, {
          stdio: 'inherit',
          cwd: pkgDir,
          shell: true,
        });
      } else {
        // For npm/pnpm/yarn, use the workspace flag
        execSync(`${pm} run build -w ${pkg.name}`, {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
      }
    }

    console.log('✅ All packages built successfully');
  } catch (error) {
    console.error('❌ Failed to build packages:', error.message);
    process.exit(1);
  }
}

// Run the build
buildPackages();
