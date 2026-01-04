import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileCode, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodexApprovalPolicy, CodexSandboxMode } from '@automaker/types';
import { OpenAIIcon } from '@/components/ui/provider-icon';

interface CodexSettingsProps {
  autoLoadCodexAgents: boolean;
  codexSandboxMode: CodexSandboxMode;
  codexApprovalPolicy: CodexApprovalPolicy;
  onAutoLoadCodexAgentsChange: (enabled: boolean) => void;
  onCodexSandboxModeChange: (mode: CodexSandboxMode) => void;
  onCodexApprovalPolicyChange: (policy: CodexApprovalPolicy) => void;
}

const CARD_TITLE = 'Codex CLI Settings';
const CARD_SUBTITLE = 'Configure Codex instructions and execution safety defaults.';
const AGENTS_TITLE = 'Auto-load AGENTS.nd Instructions';
const AGENTS_DESCRIPTION = 'Automatically inject project instructions from';
const AGENTS_PATH = '.codex/AGENTS.nd';
const AGENTS_SUFFIX = 'on each Codex run.';
const SANDBOX_TITLE = 'Sandbox Policy';
const APPROVAL_TITLE = 'Approval Policy';
const SANDBOX_SELECT_LABEL = 'Select sandbox policy';
const APPROVAL_SELECT_LABEL = 'Select approval policy';

const SANDBOX_OPTIONS: Array<{
  value: CodexSandboxMode;
  label: string;
  description: string;
}> = [
  {
    value: 'read-only',
    label: 'Read-only',
    description: 'Only allow safe, non-mutating commands.',
  },
  {
    value: 'workspace-write',
    label: 'Workspace write',
    description: 'Allow file edits inside the project workspace.',
  },
  {
    value: 'danger-full-access',
    label: 'Full access',
    description: 'Allow unrestricted commands (use with care).',
  },
];

const APPROVAL_OPTIONS: Array<{
  value: CodexApprovalPolicy;
  label: string;
  description: string;
}> = [
  {
    value: 'untrusted',
    label: 'Untrusted',
    description: 'Ask for approval for most commands.',
  },
  {
    value: 'on-failure',
    label: 'On failure',
    description: 'Ask only if a command fails in the sandbox.',
  },
  {
    value: 'on-request',
    label: 'On request',
    description: 'Let the agent decide when to ask.',
  },
  {
    value: 'never',
    label: 'Never',
    description: 'Never ask for approval (least restrictive).',
  },
];

export function CodexSettings({
  autoLoadCodexAgents,
  codexSandboxMode,
  codexApprovalPolicy,
  onAutoLoadCodexAgentsChange,
  onCodexSandboxModeChange,
  onCodexApprovalPolicyChange,
}: CodexSettingsProps) {
  const sandboxOption = SANDBOX_OPTIONS.find((option) => option.value === codexSandboxMode);
  const approvalOption = APPROVAL_OPTIONS.find((option) => option.value === codexApprovalPolicy);

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <OpenAIIcon className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">{CARD_TITLE}</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">{CARD_SUBTITLE}</p>
      </div>
      <div className="p-6 space-y-5">
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="auto-load-codex-agents"
            checked={autoLoadCodexAgents}
            onCheckedChange={(checked) => onAutoLoadCodexAgentsChange(checked === true)}
            className="mt-1"
            data-testid="auto-load-codex-agents-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-load-codex-agents"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <FileCode className="w-4 h-4 text-brand-500" />
              {AGENTS_TITLE}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {AGENTS_DESCRIPTION}{' '}
              <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">{AGENTS_PATH}</code>{' '}
              {AGENTS_SUFFIX}
            </p>
          </div>
        </div>

        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div className="w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
            <ShieldCheck className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-foreground font-medium">{SANDBOX_TITLE}</Label>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  {sandboxOption?.description}
                </p>
              </div>
              <Select
                value={codexSandboxMode}
                onValueChange={(value) => onCodexSandboxModeChange(value as CodexSandboxMode)}
              >
                <SelectTrigger className="w-[180px] h-8" data-testid="codex-sandbox-select">
                  <SelectValue aria-label={SANDBOX_SELECT_LABEL} />
                </SelectTrigger>
                <SelectContent>
                  {SANDBOX_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-foreground font-medium">{APPROVAL_TITLE}</Label>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  {approvalOption?.description}
                </p>
              </div>
              <Select
                value={codexApprovalPolicy}
                onValueChange={(value) => onCodexApprovalPolicyChange(value as CodexApprovalPolicy)}
              >
                <SelectTrigger className="w-[180px] h-8" data-testid="codex-approval-select">
                  <SelectValue aria-label={APPROVAL_SELECT_LABEL} />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
