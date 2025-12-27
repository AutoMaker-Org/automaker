/**
 * Custom Step Configuration Component
 *
 * Provides UI for configuring custom prompt-based pipeline steps.
 * Allows users to define custom prompts, success criteria, looping behavior,
 * memory settings, and CodeRabbit integration options.
 */

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Info, Plus, X, ExternalLink, RotateCcw, Brain } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PipelineStepConfig, CustomConfig } from '@automaker/types';
import { useAppStore } from '@/store/app-store';

interface CustomStepConfigProps {
  config: PipelineStepConfig;
  onChange: (config: PipelineStepConfig) => void;
}

export function CustomStepConfig({ config, onChange }: CustomStepConfigProps) {
  const customConfig = (config.config as CustomConfig) || {};
  const [showVariableHelper, setShowVariableHelper] = useState(false);
  const { apiKeys } = useAppStore();
  const hasCodeRabbitKey = !!(apiKeys.coderabbit && apiKeys.coderabbit.trim());

  const updateConfig = (updates: Partial<CustomConfig>) => {
    onChange({
      ...config,
      config: {
        ...customConfig,
        ...updates,
      },
    });
  };

  const availableVariables = [
    { variable: '{{feature.id}}', description: 'Feature ID' },
    { variable: '{{featureTitle}}', description: 'Feature title' },
    { variable: '{{featureDescription}}', description: 'Feature description' },
    { variable: '{{featureStatus}}', description: 'Feature status' },
  ];

  const codeRabbitRules = [
    'code-style',
    'bug-risk',
    'performance',
    'security',
    'best-practices',
    'complexity',
    'documentation',
    'error-handling',
  ];

  const toggleCodeRabbitRule = (rule: string) => {
    const rules = customConfig.coderabbitRules || [];
    const newRules = rules.includes(rule) ? rules.filter((r) => r !== rule) : [...rules, rule];
    updateConfig({ coderabbitRules: newRules });
  };

  const addCustomRule = () => {
    const rules = customConfig.coderabbitCustomRules || [];
    updateConfig({
      coderabbitCustomRules: [...rules, ''],
    });
  };

  const updateCustomRule = (index: number, value: string) => {
    const rules = [...(customConfig.coderabbitCustomRules || [])];
    rules[index] = value;
    updateConfig({ coderabbitCustomRules: rules });
  };

  const removeCustomRule = (index: number) => {
    const rules = [...(customConfig.coderabbitCustomRules || [])];
    rules.splice(index, 1);
    updateConfig({ coderabbitCustomRules: rules });
  };

  const insertVariable = (variable: string) => {
    const prompt = customConfig.prompt || '';
    const newPrompt = prompt + variable;
    updateConfig({ prompt: newPrompt });
  };

  return (
    <div className="space-y-6">
      {/* Prompt Template */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-base font-medium">Prompt Template</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowVariableHelper(!showVariableHelper)}
          >
            <Info className="w-4 h-4 mr-2" />
            Variables
          </Button>
        </div>

        {showVariableHelper && (
          <Alert className="mb-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p>Available variables:</p>
                <div className="flex flex-wrap gap-2">
                  {availableVariables.map((v) => (
                    <Badge
                      key={v.variable}
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => insertVariable(v.variable)}
                    >
                      {v.variable}
                    </Badge>
                  ))}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Textarea
          value={customConfig.prompt || ''}
          onChange={(e) => updateConfig({ prompt: e.target.value })}
          placeholder="Enter your custom prompt here. Use variables to include feature context."
          rows={8}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Define what the AI should evaluate or perform
        </p>
      </div>

      {/* Success Criteria */}
      <div>
        <Label htmlFor="successCriteria" className="text-base font-medium">
          Success Criteria
        </Label>
        <Textarea
          id="successCriteria"
          value={customConfig.successCriteria || ''}
          onChange={(e) => updateConfig({ successCriteria: e.target.value })}
          placeholder="Define what constitutes a successful completion (optional)"
          rows={3}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Leave empty to use default success detection
        </p>
      </div>

      <Separator />

      {/* Loop Feature */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          <Label className="text-base font-medium">Loop Configuration</Label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={config.loopUntilSuccess ?? false}
              onCheckedChange={(checked) => onChange({ ...config, loopUntilSuccess: checked })}
            />
            <Label>Loop Until Success</Label>
          </div>

          <div>
            <Label htmlFor="maxLoops">Max Loops</Label>
            <Input
              id="maxLoops"
              type="number"
              min="1"
              max="10"
              value={config.maxLoops || 1}
              onChange={(e) =>
                onChange({
                  ...config,
                  maxLoops: parseInt(e.target.value) || 1,
                })
              }
              className="mt-1"
            />
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            When enabled, the step will repeat until it passes or reaches the maximum loop count.
            Use with memory to avoid repeating the same feedback.
          </AlertDescription>
        </Alert>
      </div>

      <Separator />

      {/* Memory Feature */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" />
          <Label className="text-base font-medium">Memory System</Label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={config.memoryEnabled ?? false}
            onCheckedChange={(checked) => onChange({ ...config, memoryEnabled: checked })}
          />
          <Label>Enable Memory</Label>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Remembers previous feedback to avoid repeating the same issues across iterations. Works
            best with the loop feature enabled.
          </AlertDescription>
        </Alert>
      </div>

      <Separator />

      {/* CodeRabbit Integration */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            <Label>CodeRabbit Integration</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              checked={customConfig.coderabbitEnabled ?? false}
              onCheckedChange={(checked) => updateConfig({ coderabbitEnabled: checked })}
              disabled={!hasCodeRabbitKey}
            />
            <Label>Enable</Label>
          </div>
        </div>
        {!hasCodeRabbitKey && (
          <p className="text-sm text-muted-foreground">
            Configure your CodeRabbit API key in Settings &gt; API Keys to enable this feature.
          </p>
        )}

        {customConfig.coderabbitEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div>
              <Label className="text-sm font-medium">Standard Rules</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {codeRabbitRules.map((rule) => (
                  <Badge
                    key={rule}
                    variant={customConfig.coderabbitRules?.includes(rule) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleCodeRabbitRule(rule)}
                  >
                    {rule}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Custom Rules</Label>
              <div className="space-y-2 mt-2">
                {(customConfig.coderabbitCustomRules || []).map((rule, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={rule}
                      onChange={(e) => updateCustomRule(index, e.target.value)}
                      placeholder="e.g., no-console-logs"
                      className="flex-1"
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeCustomRule(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={addCustomRule} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Custom Rule
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="coderabbitSeverity">Severity Level</Label>
                <Select
                  value={customConfig.coderabbitSeverity || 'warning'}
                  onValueChange={(value) => updateConfig({ coderabbitSeverity: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="maxIssues">Max Issues</Label>
                <Input
                  id="maxIssues"
                  type="number"
                  min="1"
                  max="100"
                  value={customConfig.maxIssues || 20}
                  onChange={(e) =>
                    updateConfig({
                      maxIssues: parseInt(e.target.value) || 20,
                    })
                  }
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={customConfig.fallbackToAI ?? true}
                onCheckedChange={(checked) => updateConfig({ fallbackToAI: checked })}
              />
              <Label>Fallback to AI if CodeRabbit fails</Label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
