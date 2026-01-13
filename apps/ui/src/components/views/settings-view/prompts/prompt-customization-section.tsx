import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MessageSquareText,
  Bot,
  KanbanSquare,
  Sparkles,
  RotateCcw,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PromptCustomization, CustomPrompt } from '@automaker/types';
import {
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
} from '@automaker/prompts';

interface PromptCustomizationSectionProps {
  promptCustomization?: PromptCustomization;
  onPromptCustomizationChange: (customization: PromptCustomization) => void;
}

interface PromptFieldProps {
  label: string;
  description: string;
  defaultValue: string;
  customValue?: CustomPrompt;
  onCustomValueChange: (value: CustomPrompt | undefined) => void;
  critical?: boolean; // Whether this prompt requires strict output format
}

/**
 * Calculate dynamic minimum height based on content length
 * Ensures long prompts have adequate space
 */
function calculateMinHeight(text: string): string {
  const lines = text.split('\n').length;
  const estimatedLines = Math.max(lines, Math.ceil(text.length / 80));

  // Min 120px, scales up for longer content, max 600px
  const minHeight = Math.min(Math.max(120, estimatedLines * 20), 600);
  return `${minHeight}px`;
}

/**
 * PromptField Component
 *
 * Shows a prompt with a toggle to switch between default and custom mode.
 * - Toggle OFF: Shows default prompt in read-only mode, custom value is preserved but not used
 * - Toggle ON: Allows editing, custom value is used instead of default
 *
 * IMPORTANT: Custom value is ALWAYS preserved, even when toggle is OFF.
 * This prevents users from losing their work when temporarily switching to default.
 */
function PromptField({
  label,
  description,
  defaultValue,
  customValue,
  onCustomValueChange,
  critical = false,
}: PromptFieldProps) {
  const isEnabled = customValue?.enabled ?? false;
  const displayValue = isEnabled ? (customValue?.value ?? defaultValue) : defaultValue;
  const minHeight = calculateMinHeight(displayValue);

  const handleToggle = (enabled: boolean) => {
    // When toggling, preserve the existing custom value if it exists,
    // otherwise initialize with the default value.
    const value = customValue?.value ?? defaultValue;
    onCustomValueChange({ value, enabled });
  };

  const handleTextChange = (newValue: string) => {
    // Only allow editing when enabled
    if (isEnabled) {
      onCustomValueChange({ value: newValue, enabled: true });
    }
  };

  return (
    <div className="space-y-2">
      {critical && isEnabled && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-500">Critical Prompt</p>
            <p className="text-xs text-muted-foreground mt-1">
              This prompt requires a specific output format. Changing it incorrectly may break
              functionality. Only modify if you understand the expected structure.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label htmlFor={label} className="text-sm font-medium">
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{isEnabled ? 'Custom' : 'Default'}</span>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-brand-500"
          />
        </div>
      </div>
      <Textarea
        id={label}
        value={displayValue}
        onChange={(e) => handleTextChange(e.target.value)}
        readOnly={!isEnabled}
        style={{ minHeight }}
        className={cn(
          'font-mono text-xs resize-y',
          !isEnabled && 'cursor-not-allowed bg-muted/50 text-muted-foreground'
        )}
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * PromptCustomizationSection Component
 *
 * Allows users to customize AI prompts for different parts of the application:
 * - Auto Mode (feature implementation)
 * - Agent Runner (interactive chat)
 * - Backlog Plan (Kanban planning)
 * - Enhancement (feature description improvement)
 */
export function PromptCustomizationSection({
  promptCustomization = {},
  onPromptCustomizationChange,
}: PromptCustomizationSectionProps) {
  const [activeTab, setActiveTab] = useState('auto-mode');

  const updatePrompt = <T extends keyof PromptCustomization>(
    category: T,
    field: keyof NonNullable<PromptCustomization[T]>,
    value: CustomPrompt | undefined
  ) => {
    const updated = {
      ...promptCustomization,
      [category]: {
        ...promptCustomization[category],
        [field]: value,
      },
    };
    onPromptCustomizationChange(updated);
  };

  const resetToDefaults = (category: keyof PromptCustomization) => {
    const updated = {
      ...promptCustomization,
      [category]: {},
    };
    onPromptCustomizationChange(updated);
  };

  const resetAllToDefaults = () => {
    onPromptCustomizationChange({});
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
      data-testid="prompt-customization-section"
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <MessageSquareText className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Prompt Customization
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={resetAllToDefaults} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset All to Defaults
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Customize AI prompts for Auto Mode, Agent Runner, and other features.
        </p>
      </div>

      {/* Info Banner */}
      <div className="px-6 pt-6">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm text-foreground font-medium">How to Customize Prompts</p>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Toggle the switch to enable custom mode and edit the prompt. When disabled, the
              default built-in prompt is used. You can use the default as a starting point by
              enabling the toggle.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="auto-mode" className="gap-2">
              <Bot className="w-4 h-4" />
              Auto Mode
            </TabsTrigger>
            <TabsTrigger value="agent" className="gap-2">
              <MessageSquareText className="w-4 h-4" />
              Agent
            </TabsTrigger>
            <TabsTrigger value="backlog-plan" className="gap-2">
              <KanbanSquare className="w-4 h-4" />
              Backlog Plan
            </TabsTrigger>
            <TabsTrigger value="enhancement" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Enhancement
            </TabsTrigger>
          </TabsList>

          {/* Auto Mode Tab */}
          <TabsContent value="auto-mode" className="space-y-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Auto Mode Prompts</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetToDefaults('autoMode')}
                className="gap-2"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Section
              </Button>
            </div>

            {/* Info Banner for Auto Mode */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm text-foreground font-medium">Planning Mode Markers</p>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  Planning prompts use special markers like{' '}
                  <code className="px-1 py-0.5 rounded bg-muted text-xs">[PLAN_GENERATED]</code> and{' '}
                  <code className="px-1 py-0.5 rounded bg-muted text-xs">[SPEC_GENERATED]</code> to
                  control the Auto Mode workflow. These markers must be preserved for proper
                  functionality.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <PromptField
                label="Planning: Lite Mode"
                description="Quick planning outline without approval requirement"
                defaultValue={DEFAULT_AUTO_MODE_PROMPTS.planningLite}
                customValue={promptCustomization?.autoMode?.planningLite}
                onCustomValueChange={(value) => updatePrompt('autoMode', 'planningLite', value)}
                critical={true}
              />

              <PromptField
                label="Planning: Lite with Approval"
                description="Planning outline that waits for user approval"
                defaultValue={DEFAULT_AUTO_MODE_PROMPTS.planningLiteWithApproval}
                customValue={promptCustomization?.autoMode?.planningLiteWithApproval}
                onCustomValueChange={(value) =>
                  updatePrompt('autoMode', 'planningLiteWithApproval', value)
                }
                critical={true}
              />

              <PromptField
                label="Planning: Spec Mode"
                description="Detailed specification with task breakdown"
                defaultValue={DEFAULT_AUTO_MODE_PROMPTS.planningSpec}
                customValue={promptCustomization?.autoMode?.planningSpec}
                onCustomValueChange={(value) => updatePrompt('autoMode', 'planningSpec', value)}
                critical={true}
              />

              <PromptField
                label="Planning: Full SDD Mode"
                description="Comprehensive Software Design Document with phased implementation"
                defaultValue={DEFAULT_AUTO_MODE_PROMPTS.planningFull}
                customValue={promptCustomization?.autoMode?.planningFull}
                onCustomValueChange={(value) => updatePrompt('autoMode', 'planningFull', value)}
                critical={true}
              />
            </div>
          </TabsContent>

          {/* Agent Tab */}
          <TabsContent value="agent" className="space-y-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Agent Runner Prompts</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetToDefaults('agent')}
                className="gap-2"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Section
              </Button>
            </div>

            <div className="space-y-4">
              <PromptField
                label="System Prompt"
                description="Defines the AI's role and behavior in interactive chat sessions"
                defaultValue={DEFAULT_AGENT_PROMPTS.systemPrompt}
                customValue={promptCustomization?.agent?.systemPrompt}
                onCustomValueChange={(value) => updatePrompt('agent', 'systemPrompt', value)}
              />
            </div>
          </TabsContent>

          {/* Backlog Plan Tab */}
          <TabsContent value="backlog-plan" className="space-y-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Backlog Planning Prompts</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetToDefaults('backlogPlan')}
                className="gap-2"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Section
              </Button>
            </div>

            {/* Critical Warning for Backlog Plan */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm text-foreground font-medium">Warning: Critical Prompts</p>
                <p className="text-xs text-muted-foreground/80 leading-relaxed">
                  Backlog plan prompts require a strict JSON output format. Modifying these prompts
                  incorrectly can break the backlog planning feature and potentially corrupt your
                  feature data. Only customize if you fully understand the expected output
                  structure.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <PromptField
                label="System Prompt"
                description="Defines how the AI modifies the feature backlog (Plan button on Kanban board)"
                defaultValue={DEFAULT_BACKLOG_PLAN_PROMPTS.systemPrompt}
                customValue={promptCustomization?.backlogPlan?.systemPrompt}
                onCustomValueChange={(value) => updatePrompt('backlogPlan', 'systemPrompt', value)}
                critical={true}
              />
            </div>
          </TabsContent>

          {/* Enhancement Tab */}
          <TabsContent value="enhancement" className="space-y-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Enhancement Prompts</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetToDefaults('enhancement')}
                className="gap-2"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Section
              </Button>
            </div>

            <div className="space-y-4">
              <PromptField
                label="Improve Mode"
                description="Transform vague requests into clear, actionable tasks"
                defaultValue={DEFAULT_ENHANCEMENT_PROMPTS.improveSystemPrompt}
                customValue={promptCustomization?.enhancement?.improveSystemPrompt}
                onCustomValueChange={(value) =>
                  updatePrompt('enhancement', 'improveSystemPrompt', value)
                }
              />

              <PromptField
                label="Technical Mode"
                description="Add implementation details and technical specifications"
                defaultValue={DEFAULT_ENHANCEMENT_PROMPTS.technicalSystemPrompt}
                customValue={promptCustomization?.enhancement?.technicalSystemPrompt}
                onCustomValueChange={(value) =>
                  updatePrompt('enhancement', 'technicalSystemPrompt', value)
                }
              />

              <PromptField
                label="Simplify Mode"
                description="Make verbose descriptions concise and focused"
                defaultValue={DEFAULT_ENHANCEMENT_PROMPTS.simplifySystemPrompt}
                customValue={promptCustomization?.enhancement?.simplifySystemPrompt}
                onCustomValueChange={(value) =>
                  updatePrompt('enhancement', 'simplifySystemPrompt', value)
                }
              />

              <PromptField
                label="Acceptance Criteria Mode"
                description="Add testable acceptance criteria to descriptions"
                defaultValue={DEFAULT_ENHANCEMENT_PROMPTS.acceptanceSystemPrompt}
                customValue={promptCustomization?.enhancement?.acceptanceSystemPrompt}
                onCustomValueChange={(value) =>
                  updatePrompt('enhancement', 'acceptanceSystemPrompt', value)
                }
              />

              <PromptField
                label="User Experience Mode"
                description="Review and enhance from a user experience and design perspective"
                defaultValue={DEFAULT_ENHANCEMENT_PROMPTS.uxReviewerSystemPrompt}
                customValue={promptCustomization?.enhancement?.uxReviewerSystemPrompt}
                onCustomValueChange={(value) =>
                  updatePrompt('enhancement', 'uxReviewerSystemPrompt', value)
                }
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
