import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FlaskConical,
  Settings2,
  TestTube,
  GitBranch,
  AlertCircle,
  Zap,
  ClipboardList,
  FileText,
  ScrollText,
  ShieldCheck,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AIProfile } from '@/store/app-store';

type PlanningMode = 'skip' | 'lite' | 'spec' | 'full';

interface FeatureDefaultsSectionProps {
  showProfilesOnly: boolean;
  defaultSkipTests: boolean;
  enableDependencyBlocking: boolean;
  useWorktrees: boolean;
  defaultPlanningMode: PlanningMode;
  defaultRequirePlanApproval: boolean;
  defaultAIProfileId: string | null;
  aiProfiles: AIProfile[];
  onShowProfilesOnlyChange: (value: boolean) => void;
  onDefaultSkipTestsChange: (value: boolean) => void;
  onEnableDependencyBlockingChange: (value: boolean) => void;
  onUseWorktreesChange: (value: boolean) => void;
  onDefaultPlanningModeChange: (value: PlanningMode) => void;
  onDefaultRequirePlanApprovalChange: (value: boolean) => void;
  onDefaultAIProfileIdChange: (value: string | null) => void;
}

export function FeatureDefaultsSection({
  showProfilesOnly,
  defaultSkipTests,
  enableDependencyBlocking,
  useWorktrees,
  defaultPlanningMode,
  defaultRequirePlanApproval,
  defaultAIProfileId,
  aiProfiles,
  onShowProfilesOnlyChange,
  onDefaultSkipTestsChange,
  onEnableDependencyBlockingChange,
  onUseWorktreesChange,
  onDefaultPlanningModeChange,
  onDefaultRequirePlanApprovalChange,
  onDefaultAIProfileIdChange,
}: FeatureDefaultsSectionProps) {
  // Find the selected profile name for display
  const selectedProfile = defaultAIProfileId
    ? aiProfiles.find((p) => p.id === defaultAIProfileId)
    : null;
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
            <div className="border-t border-border/30" />
          </>
        )}

        {/* Separator */}
        {defaultPlanningMode === 'skip' && <div className="border-t border-border/30" />}

        {/* Default AI Profile */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <div className="w-10 h-10 mt-0.5 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10">
            <User className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default AI Profile</Label>
              <Select
                value={defaultAIProfileId ?? 'none'}
                onValueChange={(v: string) => onDefaultAIProfileIdChange(v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-[180px] h-8" data-testid="default-ai-profile-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">None (pick manually)</span>
                  </SelectItem>
                  {aiProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      <span>{profile.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {selectedProfile
                ? `New features will use the "${selectedProfile.name}" profile (${selectedProfile.model}, ${selectedProfile.thinkingLevel} thinking).`
                : 'Pre-select an AI profile when creating new features. Choose "None" to pick manually each time.'}
            </p>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Profiles Only Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="show-profiles-only"
            checked={showProfilesOnly}
            onCheckedChange={(checked) => onShowProfilesOnlyChange(checked === true)}
            className="mt-1"
            data-testid="show-profiles-only-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="show-profiles-only"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4 text-brand-500" />
              Show profiles only by default
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, the Add Feature dialog will show only AI profiles and hide advanced
              model tweaking options. This creates a cleaner, less overwhelming UI.
            </p>
          </div>
        </div>

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

        {/* Worktree Isolation Setting */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="use-worktrees"
            checked={useWorktrees}
            onCheckedChange={(checked) => onUseWorktreesChange(checked === true)}
            className="mt-1"
            data-testid="use-worktrees-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="use-worktrees"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <GitBranch className="w-4 h-4 text-brand-500" />
              Enable Git Worktree Isolation
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/20 font-medium">
                experimental
              </span>
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Creates isolated git branches for each feature. When disabled, agents work directly in
              the main project directory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
