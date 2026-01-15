import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  onDefaultSkipTestsChange: (value: boolean) => void;
  onEnableDependencyBlockingChange: (value: boolean) => void;
  onSkipVerificationInAutoModeChange: (value: boolean) => void;
  onDefaultPlanningModeChange: (value: PlanningMode) => void;
  onDefaultRequirePlanApprovalChange: (value: boolean) => void;
  onEnableAiCommitMessagesChange: (value: boolean) => void;
  onDefaultFeatureModelChange: (value: PhaseModelEntry) => void;
}

export function FeatureDefaultsSection({
  defaultSkipTests,
  enableDependencyBlocking,
  skipVerificationInAutoMode,
  defaultPlanningMode,
  defaultRequirePlanApproval,
  enableAiCommitMessages,
  defaultFeatureModel,
  onDefaultSkipTestsChange,
  onEnableDependencyBlockingChange,
  onSkipVerificationInAutoModeChange,
  onDefaultPlanningModeChange,
  onDefaultRequirePlanApprovalChange,
  onEnableAiCommitMessagesChange,
  onDefaultFeatureModelChange,
}: FeatureDefaultsSectionProps) {
  const { t } = useTranslation('settings');

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
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            {t('sections.featureDefaults.title')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          {t('sections.featureDefaults.description')}
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
              <Label className="text-foreground font-medium">
                {t('sections.featureDefaults.defaultModel')}
              </Label>
              <PhaseModelSelector
                value={defaultFeatureModel}
                onChange={onDefaultFeatureModelChange}
                compact
                align="end"
              />
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {t('sections.featureDefaults.defaultModelDescription')}
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
              <Label className="text-foreground font-medium">
                {t('sections.featureDefaults.planningMode')}
              </Label>
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
                      <span>{t('planningModes.skip')}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({t('sections.featureDefaults.default')})
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="lite">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
                      <span>{t('planningModes.lite')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="spec">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-purple-500" />
                      <span>{t('planningModes.spec')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full">
                    <div className="flex items-center gap-2">
                      <ScrollText className="h-3.5 w-3.5 text-amber-500" />
                      <span>{t('planningModes.full')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {defaultPlanningMode === 'skip' &&
                t('sections.featureDefaults.planningModeSkipDescription')}
              {defaultPlanningMode === 'lite' &&
                t('sections.featureDefaults.planningModeLiteDescription')}
              {defaultPlanningMode === 'spec' &&
                t('sections.featureDefaults.planningModeSpecDescription')}
              {defaultPlanningMode === 'full' &&
                t('sections.featureDefaults.planningModeFullDescription')}
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
                  {t('sections.featureDefaults.requirePlanApproval')}
                </Label>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  {t('sections.featureDefaults.requirePlanApprovalDescription')}
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
              {t('sections.featureDefaults.enableAutomatedTesting')}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {t('sections.featureDefaults.enableAutomatedTestingDescription')}
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
              {t('sections.featureDefaults.enableDependencyBlocking')}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {t('sections.featureDefaults.enableDependencyBlockingDescription')}
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
              {t('sections.featureDefaults.skipVerificationInAutoMode')}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {t('sections.featureDefaults.skipVerificationInAutoModeDescription')}
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
              {t('sections.featureDefaults.generateAiCommitMessages')}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {t('sections.featureDefaults.generateAiCommitMessagesDescription')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
