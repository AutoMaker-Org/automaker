#!/usr/bin/env node
/**
 * Bumps the version in apps/ui/package.json and apps/server/package.json
 * Usage: node scripts/bump-version.mjs [major|minor|patch]
 * Example: node scripts/bump-version.mjs patch
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const bumpType = process.argv[2]?.toLowerCase();

if (!bumpType || !['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('Error: Bump type argument is required');
  console.error('Usage: node scripts/bump-version.mjs [major|minor|patch]');
  console.error('Example: node scripts/bump-version.mjs patch');
  process.exit(1);
}

const uiPackageJsonPath = join(__dirname, '..', 'package.json');
const serverPackageJsonPath = join(__dirname, '..', '..', 'server', 'package.json');

function bumpVersion(packageJsonPath, packageName) {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const oldVersion = packageJson.version;

    // Parse version
    const versionParts = oldVersion.split('.').map(Number);
    if (versionParts.length !== 3) {
      console.error(`Error: Invalid version format in ${packageName}: ${oldVersion}`);
      console.error('Expected format: X.Y.Z (e.g., 1.2.3)');
      process.exit(1);
    }

    // Bump version
    let [major, minor, patch] = versionParts;

    switch (bumpType) {
      case 'major':
        major += 1;
        minor = 0;
        patch = 0;
        break;
      case 'minor':
        minor += 1;
        patch = 0;
        break;
      case 'patch':
        patch += 1;
        break;
    }

    const newVersion = `${major}.${minor}.${patch}`;
    packageJson.version = newVersion;

    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

    return newVersion;
  } catch (error) {
    console.error(`Error bumping version in ${packageName}: ${error.message}`);
    process.exit(1);
  }
}

try {
  // Bump UI package version
  const uiOldVersion = JSON.parse(readFileSync(uiPackageJsonPath, 'utf8')).version;
  const uiNewVersion = bumpVersion(uiPackageJsonPath, '@automaker/ui');

  // Bump server package version (sync with UI)
  const serverOldVersion = JSON.parse(readFileSync(serverPackageJsonPath, 'utf8')).version;
  const serverNewVersion = bumpVersion(serverPackageJsonPath, '@automaker/server');

  // Verify versions match
  if (uiNewVersion !== serverNewVersion) {
    console.error(`Error: Version mismatch! UI: ${uiNewVersion}, Server: ${serverNewVersion}`);
    process.exit(1);
  }

  console.log(`✅ Bumped version from ${uiOldVersion} to ${uiNewVersion} (${bumpType})`);
  console.log(`📦 Updated @automaker/ui: ${uiOldVersion} -> ${uiNewVersion}`);
  console.log(`📦 Updated @automaker/server: ${serverOldVersion} -> ${serverNewVersion}`);
  console.log(`📦 Version is now: ${uiNewVersion}`);
} catch (error) {
  console.error(`Error bumping version: ${error.message}`);
  process.exit(1);
}
