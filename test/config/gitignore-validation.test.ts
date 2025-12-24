import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('.gitignore Claude Code patterns', () => {
  let gitignoreContent: string;
  const gitignorePath = path.join(process.cwd(), '.gitignore');

  beforeEach(async () => {
    gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
  });

  describe('Claude Code pattern presence', () => {
    it('should contain Claude Code settings comment', () => {
      expect(gitignoreContent).toContain('# Claude Code local settings (user-specific, do not commit)');
    });

    it('should ignore .claude/settings.local.json', () => {
      expect(gitignoreContent).toContain('.claude/settings.local.json');
    });

    it('should ignore all .local.json files in .claude directory', () => {
      expect(gitignoreContent).toContain('.claude/*.local.json');
    });

    it('should ignore .claude/session-env/ directory', () => {
      expect(gitignoreContent).toContain('.claude/session-env/');
    });

    it('should have Claude Code section properly placed', () => {
      const lines = gitignoreContent.split('\n');
      const commentIndex = lines.findIndex(line => 
        line.includes('# Claude Code local settings')
      );
      
      expect(commentIndex).toBeGreaterThan(-1);
      
      // Should be followed by the actual patterns
      expect(lines[commentIndex + 1]).toContain('.claude/settings.local.json');
      expect(lines[commentIndex + 2]).toContain('.claude/*.local.json');
      expect(lines[commentIndex + 3]).toContain('.claude/session-env/');
    });
  });

  describe('pattern formatting', () => {
    it('should have properly formatted ignore patterns', () => {
      const claudePatterns = [
        '.claude/settings.local.json',
        '.claude/*.local.json',
        '.claude/session-env/',
      ];

      claudePatterns.forEach(pattern => {
        expect(gitignoreContent).toContain(pattern);
      });
    });

    it('should have blank line before Claude section', () => {
      const lines = gitignoreContent.split('\n');
      const commentIndex = lines.findIndex(line => 
        line.includes('# Claude Code local settings')
      );
      
      if (commentIndex > 0) {
        expect(lines[commentIndex - 1].trim()).toBe('');
      }
    });

    it('should not have trailing whitespace on Claude patterns', () => {
      const lines = gitignoreContent.split('\n');
      const claudeLines = lines.filter(line => 
        line.includes('.claude/') && !line.startsWith('#')
      );
      
      claudeLines.forEach(line => {
        expect(line).not.toMatch(/\s+$/);
      });
    });
  });

  describe('pattern specificity', () => {
    it('should ignore specific local settings file', () => {
      const pattern = '.claude/settings.local.json';
      expect(gitignoreContent).toContain(pattern);
    });

    it('should use wildcard for any local json files', () => {
      const pattern = '.claude/*.local.json';
      expect(gitignoreContent).toContain(pattern);
      expect(pattern).toMatch(/\*\.local\.json$/);
    });

    it('should ignore session-env as directory', () => {
      const pattern = '.claude/session-env/';
      expect(gitignoreContent).toContain(pattern);
      expect(pattern.endsWith('/')).toBe(true);
    });
  });

  describe('pattern interaction', () => {
    it('should not conflict with other ignore patterns', () => {
      const lines = gitignoreContent.split('\n');
      const claudePatterns = lines.filter(line => line.includes('.claude/'));
      
      // Should not have duplicate patterns
      const uniquePatterns = new Set(claudePatterns);
      expect(uniquePatterns.size).toBe(claudePatterns.length);
    });

    it('should maintain all existing sections', () => {
      const expectedSections = [
        '# Dependencies',
        '# Build outputs',
        '# Logs',
        '# OS-specific files',
        '# IDE/Editor configs',
        '# Claude Code local settings',
        '# Editor backup/temp files',
        '# Local settings',
        '# Test artifacts',
        '# Environment files',
      ];

      expectedSections.forEach(section => {
        expect(gitignoreContent).toContain(section);
      });
    });
  });

  describe('git behavior validation', () => {
    it('should ignore settings.local.json files', async () => {
      const testFile = '.claude/settings.local.json';
      const testContent = '{"test": true}';
      
      try {
        // Create test file
        await fs.mkdir(path.dirname(testFile), { recursive: true });
        await fs.writeFile(testFile, testContent);
        
        // Check if git would ignore it
        const { stdout } = await execAsync(`git check-ignore ${testFile}`);
        expect(stdout.trim()).toBe(testFile);
      } catch (error: any) {
        // git check-ignore exits with non-zero if file is not ignored
        // We expect it to be ignored, so this shouldn't throw
        throw new Error(`File should be ignored: ${error.message}`);
      } finally {
        // Cleanup
        try {
          await fs.unlink(testFile);
        } catch {}
      }
    });

    it('should ignore any .local.json in .claude directory', async () => {
      const testFile = '.claude/custom.local.json';
      const testContent = '{"custom": true}';
      
      try {
        await fs.mkdir(path.dirname(testFile), { recursive: true });
        await fs.writeFile(testFile, testContent);
        
        const { stdout } = await execAsync(`git check-ignore ${testFile}`);
        expect(stdout.trim()).toBe(testFile);
      } catch (error: any) {
        throw new Error(`File should be ignored: ${error.message}`);
      } finally {
        try {
          await fs.unlink(testFile);
        } catch {}
      }
    });

    it('should ignore session-env directory', async () => {
      const testDir = '.claude/session-env';
      const testFile = path.join(testDir, 'test.txt');
      
      try {
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(testFile, 'test');
        
        const { stdout } = await execAsync(`git check-ignore ${testFile}`);
        expect(stdout.trim()).toBe(testFile);
      } catch (error: any) {
        throw new Error(`Directory contents should be ignored: ${error.message}`);
      } finally {
        try {
          await fs.rm(testDir, { recursive: true, force: true });
        } catch {}
      }
    });

    it('should not ignore committed settings.json', async () => {
      const committedFile = '.claude/settings.json';
      
      try {
        // This file should NOT be ignored (it's the committed config)
        await execAsync(`git check-ignore ${committedFile}`);
        // If we get here, the file is ignored (which is wrong)
        throw new Error('settings.json should not be ignored');
      } catch (error: any) {
        // Expected: git check-ignore should fail (exit code 1) for non-ignored files
        if (error.message.includes('should not be ignored')) {
          throw error;
        }
        // Success: file is not ignored
        expect(error.code).toBe(1);
      }
    });
  });

  describe('security and privacy', () => {
    it('should protect local user settings from being committed', () => {
      const sensitivePatterns = [
        '.claude/settings.local.json',
        '.claude/*.local.json',
      ];
      
      sensitivePatterns.forEach(pattern => {
        expect(gitignoreContent).toContain(pattern);
      });
    });

    it('should protect session data from being committed', () => {
      expect(gitignoreContent).toContain('.claude/session-env/');
    });

    it('should have clear documentation of intent', () => {
      expect(gitignoreContent).toContain('user-specific, do not commit');
    });
  });

  describe('pattern coverage', () => {
    it('should cover all local configuration scenarios', () => {
      const scenarios = [
        { pattern: '.claude/settings.local.json', description: 'specific local settings' },
        { pattern: '.claude/*.local.json', description: 'any local JSON configs' },
        { pattern: '.claude/session-env/', description: 'session environment data' },
      ];

      scenarios.forEach(({ pattern, description }) => {
        expect(gitignoreContent).toContain(pattern);
      });
    });

    it('should maintain backward compatibility', () => {
      // Existing patterns should still be present
      const existingPatterns = [
        'node_modules/',
        'dist/',
        '*.log',
        '.env',
        '.DS_Store',
      ];

      existingPatterns.forEach(pattern => {
        expect(gitignoreContent).toContain(pattern);
      });
    });
  });

  describe('gitignore syntax validation', () => {
    it('should use correct wildcard syntax', () => {
      const wildcardPattern = '.claude/*.local.json';
      expect(gitignoreContent).toContain(wildcardPattern);
      
      // Should use * not **/ for single directory level
      expect(wildcardPattern).not.toContain('**/');
    });

    it('should use trailing slash for directories', () => {
      const dirPattern = '.claude/session-env/';
      expect(gitignoreContent).toContain(dirPattern);
      expect(dirPattern.endsWith('/')).toBe(true);
    });

    it('should not have redundant patterns', () => {
      const lines = gitignoreContent.split('\n');
      const claudeLines = lines.filter(line => 
        line.includes('.claude/') && !line.startsWith('#')
      ).map(line => line.trim());
      
      const uniqueLines = new Set(claudeLines);
      expect(uniqueLines.size).toBe(claudeLines.length);
    });
  });

  describe('documentation quality', () => {
    it('should have descriptive comment for Claude section', () => {
      const comment = '# Claude Code local settings (user-specific, do not commit)';
      expect(gitignoreContent).toContain(comment);
    });

    it('should explain why files are ignored', () => {
      const lines = gitignoreContent.split('\n');
      const commentIndex = lines.findIndex(line => 
        line.includes('# Claude Code local settings')
      );
      
      expect(lines[commentIndex]).toContain('user-specific');
      expect(lines[commentIndex]).toContain('do not commit');
    });
  });
});