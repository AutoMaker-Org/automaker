import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('README.md Claude Code Plugin documentation', () => {
  let readmeContent: string;
  const readmePath = path.join(process.cwd(), 'README.md');

  beforeEach(async () => {
    readmeContent = await fs.readFile(readmePath, 'utf-8');
  });

  describe('section presence', () => {
    it('should have Claude Code Plugin Setup section', () => {
      expect(readmeContent).toContain('### Claude Code Plugin Setup');
    });

    it('should mention minimal-claude plugin', () => {
      expect(readmeContent).toContain('minimal-claude');
    });

    it('should be placed before "How to Run" section', () => {
      const claudeIndex = readmeContent.indexOf('### Claude Code Plugin Setup');
      const howToRunIndex = readmeContent.indexOf('## How to Run');
      
      expect(claudeIndex).toBeGreaterThan(-1);
      expect(howToRunIndex).toBeGreaterThan(-1);
      expect(claudeIndex).toBeLessThan(howToRunIndex);
    });
  });

  describe('plugin information', () => {
    it('should include GitHub repository link', () => {
      expect(readmeContent).toContain('https://github.com/KenKaiii/minimal-claude');
    });

    it('should use proper markdown link syntax', () => {
      expect(readmeContent).toMatch(/\[minimal-claude\]\(https:\/\/github\.com\/KenKaiii\/minimal-claude\)/);
    });

    it('should describe plugin purpose', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('### Claude Code Plugin Setup'),
        readmeContent.indexOf('## How to Run')
      );
      
      expect(section).toContain('code quality automation');
    });
  });

  describe('available commands documentation', () => {
    it('should list available commands', () => {
      expect(readmeContent).toContain('**Available Commands:**');
    });

    it('should document /setup-code-quality command', () => {
      expect(readmeContent).toContain('/setup-code-quality');
      expect(readmeContent).toContain('Auto-detect and configure linting/type-checking');
    });

    it('should document /setup-claude-md command', () => {
      expect(readmeContent).toContain('/setup-claude-md');
      expect(readmeContent).toContain('Generate code quality guidelines for AI agents');
    });

    it('should document /setup-commits command', () => {
      expect(readmeContent).toContain('/setup-commits');
      expect(readmeContent).toContain('Create custom commit command with quality checks');
    });

    it('should use consistent command formatting', () => {
      const commands = [
        '/setup-code-quality',
        '/setup-claude-md',
        '/setup-commits',
      ];

      commands.forEach(command => {
        // Commands should be formatted as list items with inline code
        const pattern = new RegExp(`- \`${command}\``);
        expect(readmeContent).toMatch(pattern);
      });
    });
  });

  describe('installation information', () => {
    it('should mention automatic installation', () => {
      expect(readmeContent).toContain('installs automatically');
    });

    it('should mention claude command requirement', () => {
      expect(readmeContent).toMatch(/run[s]?\s+`claude`/i);
    });

    it('should mention repository context', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('### Claude Code Plugin Setup'),
        readmeContent.indexOf('## How to Run')
      );
      
      expect(section).toContain('in this repository');
    });
  });

  describe('markdown formatting', () => {
    it('should use proper heading level', () => {
      expect(readmeContent).toContain('### Claude Code Plugin Setup');
      expect(readmeContent).not.toContain('#### Claude Code Plugin Setup');
      expect(readmeContent).not.toContain('## Claude Code Plugin Setup');
    });

    it('should use bold for "Available Commands"', () => {
      expect(readmeContent).toContain('**Available Commands:**');
    });

    it('should use unordered list for commands', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('**Available Commands:**'),
        readmeContent.indexOf('The plugin installs')
      );
      
      const listItems = section.match(/^- /gm);
      expect(listItems).not.toBeNull();
      expect(listItems!.length).toBeGreaterThanOrEqual(3);
    });

    it('should use inline code formatting for commands', () => {
      const commands = [
        '`/setup-code-quality`',
        '`/setup-claude-md`',
        '`/setup-commits`',
        '`claude`',
      ];

      commands.forEach(command => {
        expect(readmeContent).toContain(command);
      });
    });
  });

  describe('link validation', () => {
    it('should have valid GitHub URL format', () => {
      const url = 'https://github.com/KenKaiii/minimal-claude';
      expect(readmeContent).toContain(url);
      expect(url).toMatch(/^https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/);
    });

    it('should not have broken markdown links', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('### Claude Code Plugin Setup'),
        readmeContent.indexOf('## How to Run')
      );
      
      // Check for malformed links like ](url) or [text](
      expect(section).not.toMatch(/\]\([^)]*$/);
      expect(section).not.toMatch(/\[[^\]]*$/);
    });
  });

  describe('content accuracy', () => {
    it('should describe each command accurately', () => {
      const commandDescriptions = [
        { command: '/setup-code-quality', keywords: ['linting', 'type-checking', 'configure'] },
        { command: '/setup-claude-md', keywords: ['code quality', 'guidelines', 'AI'] },
        { command: '/setup-commits', keywords: ['commit', 'quality checks'] },
      ];

      commandDescriptions.forEach(({ command, keywords }) => {
        const section = readmeContent.substring(
          readmeContent.indexOf('### Claude Code Plugin Setup'),
          readmeContent.indexOf('## How to Run')
        );
        
        expect(section).toContain(command);
        
        // At least one keyword should be present in the description
        const hasKeyword = keywords.some(keyword => 
          section.toLowerCase().includes(keyword.toLowerCase())
        );
        expect(hasKeyword).toBe(true);
      });
    });

    it('should mention code quality as main theme', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('### Claude Code Plugin Setup'),
        readmeContent.indexOf('## How to Run')
      );
      
      expect(section.toLowerCase()).toContain('code quality');
    });
  });

  describe('section structure', () => {
    it('should have proper section flow', () => {
      const claudeIndex = readmeContent.indexOf('### Claude Code Plugin Setup');
      const commandsIndex = readmeContent.indexOf('**Available Commands:**');
      const installIndex = readmeContent.indexOf('The plugin installs automatically');
      
      expect(claudeIndex).toBeLessThan(commandsIndex);
      expect(commandsIndex).toBeLessThan(installIndex);
    });

    it('should have blank lines around section', () => {
      const lines = readmeContent.split('\n');
      const sectionIndex = lines.findIndex(line => line.includes('### Claude Code Plugin Setup'));
      
      if (sectionIndex > 0) {
        expect(lines[sectionIndex - 1].trim()).toBe('');
      }
    });
  });

  describe('integration with existing content', () => {
    it('should maintain Quick Start section', () => {
      expect(readmeContent).toContain('### Quick Start');
    });

    it('should maintain How to Run section', () => {
      expect(readmeContent).toContain('## How to Run');
    });

    it('should be positioned logically in Getting Started flow', () => {
      const quickStartIndex = readmeContent.indexOf('### Quick Start');
      const claudePluginIndex = readmeContent.indexOf('### Claude Code Plugin Setup');
      const howToRunIndex = readmeContent.indexOf('## How to Run');
      
      // Should be after Quick Start but before How to Run
      expect(claudePluginIndex).toBeGreaterThan(quickStartIndex);
      expect(claudePluginIndex).toBeLessThan(howToRunIndex);
    });
  });

  describe('user guidance', () => {
    it('should be clear about automatic installation', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('### Claude Code Plugin Setup'),
        readmeContent.indexOf('## How to Run')
      );
      
      expect(section).toContain('automatically');
    });

    it('should explain when plugin activates', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('### Claude Code Plugin Setup'),
        readmeContent.indexOf('## How to Run')
      );
      
      expect(section).toMatch(/when you run[s]?\s+`claude`/i);
    });

    it('should be concise and actionable', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('### Claude Code Plugin Setup'),
        readmeContent.indexOf('## How to Run')
      );
      
      // Section should be focused and not overly verbose
      const lineCount = section.split('\n').filter(l => l.trim()).length;
      expect(lineCount).toBeLessThan(15);
      expect(lineCount).toBeGreaterThan(8);
    });
  });

  describe('completeness', () => {
    it('should cover all three main commands', () => {
      const commands = [
        '/setup-code-quality',
        '/setup-claude-md',
        '/setup-commits',
      ];

      commands.forEach(command => {
        expect(readmeContent).toContain(command);
      });
    });

    it('should provide context for each command', () => {
      const section = readmeContent.substring(
        readmeContent.indexOf('**Available Commands:**'),
        readmeContent.indexOf('The plugin installs')
      );
      
      // Each command should have a description (indicated by " - ")
      const descriptions = section.match(/ - /g);
      expect(descriptions).not.toBeNull();
      expect(descriptions!.length).toBeGreaterThanOrEqual(3);
    });
  });
});