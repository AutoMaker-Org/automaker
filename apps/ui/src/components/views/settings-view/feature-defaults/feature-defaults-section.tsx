import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  FlaskConical,
  TestTube,
  AlertCircle,
  Zap,
  ClipboardList,
  FileText,
  ScrollText,
  ShieldCheck,
  FastForward,
  Sparkles,
  Cpu,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PhaseModelEntry } from '@automaker/types';
import { PhaseModelSelector } from '../model-defaults/phase-model-selector';

type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

interface FeatureDefaultsSectionProps {
  defaultSkipTests: boolean;
  enableDependencyBlocking: boolean;
  skipVerificationInAutoMode: boolean;
  defaultPlanningMode: PlanningMode;
  defaultRequirePlanApproval: boolean;
  enableAiCommitMessages: boolean;
  defaultFeatureModel: PhaseModelEntry;
  defaultMaxTurns: number;
  onDefaultSkipTestsChange: (value: boolean) => void;
  onEnableDependencyBlockingChange: (value: boolean) => void;
  onSkipVerificationInAutoModeChange: (value: boolean) => void;
  onDefaultPlanningModeChange: (value: PlanningMode) => void;
  onDefaultRequirePlanApprovalChange: (value: boolean) => void;
  onEnableAiCommitMessagesChange: (value: boolean) => void;
  onDefaultFeatureModelChange: (value: PhaseModelEntry) => void;
  onDefaultMaxTurnsChange: (value: number) => void;
}

export function FeatureDefaultsSection({
  defaultSkipTests,
  enableDependencyBlocking,
  skipVerificationInAutoMode,
  defaultPlanningMode,
  defaultRequirePlanApproval,
  enableAiCommitMessages,
  defaultFeatureModel,
  defaultMaxTurns,
  onDefaultSkipTestsChange,
  onEnableDependencyBlockingChange,
  onSkipVerificationInAutoModeChange,
  onDefaultPlanningModeChange,
  onDefaultRequirePlanApprovalChange,
  onEnableAiCommitMessagesChange,
  onDefaultFeatureModelChange,
  onDefaultMaxTurnsChange,
}: FeatureDefaultsSectionProps) {
  const [maxTurnsInput, setMaxTurnsInput] = useState(String(defaultMaxTurns));

  // Keep the displayed input in sync if the prop changes after mount
  // (e.g. when settings are loaded asynchronously or reset from parent)
  useEffect(() => {
    setMaxTurnsInput(String(defaultMaxTurns));
  }, [defaultMaxTurns]);

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
            <FlaskConical className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Feature Defaults</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure default settings for new features.
        </p>
      </div>
      <div className="p-6 space-y-5">
        {/* Default Feature Model Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div className="w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
            <Cpu className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default Model</Label>
              <PhaseModelSelector
                value={defaultFeatureModel}
                onChange={onDefaultFeatureModelChange}
                compact
                align="end"
              />
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              The default AI model and thinking level used when creating new feature cards.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Max Turns Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div className="w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/10">
            <RotateCcw className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="default-max-turns" className="text-foreground font-medium">
                Max Agent Turns
              </Label>
              <Input
                id="default-max-turns"
                type="number"
                min={1}
                max={2000}
                step={1}
                value={maxTurnsInput}
                onChange={(e) => {
                  setMaxTurnsInput(e.target.value);
                }}
                onBlur={() => {
                  const value = Number(maxTurnsInput);
                  if (Number.isInteger(value) && value >= 1 && value <= 2000) {
                    onDefaultMaxTurnsChange(value);
                  } else {
                    // Reset to current valid value if invalid (including decimals like "1.5")
                    setMaxTurnsInput(String(defaultMaxTurns));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-[100px] h-8 text-right"
                data-testid="default-max-turns-input"
              />
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Maximum number of tool-call round-trips the AI agent can perform per feature. Higher
              values allow more complex tasks but use more API credits. Default: 1000, Range:
              1-2000. Supported by Claude and Codex providers.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Planning Mode Default */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div
            className={cn(
              'w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0',
              defaultPlanningMode === 'skip'
                ? 'bg-emerald-500/10'
                : defaultPlanningMode === 'lite'
                  ? 'bg-blue-500/10'
                  : defaultPlanningMode === 'spec'
                    ? 'bg-purple-500/10'
                    : 'bg-amber-500/10'
            )}
          >
            {defaultPlanningMode === 'skip' && <Zap className="w-5 h-5 text-emerald-500" />}
            {defaultPlanningMode === 'lite' && <ClipboardList className="w-5 h-5 text-blue-500" />}
            {defaultPlanningMode === 'spec' && <FileText className="w-5 h-5 text-purple-500" />}
            {defaultPlanningMode === 'full' && <ScrollText className="w-5 h-5 text-amber-500" />}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default Planning Mode</Label>
              <Select
                value={defaultPlanningMode}
                onValueChange={(v: string) => onDefaultPlanningModeChange(v as PlanningMode)}
              >
                <SelectTrigger className="w-[160px] h-8" data-testid="default-planning-mode-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Skip</span>
                      <span className="text-[10px] text-muted-foreground">(Default)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="lite">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
                      <span>Lite Planning</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="spec">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-purple-500" />
                      <span>Spec (Lite SDD)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full">
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-3.5 w-3.5 text-amber-500" />
                      <span>Full (SDD)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {defaultPlanningMode === 'skip' &&
                'Jump straight to implementation without upfront planning.'}
              {defaultPlanningMode === 'lite' &&
                'Create a quick planning outline with tasks before building.'}
              {defaultPlanningMode === 'spec' &&
                'Generate a specification with acceptance criteria for approval.'}
              {defaultPlanningMode === 'full' &&
                'Create comprehensive spec with phased implementation plan.'}
            </p>
          </div>
        </div>

        {/* Require Plan Approval Setting - only show when not skip */}
        {defaultPlanningMode !== 'skip' && (
          <>
            <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
              <Checkbox
                id="default-require-plan-approval"
                checked={defaultRequirePlanApproval}
                onCheckedChange={(checked) => onDefaultRequirePlanApprovalChange(checked === true)}
                className="mt-1"
                data-testid="default-require-plan-approval-checkbox"
              />
              <div className="space-y-1.5">
                <Label
                  htmlFor="default-require-plan-approval"
                  className="text-foreground cursor-pointer font-medium flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-brand-500" />
                  Require manual plan approval by default
                </Label>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  When enabled, the agent will pause after generating a plan and wait for you to
                  review, edit, and approve before starting implementation. You can also view the
                  plan from the feature card.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Automated Testing Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="default-skip-tests"
            checked={!defaultSkipTests}
            onCheckedChange={(checked) => onDefaultSkipTestsChange(checked !== true)}
            className="mt-1"
            data-testid="default-skip-tests-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="default-skip-tests"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <TestTube className="w-4 h-4 text-brand-500" />
              Enable automated testing by default
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, new features will use TDD with automated tests. When disabled, features
              will require manual verification.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Dependency Blocking Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="enable-dependency-blocking"
            checked={enableDependencyBlocking}
            onCheckedChange={(checked) => onEnableDependencyBlockingChange(checked === true)}
            className="mt-1"
            data-testid="enable-dependency-blocking-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="enable-dependency-blocking"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-brand-500" />
              Enable Dependency Blocking
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, features with incomplete dependencies will show blocked badges and
              warnings. Auto mode and backlog ordering always respect dependencies regardless of
              this setting.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Skip Verification in Auto Mode Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="skip-verification-auto-mode"
            checked={skipVerificationInAutoMode}
            onCheckedChange={(checked) => onSkipVerificationInAutoModeChange(checked === true)}
            className="mt-1"
            data-testid="skip-verification-auto-mode-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="skip-verification-auto-mode"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <FastForward className="w-4 h-4 text-brand-500" />
              Skip verification in auto mode
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, auto mode will grab features even if their dependencies are not
              verified, as long as they are not currently running. This allows faster pipeline
              execution without waiting for manual verification.
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* AI Commit Messages Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="enable-ai-commit-messages"
            checked={enableAiCommitMessages}
            onCheckedChange={(checked) => onEnableAiCommitMessagesChange(checked === true)}
            className="mt-1"
            data-testid="enable-ai-commit-messages-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="enable-ai-commit-messages"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-brand-500" />
              Generate AI commit messages
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, opening the commit dialog will automatically generate a commit message
              using AI based on your staged or unstaged changes. You can configure the model used in
              Model Defaults.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
