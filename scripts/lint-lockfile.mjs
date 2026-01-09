#!/usr/bin/env node

/**
 * Script to check for git+ssh:// URLs in package-lock.json
 * This ensures compatibility with CI/CD environments that don't support SSH.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const lockfilePath = join(process.cwd(), 'package-lock.json');

try {
  const content = readFileSync(lockfilePath, 'utf8');

  // Check for git+ssh:// URLs
  if (content.includes('git+ssh://')) {
    console.error('Error: package-lock.json contains git+ssh:// URLs.');
    console.error('Run: git config --global url."https://github.com/".insteadOf "git@github.com:"');
    console.error('Or run: npm run fix:lockfile');
    process.exit(1);
  }

  console.log('✓ No git+ssh:// URLs found in package-lock.json');
  process.exit(0);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Error: package-lock.json not found');
    process.exit(1);
  }
  console.error('Error checking package-lock.json:', error.message);
  process.exit(1);
}
