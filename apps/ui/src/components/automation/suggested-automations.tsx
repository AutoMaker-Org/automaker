import type {
  AutomationDefinition,
  AutomationStep,
  BuiltInAutomationStepType,
  PhaseModelEntry,
} from '@automaker/types';

export type SuggestedAutomationCategory =
  | 'development'
  | 'quality'
  | 'reporting'
  | 'maintenance'
  | 'workflow';

export interface SuggestedAutomation {
  id: string;
  icon: string;
  name: string;
  description: string;
  category: SuggestedAutomationCategory;
  buildDefinition: (
    nextId: string,
    defaultModel?: PhaseModelEntry
  ) => Omit<AutomationDefinition, 'version' | 'scope'>;
}

/**
 * Creates a sequential step builder that generates deterministic step IDs (step-1, step-2, etc.)
 * so that template variable references like `{{steps.step-1.output}}` correctly resolve at runtime.
 * When a defaultModel is provided, it is automatically set on run-ai-prompt steps.
 */
function createStepBuilder(defaultModel?: PhaseModelEntry) {
  let counter = 0;
  return (
    type: BuiltInAutomationStepType,
    name: string,
    config: Record<string, unknown> = {}
  ): AutomationStep => {
    counter += 1;
    const stepConfig =
      type === 'run-ai-prompt' && defaultModel && !config.model
        ? { ...config, model: defaultModel }
        : config;
    return { id: `step-${counter}`, type, name, config: stepConfig };
  };
}

export const SUGGESTED_AUTOMATIONS: SuggestedAutomation[] = [
  // --- Development ---
  {
    id: 'scan-recent-commits',
    icon: '\uD83D\uDC1B',
    name: 'Bug Scanner',
    description: 'Scan recent commits for potential bugs and suggest fixes.',
    category: 'development',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Bug Scanner',
        description:
          'Analyzes recent git commits to identify potential bugs and propose minimal fixes.',
        enabled: true,
        trigger: { type: 'schedule', cron: '0 9 * * 1-5' },
        steps: [
          step('run-script-exec', 'Get recent commits', {
            command: 'git log --oneline --since="24 hours ago" --no-merges',
          }),
          step('run-ai-prompt', 'Analyze for bugs', {
            prompt:
              'Review these recent commits and identify any potential bugs, regressions, or risky changes. For each issue found, suggest a minimal fix.\n\nCommits:\n{{steps.step-1.output}}',
          }),
        ],
      };
    },
  },
  {
    id: 'draft-release-notes',
    icon: '\uD83D\uDCCB',
    name: 'Release Notes Drafter',
    description: 'Draft release notes from merged PRs and commits.',
    category: 'reporting',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Release Notes Drafter',
        description: 'Generates weekly release notes from merged pull requests and recent commits.',
        enabled: true,
        trigger: { type: 'schedule', cron: '0 17 * * 5' },
        steps: [
          step('run-script-exec', 'Get merged commits', {
            command: 'git log --oneline --merges --since="7 days ago"',
          }),
          step('run-script-exec', 'Get all changes', {
            command: 'git log --oneline --no-merges --since="7 days ago"',
          }),
          step('run-ai-prompt', 'Draft release notes', {
            prompt:
              'Draft concise release notes from these changes. Group by category (Features, Fixes, Improvements). Use bullet points and include commit references where helpful.\n\nMerged PRs:\n{{steps.step-1.output}}\n\nAll commits:\n{{steps.step-2.output}}',
          }),
        ],
      };
    },
  },
  {
    id: 'daily-standup-summary',
    icon: '\u2615',
    name: 'Standup Summary',
    description: "Summarize yesterday's git activity for standup.",
    category: 'reporting',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Daily Standup Summary',
        description: "Generates a standup-ready summary of yesterday's development activity.",
        enabled: true,
        trigger: { type: 'schedule', cron: '0 8 * * 1-5' },
        steps: [
          step('run-script-exec', 'Get yesterday activity', {
            command: 'git log --oneline --since="yesterday" --until="today" --all --no-merges',
          }),
          step('run-script-exec', 'Get changed files', {
            command: 'git diff --stat HEAD~10 HEAD 2>/dev/null || echo "No recent changes"',
          }),
          step('run-ai-prompt', 'Generate standup', {
            prompt:
              "Summarize this git activity into a concise standup format with: What was done, What's in progress, Any blockers or notes.\n\nActivity:\n{{steps.step-1.output}}\n\nFiles changed:\n{{steps.step-2.output}}",
          }),
        ],
      };
    },
  },
  {
    id: 'feature-on-event',
    icon: '\u26A1',
    name: 'Auto-Create Feature on Event',
    description: 'Create a feature automatically when a specific event fires.',
    category: 'workflow',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Auto-Create Feature on Event',
        description:
          'Listens for a custom event and creates a feature with details from the event payload.',
        enabled: false,
        trigger: { type: 'event', event: 'feature_created' },
        steps: [
          step('create-feature', 'Create follow-up feature', {
            title: 'Follow-up: {{system.trigger_event}}',
            description: 'Automatically created from event trigger.',
            make: false,
          }),
        ],
      };
    },
  },
  {
    id: 'dependency-check',
    icon: '\uD83D\uDCE6',
    name: 'Dependency Checker',
    description: 'Scan for outdated dependencies and suggest safe upgrades.',
    category: 'maintenance',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Dependency Checker',
        description: 'Scans for outdated npm dependencies and proposes safe upgrade paths.',
        enabled: true,
        trigger: { type: 'schedule', cron: '0 10 * * 1' },
        steps: [
          step('run-script-exec', 'Check outdated deps', {
            command: 'npm outdated --json 2>/dev/null || echo "{}"',
          }),
          step('run-ai-prompt', 'Analyze upgrades', {
            prompt:
              'Analyze these outdated dependencies. Categorize each as: safe to upgrade (patch/minor), needs review (major), or skip. Propose a minimal upgrade plan that minimizes risk.\n\nOutdated:\n{{steps.step-1.output}}',
          }),
        ],
      };
    },
  },
  {
    id: 'test-coverage-gaps',
    icon: '\uD83E\uDDEA',
    name: 'Test Coverage Gaps',
    description: 'Identify untested code paths from recent changes.',
    category: 'quality',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Test Coverage Gaps',
        description:
          'Identifies recently changed files that may lack test coverage and suggests focused tests.',
        enabled: true,
        trigger: { type: 'manual' },
        steps: [
          step('run-script-exec', 'Get recently changed files', {
            command: 'git diff --name-only HEAD~5 HEAD -- "*.ts" "*.tsx" | head -20',
          }),
          step('run-ai-prompt', 'Find coverage gaps', {
            prompt:
              'Review these recently changed files and identify which ones likely need additional test coverage. Suggest specific test cases for the most critical gaps.\n\nChanged files:\n{{steps.step-1.output}}',
          }),
        ],
      };
    },
  },
  {
    id: 'pre-release-checklist',
    icon: '\u2705',
    name: 'Pre-Release Checklist',
    description: 'Verify changelog, tests, and build before tagging a release.',
    category: 'quality',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Pre-Release Checklist',
        description:
          'Runs verification checks before a release: tests, build, changelog, and migration status.',
        enabled: true,
        trigger: { type: 'manual' },
        steps: [
          step('run-script-exec', 'Run tests', {
            command: 'npm test 2>&1 | tail -20',
          }),
          step('run-script-exec', 'Check build', {
            command: 'npm run build 2>&1 | tail -10',
          }),
          step('run-script-exec', 'Check git status', {
            command: 'git status --short',
          }),
          step('run-ai-prompt', 'Generate release report', {
            prompt:
              'Based on these check results, generate a release readiness report. Flag any issues that should be resolved before tagging.\n\nTest results:\n{{steps.step-1.output}}\n\nBuild results:\n{{steps.step-2.output}}\n\nGit status:\n{{steps.step-3.output}}',
          }),
        ],
      };
    },
  },
  {
    id: 'weekly-digest',
    icon: '\uD83D\uDCCA',
    name: 'Weekly Project Digest',
    description: "Synthesize the week's PRs, commits, and activity into a summary.",
    category: 'reporting',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Weekly Project Digest',
        description: "Compiles the week's development activity into a structured summary report.",
        enabled: true,
        trigger: { type: 'schedule', cron: '0 17 * * 5' },
        steps: [
          step('run-script-exec', 'Get weekly commits', {
            command: 'git shortlog --summary --since="7 days ago" --no-merges',
          }),
          step('run-script-exec', 'Get files changed', {
            command:
              'git diff --stat @{7.days.ago} HEAD 2>/dev/null || git diff --stat HEAD~20 HEAD',
          }),
          step('run-ai-prompt', 'Create digest', {
            prompt:
              'Create a concise weekly development digest. Include: highlights, areas of active development, notable patterns, and any concerns.\n\nContributor activity:\n{{steps.step-1.output}}\n\nFiles changed:\n{{steps.step-2.output}}',
          }),
        ],
      };
    },
  },
  {
    id: 'on-success-notify',
    icon: '\uD83D\uDD14',
    name: 'Feature Completion Notifier',
    description: 'Run a script or webhook when a feature completes successfully.',
    category: 'workflow',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Feature Completion Notifier',
        description:
          'Triggers a notification (script, HTTP call, or event) when a feature finishes successfully.',
        enabled: false,
        trigger: { type: 'event', event: 'feature_success' },
        steps: [
          step('run-script-exec', 'Send notification', {
            command: 'echo "Feature completed successfully at $(date)"',
          }),
        ],
      };
    },
  },
  {
    id: 'git-branch-cleanup',
    icon: '\uD83E\uDDF9',
    name: 'Branch Cleanup',
    description: 'List stale branches that can be safely removed.',
    category: 'maintenance',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Branch Cleanup',
        description: 'Identifies merged and stale git branches that can be safely cleaned up.',
        enabled: true,
        trigger: { type: 'schedule', cron: '0 10 * * 1' },
        steps: [
          step('run-script-exec', 'List merged branches', {
            command:
              'git branch --merged main 2>/dev/null | grep -v "main\\|master\\|\\*" || echo "No merged branches"',
          }),
          step('run-script-exec', 'List stale branches', {
            command:
              'git for-each-ref --sort=committerdate --format="%(refname:short) %(committerdate:relative)" refs/heads/ | head -20',
          }),
          step('run-ai-prompt', 'Recommend cleanup', {
            prompt:
              'Review these branches and recommend which ones can be safely deleted. Be conservative - only suggest branches that are clearly merged or very old.\n\nMerged branches:\n{{steps.step-1.output}}\n\nAll branches by age:\n{{steps.step-2.output}}',
          }),
        ],
      };
    },
  },
  {
    id: 'error-handler',
    icon: '\uD83D\uDEA8',
    name: 'Feature Error Handler',
    description: 'Auto-create a fix task when a feature execution fails.',
    category: 'workflow',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Feature Error Handler',
        description:
          'Automatically creates a follow-up fix feature when a feature execution fails.',
        enabled: false,
        trigger: { type: 'event', event: 'feature_error' },
        steps: [
          step('create-feature', 'Create fix feature', {
            title: 'Fix: Error in previous feature run',
            description:
              'Investigate and fix the error from the failed feature execution. Check the run history for details.',
            make: false,
          }),
        ],
      };
    },
  },
  {
    id: 'code-quality-scan',
    icon: '\uD83D\uDD0D',
    name: 'Code Quality Scan',
    description: 'Run linting and type checks, then summarize issues.',
    category: 'quality',
    buildDefinition: (nextId, defaultModel) => {
      const step = createStepBuilder(defaultModel);
      return {
        id: nextId,
        name: 'Code Quality Scan',
        description:
          'Runs lint and type checking tools, then generates a prioritized summary of issues to fix.',
        enabled: true,
        trigger: { type: 'manual' },
        steps: [
          step('run-script-exec', 'Run linter', {
            command: 'npm run lint 2>&1 | tail -30 || echo "Lint command not found"',
          }),
          step('run-ai-prompt', 'Summarize issues', {
            prompt:
              'Summarize these code quality results. Group issues by severity and suggest which ones to fix first for the highest impact.\n\nLint results:\n{{steps.step-1.output}}',
          }),
        ],
      };
    },
  },
];

export const SUGGESTED_AUTOMATION_CATEGORIES = [
  { id: 'all' as const, label: 'All' },
  { id: 'development' as const, label: 'Development' },
  { id: 'quality' as const, label: 'Quality' },
  { id: 'reporting' as const, label: 'Reporting' },
  { id: 'maintenance' as const, label: 'Maintenance' },
  { id: 'workflow' as const, label: 'Workflow' },
] as const;

export type SuggestedAutomationCategoryFilter =
  (typeof SUGGESTED_AUTOMATION_CATEGORIES)[number]['id'];
