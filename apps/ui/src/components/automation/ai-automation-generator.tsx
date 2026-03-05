/**
 * AI Automation Generator - Generate and refine automations using natural language
 *
 * Provides a dialog with:
 * - Text input for describing desired automations
 * - Preview of generated steps with change highlighting
 * - Conversational refinement panel for iterative updates
 * - Direct integration with the automation editor
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Send,
  AlertTriangle,
  ChevronRight,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getStepSummary,
  automationApiRequest,
  getAutomationRequestHeaders,
} from '@/lib/automation-utils';
import { getAutomationStepUiDefinition } from '@/components/automation/step-registry';
import type { AutomationDefinition } from '@automaker/types';
import { useAppStore } from '@/store/app-store';

interface GenerateResponse {
  success: boolean;
  definition: Omit<AutomationDefinition, 'version' | 'id' | 'scope'>;
  warnings: string[];
  changes?: string[];
  error?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  warnings?: string[];
  changes?: string[];
}

interface AiAutomationGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: (definition: Omit<AutomationDefinition, 'version' | 'scope'>) => void;
  automationId: string;
}

const EXAMPLE_PROMPTS = [
  'When a feature is completed, run the test suite and commit the results',
  'Every morning at 9 AM, check for outdated dependencies and create a report',
  'Analyze recent commits for potential bugs and send a summary via HTTP webhook',
  'Create a daily standup summary from git activity',
];

export function AiAutomationGenerator({
  open,
  onOpenChange,
  onAccept,
  automationId,
}: AiAutomationGeneratorProps) {
  const defaultFeatureModel = useAppStore((s) => s.defaultFeatureModel);
  const currentProject = useAppStore((s) => s.currentProject);
  const effectiveDefaultModel = currentProject?.defaultFeatureModel ?? defaultFeatureModel;

  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDefinition, setGeneratedDefinition] = useState<Omit<
    AutomationDefinition,
    'version' | 'id' | 'scope'
  > | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [refinementInput, setRefinementInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [changedStepIds, setChangedStepIds] = useState<Set<string>>(new Set());
  const refinementInputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const resetState = useCallback(() => {
    setPrompt('');
    setIsGenerating(false);
    setGeneratedDefinition(null);
    setWarnings([]);
    setWarningsExpanded(false);
    setConversation([]);
    setRefinementInput('');
    setIsRefining(false);
    setChangedStepIds(new Set());
  }, []);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    setIsGenerating(true);
    setWarnings([]);
    setChangedStepIds(new Set());

    try {
      const response = await automationApiRequest<GenerateResponse>('/api/automation/generate', {
        method: 'POST',
        headers: getAutomationRequestHeaders(),
        body: JSON.stringify({ prompt: trimmedPrompt, defaultModel: effectiveDefaultModel }),
      });

      if (!response.success || !response.definition) {
        throw new Error(response.error || 'Failed to generate automation');
      }

      setGeneratedDefinition(response.definition);
      setWarnings(response.warnings || []);
      setConversation([
        { role: 'user', content: trimmedPrompt },
        {
          role: 'assistant',
          content: `Generated "${response.definition.name}" with ${response.definition.steps.length} step${response.definition.steps.length === 1 ? '' : 's'}.`,
          warnings: response.warnings,
        },
      ]);

      // All steps are new on initial generation
      setChangedStepIds(new Set(response.definition.steps.map((s) => s.id)));
    } catch (error) {
      toast.error('Failed to generate automation', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, effectiveDefaultModel]);

  const handleRefine = useCallback(async () => {
    const trimmedInput = refinementInput.trim();
    if (!trimmedInput || !generatedDefinition) return;

    setIsRefining(true);

    try {
      const previousStepIds = new Set(generatedDefinition.steps.map((s) => s.id));

      const response = await automationApiRequest<GenerateResponse>(
        '/api/automation/generate/refine',
        {
          method: 'POST',
          headers: getAutomationRequestHeaders(),
          body: JSON.stringify({
            prompt: trimmedInput,
            currentDefinition: generatedDefinition,
            defaultModel: effectiveDefaultModel,
          }),
        }
      );

      if (!response.success || !response.definition) {
        throw new Error(response.error || 'Failed to refine automation');
      }

      // Determine which steps were changed/added
      const newChangedIds = new Set<string>();
      for (const step of response.definition.steps) {
        if (!previousStepIds.has(step.id)) {
          // New step
          newChangedIds.add(step.id);
        } else {
          // Check if step was modified
          const prevStep = generatedDefinition.steps.find((s) => s.id === step.id);
          if (prevStep && JSON.stringify(prevStep) !== JSON.stringify(step)) {
            newChangedIds.add(step.id);
          }
        }
      }

      setGeneratedDefinition(response.definition);
      setWarnings(response.warnings || []);
      setChangedStepIds(newChangedIds);
      setConversation((prev) => [
        ...prev,
        { role: 'user', content: trimmedInput },
        {
          role: 'assistant',
          content: response.changes?.length
            ? `Updated: ${response.changes.join(', ')}`
            : `Refined automation with ${response.definition.steps.length} step${response.definition.steps.length === 1 ? '' : 's'}.`,
          warnings: response.warnings,
          changes: response.changes,
        },
      ]);
      setRefinementInput('');

      // Scroll to bottom of conversation
      setTimeout(() => {
        conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      toast.error('Failed to refine automation', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRefining(false);
    }
  }, [refinementInput, generatedDefinition, effectiveDefaultModel]);

  const handleAccept = useCallback(() => {
    if (!generatedDefinition) return;

    onAccept({
      ...generatedDefinition,
      id: automationId,
    });
    onOpenChange(false);
    resetState();
  }, [generatedDefinition, automationId, onAccept, onOpenChange, resetState]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>, action: () => void) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        action();
      }
    },
    []
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) resetState();
      }}
    >
      <DialogContent className="sm:max-w-4xl" data-testid="ai-generator-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-500" />
            Generate Automation with AI
          </DialogTitle>
          <DialogDescription>
            Describe your desired workflow in plain language and AI will generate a structured
            automation for you.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto space-y-4 pr-1">
          {/* Initial prompt input (shown when no definition generated yet) */}
          {!generatedDefinition && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Describe your automation... e.g., 'When a task is moved to Done, run the test suite and notify the team via webhook'"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleGenerate)}
                  className="min-h-[120px]"
                  disabled={isGenerating}
                  data-testid="ai-prompt-input"
                />
                <p className="text-xs text-muted-foreground">
                  Press Enter to generate, Shift+Enter for new line
                </p>
              </div>

              {/* Example prompts */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Try an example:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {EXAMPLE_PROMPTS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="text-left text-xs p-2.5 rounded-md border border-border/60 hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating}
                className="w-full"
                data-testid="generate-button"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Automation
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Generated result with refinement */}
          {generatedDefinition && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Generated automation preview */}
              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{generatedDefinition.name}</CardTitle>
                    {generatedDefinition.description && (
                      <CardDescription>{generatedDefinition.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Trigger: {generatedDefinition.trigger.type}</Badge>
                      <Badge variant="outline">
                        {generatedDefinition.steps.length} step
                        {generatedDefinition.steps.length === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Step list with change highlighting */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[280px] pr-3">
                      <div className="space-y-2">
                        {generatedDefinition.steps.map((step, index) => {
                          const definition = getAutomationStepUiDefinition(step.type);
                          const isChanged = changedStepIds.has(step.id);
                          return (
                            <div
                              key={step.id}
                              className={cn(
                                'rounded-md border p-2.5 transition-colors',
                                isChanged
                                  ? 'border-brand-500/50 bg-brand-500/5'
                                  : 'border-border/60'
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-muted-foreground font-mono mt-0.5">
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium truncate">
                                      {step.name || definition?.title || step.type}
                                    </p>
                                    {isChanged && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 h-4 bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/30"
                                      >
                                        {conversation.length <= 2 ? 'new' : 'changed'}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {getStepSummary(step)}
                                  </p>
                                  {step.name?.startsWith('[Unknown Type]') && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                        This step needs review - action could not be mapped to a
                                        known type
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Warnings */}
                {warnings.length > 0 && (
                  <Collapsible open={warningsExpanded} onOpenChange={setWarningsExpanded}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-sm text-left flex-1 min-w-0"
                        >
                          <ChevronRight
                            className={cn(
                              'w-4 h-4 transition-transform',
                              warningsExpanded && 'rotate-90'
                            )}
                          />
                          <span className="font-medium">
                            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="mt-2 px-3 py-2 rounded-md border border-border/60 text-sm space-y-1">
                        {warnings.map((warning, i) => (
                          <p key={i} className="text-amber-600 dark:text-amber-400 text-xs">
                            {warning}
                          </p>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>

              {/* Right: Conversation & refinement panel */}
              <div className="space-y-3">
                <Card className="flex flex-col h-full">
                  <CardHeader className="pb-2 flex-shrink-0">
                    <CardTitle className="text-sm">Refine with AI</CardTitle>
                    <CardDescription className="text-xs">
                      Type follow-up instructions to modify the automation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-1 min-h-0 gap-3">
                    {/* Conversation history */}
                    <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] pr-3">
                      <div className="space-y-3">
                        {conversation.map((msg, i) => (
                          <div
                            key={i}
                            className={cn(
                              'text-xs rounded-md p-2.5',
                              msg.role === 'user'
                                ? 'bg-muted/50 ml-6'
                                : 'bg-brand-500/5 border border-brand-500/20 mr-6'
                            )}
                          >
                            <p className="font-medium text-[10px] text-muted-foreground mb-1">
                              {msg.role === 'user' ? 'You' : 'AI'}
                            </p>
                            <p>{msg.content}</p>
                            {msg.changes && msg.changes.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5">
                                {msg.changes.map((change, ci) => (
                                  <li
                                    key={ci}
                                    className="text-muted-foreground flex items-start gap-1"
                                  >
                                    <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    {change}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                        <div ref={conversationEndRef} />
                      </div>
                    </ScrollArea>

                    {/* Refinement input */}
                    <div className="flex gap-2 flex-shrink-0">
                      <Textarea
                        ref={refinementInputRef}
                        placeholder='e.g., "also send an email" or "remove the delay step"'
                        value={refinementInput}
                        onChange={(e) => setRefinementInput(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, handleRefine)}
                        className="min-h-[60px] text-sm flex-1"
                        disabled={isRefining}
                        data-testid="refinement-input"
                      />
                      <Button
                        size="icon"
                        onClick={handleRefine}
                        disabled={!refinementInput.trim() || isRefining}
                        className="flex-shrink-0 self-end"
                        data-testid="refine-button"
                      >
                        {isRefining ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {generatedDefinition && (
            <Button
              variant="outline"
              onClick={() => {
                setGeneratedDefinition(null);
                setWarnings([]);
                setConversation([]);
                setChangedStepIds(new Set());
                setPrompt('');
              }}
              className="mr-auto"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Start Over
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetState();
            }}
          >
            Cancel
          </Button>
          {generatedDefinition && (
            <Button onClick={handleAccept} data-testid="accept-automation-button">
              <ArrowRight className="w-4 h-4 mr-2" />
              Open in Editor
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
