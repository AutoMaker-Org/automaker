import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AutomationStep,
  AutomationStepExecutionContext,
  AutomationStepExecutor,
  AutomationVariableValue,
} from '@automaker/types';
import { registerAutomationBuiltins } from '@/services/automation-builtins.js';

// Mock git-utils
vi.mock('@automaker/git-utils', () => ({
  execGitCommand: vi.fn(),
  getCurrentBranch: vi.fn(),
  parseGitStatus: vi.fn(),
  isGitRepo: vi.fn(),
}));

import { execGitCommand, getCurrentBranch, parseGitStatus, isGitRepo } from '@automaker/git-utils';

class TestRegistry {
  private readonly executors = new Map<string, AutomationStepExecutor>();

  register(executor: AutomationStepExecutor): void {
    this.executors.set(executor.type, executor);
  }

  get(type: string): AutomationStepExecutor | undefined {
    return this.executors.get(type);
  }
}

function createContext(
  overrides: Partial<AutomationStepExecutionContext> & {
    step: AutomationStep;
    input?: unknown;
    projectPath?: string;
  }
): AutomationStepExecutionContext {
  const workflowVariables: Record<string, AutomationVariableValue> = {};
  return {
    runId: 'run_test',
    automationId: 'automation_test',
    step: overrides.step,
    input: overrides.input,
    previousOutput: overrides.previousOutput,
    projectPath: overrides.projectPath ?? '/test/project',
    variables: overrides.variables ?? {
      system: {},
      project: {},
      workflow: workflowVariables,
      steps: {},
    },
    setWorkflowVariable:
      overrides.setWorkflowVariable ??
      ((name: string, value: AutomationVariableValue | unknown) => {
        workflowVariables[name] = value as AutomationVariableValue;
      }),
    ...overrides,
  };
}

describe('Git Automation Steps', () => {
  let registry: TestRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new TestRegistry();
    registerAutomationBuiltins(registry);
  });

  describe('git-status', () => {
    it('should register git-status executor', () => {
      expect(registry.get('git-status')).toBeDefined();
    });

    it('should throw error when path is not a git repository', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(false);

      await expect(
        registry.get('git-status')!.execute(
          createContext({
            step: { id: 'status_1', type: 'git-status' },
            projectPath: '/not/a/repo',
          })
        )
      ).rejects.toThrow('Path "/not/a/repo" is not a git repository');
    });

    it('should return clean status for repository with no changes', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');
      vi.mocked(execGitCommand).mockResolvedValue('');
      vi.mocked(parseGitStatus).mockReturnValue([]);

      const result = await registry.get('git-status')!.execute(
        createContext({
          step: { id: 'status_1', type: 'git-status' },
        })
      );

      expect(result).toEqual({
        branch: 'main',
        isClean: true,
        files: [],
        summary: {
          total: 0,
          staged: 0,
          unstaged: 0,
          untracked: 0,
        },
      });
    });

    it('should return correct status for repository with changes', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('feature-branch');
      vi.mocked(execGitCommand).mockResolvedValue('M file1.ts\nA file2.ts\n?? file3.ts');
      vi.mocked(parseGitStatus).mockReturnValue([
        { file: 'file1.ts', status: 'M', indexStatus: ' ', workTreeStatus: 'M' },
        { file: 'file2.ts', status: 'A', indexStatus: 'A', workTreeStatus: ' ' },
        { file: 'file3.ts', status: '?', indexStatus: '?', workTreeStatus: '?' },
      ]);

      const result = await registry.get('git-status')!.execute(
        createContext({
          step: { id: 'status_1', type: 'git-status' },
        })
      );

      expect(result).toMatchObject({
        branch: 'feature-branch',
        isClean: false,
        summary: {
          total: 3,
        },
      });
    });

    it('should use config.path when provided', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');
      vi.mocked(execGitCommand).mockResolvedValue('');
      vi.mocked(parseGitStatus).mockReturnValue([]);

      await registry.get('git-status')!.execute(
        createContext({
          step: {
            id: 'status_1',
            type: 'git-status',
            config: { path: '/custom/repo' },
          },
          projectPath: '/default/project',
        })
      );

      expect(isGitRepo).toHaveBeenCalledWith('/custom/repo');
    });
  });

  describe('git-branch', () => {
    it('should register git-branch executor', () => {
      expect(registry.get('git-branch')).toBeDefined();
    });

    it('should throw error when path is not a git repository', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(false);

      await expect(
        registry.get('git-branch')!.execute(
          createContext({
            step: { id: 'branch_1', type: 'git-branch', config: { action: 'current' } },
          })
        )
      ).rejects.toThrow('is not a git repository');
    });

    it('should throw error for invalid action', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);

      await expect(
        registry.get('git-branch')!.execute(
          createContext({
            step: { id: 'branch_1', type: 'git-branch', config: { action: 'invalid' } },
          })
        )
      ).rejects.toThrow('git-branch requires valid action: list, create, delete, current');
    });

    it('should get current branch with "current" action', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');

      const result = await registry.get('git-branch')!.execute(
        createContext({
          step: { id: 'branch_1', type: 'git-branch', config: { action: 'current' } },
        })
      );

      expect(result).toEqual({ branch: 'main', action: 'current' });
    });

    it('should list branches with "list" action', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('* main\n  feature/test\n  remotes/origin/main');

      const result = await registry.get('git-branch')!.execute(
        createContext({
          step: { id: 'branch_1', type: 'git-branch', config: { action: 'list' } },
        })
      );

      expect(result).toMatchObject({
        action: 'list',
        branches: [
          { name: 'main', current: true, isRemote: false },
          { name: 'feature/test', current: false, isRemote: false },
          { name: 'remotes/origin/main', current: false, isRemote: true },
        ],
      });
    });

    it('should create branch with "create" action', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('');

      const result = await registry.get('git-branch')!.execute(
        createContext({
          step: {
            id: 'branch_1',
            type: 'git-branch',
            config: { action: 'create', branch: 'new-feature' },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['branch', 'new-feature'], '/test/project');
      expect(result).toEqual({ branch: 'new-feature', action: 'create', created: true });
    });

    it('should create branch with force flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('');

      const result = await registry.get('git-branch')!.execute(
        createContext({
          step: {
            id: 'branch_1',
            type: 'git-branch',
            config: { action: 'create', branch: 'existing-branch', force: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['branch', '-f', 'existing-branch'],
        '/test/project'
      );
      expect(result).toMatchObject({ created: true });
    });

    it('should throw error when creating branch without name', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);

      await expect(
        registry.get('git-branch')!.execute(
          createContext({
            step: { id: 'branch_1', type: 'git-branch', config: { action: 'create' } },
          })
        )
      ).rejects.toThrow('git-branch create requires config.branch');
    });

    it('should delete branch with "delete" action', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('');

      const result = await registry.get('git-branch')!.execute(
        createContext({
          step: {
            id: 'branch_1',
            type: 'git-branch',
            config: { action: 'delete', branch: 'old-feature' },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['branch', '-d', 'old-feature'], '/test/project');
      expect(result).toEqual({ branch: 'old-feature', action: 'delete', deleted: true });
    });

    it('should force delete branch with force flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('');

      const result = await registry.get('git-branch')!.execute(
        createContext({
          step: {
            id: 'branch_1',
            type: 'git-branch',
            config: { action: 'delete', branch: 'unmerged-branch', force: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['branch', '-D', 'unmerged-branch'],
        '/test/project'
      );
      expect(result).toMatchObject({ deleted: true });
    });

    it('should throw error when deleting branch without name', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);

      await expect(
        registry.get('git-branch')!.execute(
          createContext({
            step: { id: 'branch_1', type: 'git-branch', config: { action: 'delete' } },
          })
        )
      ).rejects.toThrow('git-branch delete requires config.branch');
    });

    it('should use input as branch name when config.branch is not provided', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('');

      const result = await registry.get('git-branch')!.execute(
        createContext({
          step: {
            id: 'branch_1',
            type: 'git-branch',
            config: { action: 'create' },
          },
          input: 'input-branch-name',
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['branch', 'input-branch-name'], '/test/project');
      expect(result).toMatchObject({ branch: 'input-branch-name' });
    });
  });

  describe('git-commit', () => {
    it('should register git-commit executor', () => {
      expect(registry.get('git-commit')).toBeDefined();
    });

    it('should throw error when path is not a git repository', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(false);

      await expect(
        registry.get('git-commit')!.execute(
          createContext({
            step: { id: 'commit_1', type: 'git-commit', config: { message: 'test' } },
          })
        )
      ).rejects.toThrow('is not a git repository');
    });

    it('should throw error when message is not provided', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);

      await expect(
        registry.get('git-commit')!.execute(
          createContext({
            step: { id: 'commit_1', type: 'git-commit' },
          })
        )
      ).rejects.toThrow('git-commit requires config.message');
    });

    it('should commit all changes with config.all', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand)
        .mockResolvedValueOnce('') // git add
        .mockResolvedValueOnce('[main abc123] Test commit message\n1 file changed');

      const result = await registry.get('git-commit')!.execute(
        createContext({
          step: {
            id: 'commit_1',
            type: 'git-commit',
            config: { message: 'Test commit message', all: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['add', '-A'], '/test/project');
      expect(execGitCommand).toHaveBeenCalledWith(
        ['commit', '-m', 'Test commit message'],
        '/test/project'
      );
      expect(result).toMatchObject({
        success: true,
        message: 'Test commit message',
        hash: 'abc123',
      });
    });

    it('should commit specific files with config.files', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand)
        .mockResolvedValueOnce('') // git add file1.ts
        .mockResolvedValueOnce('') // git add file2.ts
        .mockResolvedValueOnce('[main def456] Commit specific files');

      const result = await registry.get('git-commit')!.execute(
        createContext({
          step: {
            id: 'commit_1',
            type: 'git-commit',
            config: {
              message: 'Commit specific files',
              files: ['file1.ts', 'file2.ts'],
            },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['add', 'file1.ts'], '/test/project');
      expect(execGitCommand).toHaveBeenCalledWith(['add', 'file2.ts'], '/test/project');
      expect(result).toMatchObject({
        success: true,
        hash: 'def456',
      });
    });

    it('should use input as message when config.message is not provided', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('[main xyz789] Input message');

      const result = await registry.get('git-commit')!.execute(
        createContext({
          step: { id: 'commit_1', type: 'git-commit' },
          input: 'Input message',
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['commit', '-m', 'Input message'],
        '/test/project'
      );
      expect(result).toMatchObject({ message: 'Input message' });
    });

    it('should handle "nothing to commit" gracefully', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      const gitError = new Error('nothing to commit, working tree clean') as Error & {
        stderr?: string;
      };
      vi.mocked(execGitCommand).mockRejectedValue(gitError);

      const result = await registry.get('git-commit')!.execute(
        createContext({
          step: {
            id: 'commit_1',
            type: 'git-commit',
            config: { message: 'Empty commit' },
          },
        })
      );

      expect(result).toMatchObject({
        success: true,
        nothingToCommit: true,
        hash: null,
      });
    });

    it('should create empty commit with allowEmpty flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('[main empty123] Empty commit allowed');

      const result = await registry.get('git-commit')!.execute(
        createContext({
          step: {
            id: 'commit_1',
            type: 'git-commit',
            config: { message: 'Empty commit', allowEmpty: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['commit', '-m', 'Empty commit', '--allow-empty'],
        '/test/project'
      );
      expect(result).toMatchObject({ success: true });
    });

    it('should rethrow non-"nothing to commit" errors', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      const gitError = new Error('Some other git error');
      vi.mocked(execGitCommand).mockRejectedValue(gitError);

      await expect(
        registry.get('git-commit')!.execute(
          createContext({
            step: {
              id: 'commit_1',
              type: 'git-commit',
              config: { message: 'Test' },
            },
          })
        )
      ).rejects.toThrow('Some other git error');
    });
  });

  describe('git-push', () => {
    it('should register git-push executor', () => {
      expect(registry.get('git-push')).toBeDefined();
    });

    it('should throw error when path is not a git repository', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(false);

      await expect(
        registry.get('git-push')!.execute(
          createContext({
            step: { id: 'push_1', type: 'git-push' },
          })
        )
      ).rejects.toThrow('is not a git repository');
    });

    it('should push to default remote and branch', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');
      vi.mocked(execGitCommand).mockResolvedValue(
        'To github.com:repo.git\n   abc123..def456  main -> main'
      );

      const result = await registry.get('git-push')!.execute(
        createContext({
          step: { id: 'push_1', type: 'git-push' },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['push', 'origin', 'main'], '/test/project');
      expect(result).toMatchObject({
        success: true,
        remote: 'origin',
        branch: 'main',
      });
    });

    it('should push to specified remote and branch', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('Push successful');

      const result = await registry.get('git-push')!.execute(
        createContext({
          step: {
            id: 'push_1',
            type: 'git-push',
            config: { remote: 'upstream', branch: 'develop' },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['push', 'upstream', 'develop'], '/test/project');
      expect(result).toMatchObject({
        success: true,
        remote: 'upstream',
        branch: 'develop',
      });
    });

    it('should push with force flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('feature');
      vi.mocked(execGitCommand).mockResolvedValue('Force push successful');

      const result = await registry.get('git-push')!.execute(
        createContext({
          step: {
            id: 'push_1',
            type: 'git-push',
            config: { force: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['push', '--force', 'origin', 'feature'],
        '/test/project'
      );
      expect(result).toMatchObject({ success: true, force: true });
    });

    it('should push with upstream flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('new-branch');
      vi.mocked(execGitCommand).mockResolvedValue('Branch new-branch set up to track remote');

      const result = await registry.get('git-push')!.execute(
        createContext({
          step: {
            id: 'push_1',
            type: 'git-push',
            config: { setUpstream: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['push', '-u', 'origin', 'new-branch'],
        '/test/project'
      );
      expect(result).toMatchObject({ success: true, setUpstream: true });
    });

    it('should handle push failure gracefully', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');
      const gitError = new Error('Push rejected') as Error & { stderr?: string };
      gitError.stderr = 'remote: Permission denied';
      vi.mocked(execGitCommand).mockRejectedValue(gitError);

      const result = await registry.get('git-push')!.execute(
        createContext({
          step: { id: 'push_1', type: 'git-push' },
        })
      );

      expect(result).toMatchObject({
        success: false,
        error: 'Push rejected',
        stderr: 'remote: Permission denied',
      });
    });
  });

  describe('git-pull', () => {
    it('should register git-pull executor', () => {
      expect(registry.get('git-pull')).toBeDefined();
    });

    it('should throw error when path is not a git repository', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(false);

      await expect(
        registry.get('git-pull')!.execute(
          createContext({
            step: { id: 'pull_1', type: 'git-pull' },
          })
        )
      ).rejects.toThrow('is not a git repository');
    });

    it('should pull from default remote', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');
      vi.mocked(execGitCommand).mockResolvedValue(
        'Updating abc123..def456\nFast-forward\n file1.ts | 2 +-'
      );

      const result = await registry.get('git-pull')!.execute(
        createContext({
          step: { id: 'pull_1', type: 'git-pull' },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['pull', 'origin'], '/test/project');
      expect(result).toMatchObject({
        success: true,
        remote: 'origin',
        branch: 'main',
        alreadyUpToDate: false,
      });
    });

    it('should use default remote constant (origin)', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');
      vi.mocked(execGitCommand).mockResolvedValue('Already up to date.');

      await registry.get('git-pull')!.execute(
        createContext({
          step: { id: 'pull_1', type: 'git-pull' },
        })
      );

      // Verify it uses 'origin' as default remote (not a hardcoded string in the implementation)
      expect(execGitCommand).toHaveBeenCalledWith(
        expect.arrayContaining(['pull', 'origin']),
        '/test/project'
      );
    });

    it('should pull from specified remote and branch', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('develop');
      vi.mocked(execGitCommand).mockResolvedValue('Pull successful');

      const result = await registry.get('git-pull')!.execute(
        createContext({
          step: {
            id: 'pull_1',
            type: 'git-pull',
            config: { remote: 'upstream', branch: 'main' },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['pull', 'upstream', 'main'], '/test/project');
      expect(result).toMatchObject({
        success: true,
        remote: 'upstream',
        branch: 'main',
      });
    });

    it('should pull with rebase flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('feature');
      vi.mocked(execGitCommand).mockResolvedValue('Rebase successful');

      const result = await registry.get('git-pull')!.execute(
        createContext({
          step: {
            id: 'pull_1',
            type: 'git-pull',
            config: { rebase: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['pull', '--rebase', 'origin'], '/test/project');
      expect(result).toMatchObject({ success: true, rebase: true });
    });

    it('should detect "Already up to date" status', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(getCurrentBranch).mockResolvedValue('main');
      vi.mocked(execGitCommand).mockResolvedValue('Already up to date.');

      const result = await registry.get('git-pull')!.execute(
        createContext({
          step: { id: 'pull_1', type: 'git-pull' },
        })
      );

      expect(result).toMatchObject({
        success: true,
        alreadyUpToDate: true,
      });
    });

    it('should handle pull failure gracefully', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      const gitError = new Error('Merge conflict') as Error & { stderr?: string };
      gitError.stderr = 'CONFLICT (content): Merge conflict in file.ts';
      vi.mocked(execGitCommand).mockRejectedValue(gitError);

      const result = await registry.get('git-pull')!.execute(
        createContext({
          step: { id: 'pull_1', type: 'git-pull' },
        })
      );

      expect(result).toMatchObject({
        success: false,
        error: 'Merge conflict',
      });
    });
  });

  describe('git-checkout', () => {
    it('should register git-checkout executor', () => {
      expect(registry.get('git-checkout')).toBeDefined();
    });

    it('should throw error when path is not a git repository', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(false);

      await expect(
        registry.get('git-checkout')!.execute(
          createContext({
            step: { id: 'checkout_1', type: 'git-checkout', config: { branch: 'main' } },
          })
        )
      ).rejects.toThrow('is not a git repository');
    });

    it('should switch to existing branch', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue("Switched to branch 'feature'");
      vi.mocked(getCurrentBranch).mockResolvedValue('feature');

      const result = await registry.get('git-checkout')!.execute(
        createContext({
          step: {
            id: 'checkout_1',
            type: 'git-checkout',
            config: { branch: 'feature' },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['checkout', 'feature'], '/test/project');
      expect(result).toMatchObject({
        success: true,
        action: 'switch',
        previousBranch: 'feature',
        currentBranch: 'feature',
        created: false,
      });
    });

    it('should create and switch to new branch with createBranch flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue("Switched to a new branch 'new-feature'");
      vi.mocked(getCurrentBranch).mockResolvedValue('new-feature');

      const result = await registry.get('git-checkout')!.execute(
        createContext({
          step: {
            id: 'checkout_1',
            type: 'git-checkout',
            config: { branch: 'new-feature', createBranch: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['checkout', '-b', 'new-feature'],
        '/test/project'
      );
      expect(result).toMatchObject({
        success: true,
        action: 'create-and-switch',
        created: true,
      });
    });

    it('should use input as branch name when config.branch is not provided', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue("Switched to branch 'input-branch'");
      vi.mocked(getCurrentBranch).mockResolvedValue('input-branch');

      const result = await registry.get('git-checkout')!.execute(
        createContext({
          step: { id: 'checkout_1', type: 'git-checkout' },
          input: 'input-branch',
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(['checkout', 'input-branch'], '/test/project');
      expect(result).toMatchObject({ previousBranch: 'input-branch' });
    });

    it('should force checkout with force flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('Switched to branch');
      vi.mocked(getCurrentBranch).mockResolvedValue('feature');

      const result = await registry.get('git-checkout')!.execute(
        createContext({
          step: {
            id: 'checkout_1',
            type: 'git-checkout',
            config: { branch: 'feature', force: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['checkout', '--force', 'feature'],
        '/test/project'
      );
      // Verify success - force flag affects the command but is not in the result for switch action
      expect(result).toMatchObject({ success: true, action: 'switch' });
    });

    it('should restore files when files array is provided', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('Restored files');

      const result = await registry.get('git-checkout')!.execute(
        createContext({
          step: {
            id: 'checkout_1',
            type: 'git-checkout',
            config: { files: ['file1.ts', 'file2.ts'] },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['checkout', '--', 'file1.ts', 'file2.ts'],
        '/test/project'
      );
      expect(result).toMatchObject({
        success: true,
        action: 'restore',
        files: ['file1.ts', 'file2.ts'],
      });
    });

    it('should restore files with force flag', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      vi.mocked(execGitCommand).mockResolvedValue('Restored files');

      const result = await registry.get('git-checkout')!.execute(
        createContext({
          step: {
            id: 'checkout_1',
            type: 'git-checkout',
            config: { files: ['file1.ts'], force: true },
          },
        })
      );

      expect(execGitCommand).toHaveBeenCalledWith(
        ['checkout', '--force', '--', 'file1.ts'],
        '/test/project'
      );
      expect(result).toMatchObject({ action: 'restore', force: true });
    });

    it('should throw error when neither branch nor files is provided', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);

      await expect(
        registry.get('git-checkout')!.execute(
          createContext({
            step: { id: 'checkout_1', type: 'git-checkout' },
          })
        )
      ).rejects.toThrow('git-checkout requires config.branch or config.files');
    });

    it('should handle checkout failure gracefully', async () => {
      vi.mocked(isGitRepo).mockResolvedValue(true);
      const gitError = new Error('pathspec') as Error & { stderr?: string };
      gitError.stderr = "error: pathspec 'nonexistent' did not match any file(s) known to git";
      vi.mocked(execGitCommand).mockRejectedValue(gitError);

      const result = await registry.get('git-checkout')!.execute(
        createContext({
          step: {
            id: 'checkout_1',
            type: 'git-checkout',
            config: { branch: 'nonexistent' },
          },
        })
      );

      expect(result).toMatchObject({
        success: false,
        branch: 'nonexistent',
        error: 'pathspec',
      });
    });
  });

  describe('All git steps are registered', () => {
    it('should register all 6 git automation step executors', () => {
      expect(registry.get('git-status')).toBeDefined();
      expect(registry.get('git-branch')).toBeDefined();
      expect(registry.get('git-commit')).toBeDefined();
      expect(registry.get('git-push')).toBeDefined();
      expect(registry.get('git-pull')).toBeDefined();
      expect(registry.get('git-checkout')).toBeDefined();
    });
  });
});
