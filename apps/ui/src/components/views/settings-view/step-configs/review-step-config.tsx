/**
 * Review Step Configuration
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { PipelineStepConfig, ReviewConfig } from '@automaker/types';

interface ReviewStepConfigProps {
  config: PipelineStepConfig;
  onChange: (config: PipelineStepConfig) => void;
}

export function ReviewStepConfig({ config, onChange }: ReviewStepConfigProps) {
  const reviewConfig = (config.config as ReviewConfig) || {};

  const updateConfig = (updates: Partial<ReviewConfig>) => {
    onChange({
      ...config,
      config: {
        ...reviewConfig,
        ...updates,
      },
    });
  };

  const focusOptions = [
    { id: 'quality', label: 'Code Quality' },
    { id: 'standards', label: 'Standards Compliance' },
    { id: 'bugs', label: 'Bug Detection' },
    { id: 'best-practices', label: 'Best Practices' },
  ];

  const toggleFocus = (focusId: string) => {
    const currentFocus = reviewConfig.focus || [];
    const newFocus = currentFocus.includes(focusId as any)
      ? currentFocus.filter((f) => f !== focusId)
      : [...currentFocus, focusId as any];
    updateConfig({ focus: newFocus });
  };

  const addExcludePattern = () => {
    const patterns = reviewConfig.excludePatterns || [];
    updateConfig({
      excludePatterns: [...patterns, ''],
    });
  };

  const updateExcludePattern = (index: number, value: string) => {
    const patterns = [...(reviewConfig.excludePatterns || [])];
    patterns[index] = value;
    updateConfig({ excludePatterns: patterns });
  };

  const removeExcludePattern = (index: number) => {
    const patterns = [...(reviewConfig.excludePatterns || [])];
    patterns.splice(index, 1);
    updateConfig({ excludePatterns: patterns });
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-medium">Review Focus Areas</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Select what aspects of the code to review
        </p>

        <div className="flex flex-wrap gap-2">
          {focusOptions.map((option) => (
            <Badge
              key={option.id}
              variant={reviewConfig.focus?.includes(option.id as any) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleFocus(option.id)}
            >
              {option.label}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-base font-medium">Exclude Patterns</Label>
        <p className="text-sm text-muted-foreground mb-3">
          File patterns to exclude from review (glob patterns)
        </p>

        <div className="space-y-2">
          {(reviewConfig.excludePatterns || []).map((pattern, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={pattern}
                onChange={(e) => updateExcludePattern(index, e.target.value)}
                placeholder="e.g., *.test.ts, **/generated/**"
                className="flex-1"
              />
              <Button variant="ghost" size="sm" onClick={() => removeExcludePattern(index)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addExcludePattern} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Pattern
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="maxIssues">Maximum Issues</Label>
          <Input
            id="maxIssues"
            type="number"
            min="1"
            max="100"
            value={reviewConfig.maxIssues || 20}
            onChange={(e) =>
              updateConfig({
                maxIssues: parseInt(e.target.value) || 20,
              })
            }
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">Maximum number of issues to report</p>
        </div>

        <div className="flex items-center space-x-2 mt-6">
          <Switch
            checked={reviewConfig.includeTests ?? true}
            onCheckedChange={(checked) => updateConfig({ includeTests: checked })}
          />
          <Label>Include Test Files</Label>
        </div>
      </div>
    </div>
  );
}
