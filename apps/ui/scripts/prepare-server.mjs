#!/usr/bin/env node

/**
 * This script prepares the server for bundling with Electron.
 * It copies the server dist and installs production dependencies
 * in a way that works with npm workspaces.
 */

import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_DIR = join(__dirname, '..');
const SERVER_DIR = join(APP_DIR, '..', 'server');
const LIBS_DIR = join(APP_DIR, '..', '..', 'libs');
const BUNDLE_DIR = join(APP_DIR, 'server-bundle');

// Local workspace packages that need to be bundled
const LOCAL_PACKAGES = [
  '@automaker/types',
  '@automaker/utils',
  '@automaker/prompts',
  '@automaker/platform',
  '@automaker/model-resolver',
  '@automaker/dependency-resolver',
  '@automaker/git-utils'
];

console.log('🔧 Preparing server for Electron bundling...\n');

// Step 1: Clean up previous bundle
if (existsSync(BUNDLE_DIR)) {
  console.log('🗑️  Cleaning previous server-bundle...');
  rmSync(BUNDLE_DIR, { recursive: true });
}
mkdirSync(BUNDLE_DIR, { recursive: true });

// Step 2: Build the server TypeScript
console.log('📦 Building server TypeScript...');
execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit' });

// Step 3: Copy server dist
console.log('📋 Copying server dist...');
cpSync(join(SERVER_DIR, 'dist'), join(BUNDLE_DIR, 'dist'), { recursive: true });

// Step 4: Copy local workspace packages
console.log('📦 Copying local workspace packages...');
const bundleLibsDir = join(BUNDLE_DIR, 'libs');
mkdirSync(bundleLibsDir, { recursive: true });

for (const pkgName of LOCAL_PACKAGES) {
  const pkgDir = pkgName.replace('@automaker/', '');
  const srcDir = join(LIBS_DIR, pkgDir);
  const destDir = join(bundleLibsDir, pkgDir);

  if (!existsSync(srcDir)) {
    console.warn(`⚠️  Warning: Package ${pkgName} not found at ${srcDir}`);
    continue;
  }

  mkdirSync(destDir, { recursive: true });

  // Copy dist folder
  if (existsSync(join(srcDir, 'dist'))) {
    cpSync(join(srcDir, 'dist'), join(destDir, 'dist'), { recursive: true });
  }

  // Copy package.json
  if (existsSync(join(srcDir, 'package.json'))) {
    cpSync(join(srcDir, 'package.json'), join(destDir, 'package.json'));
  }

  console.log(`   ✓ ${pkgName}`);
}

// Step 5: Create a minimal package.json for the server
console.log('📝 Creating server package.json...');
const serverPkg = JSON.parse(readFileSync(join(SERVER_DIR, 'package.json'), 'utf-8'));

// Replace local package versions with file: references
const dependencies = { ...serverPkg.dependencies };
for (const pkgName of LOCAL_PACKAGES) {
  if (dependencies[pkgName]) {
    const pkgDir = pkgName.replace('@automaker/', '');
    dependencies[pkgName] = `file:libs/${pkgDir}`;
  }
}

const bundlePkg = {
  name: '@automaker/server-bundle',
  version: serverPkg.version,
  type: 'module',
  main: 'dist/index.js',
  dependencies
};

writeFileSync(
  join(BUNDLE_DIR, 'package.json'),
  JSON.stringify(bundlePkg, null, 2)
);

// Step 6: Install production dependencies
console.log('📥 Installing server production dependencies...');
execSync('npm install --omit=dev', {
  cwd: BUNDLE_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Prevent npm from using workspace resolution
    npm_config_workspace: ''
  }
});

// Step 7: Rebuild native modules for current architecture
// This is critical for modules like node-pty that have native bindings
console.log('🔨 Rebuilding native modules for current architecture...');
try {
  execSync('npm rebuild', {
    cwd: BUNDLE_DIR,
    stdio: 'inherit'
  });
  console.log('✅ Native modules rebuilt successfully');
} catch (error) {
  console.warn('⚠️  Warning: Failed to rebuild native modules. Terminal functionality may not work.');
  console.warn('   Error:', error.message);
}

console.log('\n✅ Server prepared for bundling at:', BUNDLE_DIR);
