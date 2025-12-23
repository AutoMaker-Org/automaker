/**
 * Test Step Configuration Component
 *
 * Provides UI for configuring test analysis steps in the pipeline.
 * Allows users to set coverage thresholds, enable quality checks,
 * and configure patterns for test files to include or exclude.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PipelineStepConfig, TestConfig } from '@automaker/types';

interface TestStepConfigProps {
  config: PipelineStepConfig;
  onChange: (config: PipelineStepConfig) => void;
}

export function TestStepConfig({ config, onChange }: TestStepConfigProps) {
  const testConfig = (config.config || {}) as TestConfig;

  const handleChange = (updates: Partial<TestConfig>) => {
    const newConfig: PipelineStepConfig = {
      ...config,
      config: {
        ...testConfig,
        ...updates,
      },
    };
    onChange(newConfig);
  };

  const addExcludePattern = () => {
    const patterns = testConfig.excludePatterns || [];
    handleChange({
      excludePatterns: [...patterns, ''],
    });
  };

  const updateExcludePattern = (index: number, value: string) => {
    const patterns = [...(testConfig.excludePatterns || [])];
    patterns[index] = value;
    handleChange({ excludePatterns: patterns });
  };

  const removeExcludePattern = (index: number) => {
    const patterns = [...(testConfig.excludePatterns || [])];
    patterns.splice(index, 1);
    handleChange({ excludePatterns: patterns });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="coverageThreshold">Coverage Threshold (%)</Label>
          <Input
            id="coverageThreshold"
            type="number"
            min="0"
            max="100"
            value={testConfig.coverageThreshold || 80}
            onChange={(e) =>
              handleChange({
                coverageThreshold: parseInt(e.target.value) || 80,
              })
            }
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Minimum code coverage percentage required
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={testConfig.checkQuality ?? true}
              onCheckedChange={(checked) => handleChange({ checkQuality: checked })}
            />
            <Label>Check Test Quality</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={testConfig.checkAssertions ?? true}
              onCheckedChange={(checked) => handleChange({ checkAssertions: checked })}
            />
            <Label>Check Assertions</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={testConfig.includeIntegration ?? false}
              onCheckedChange={(checked) => handleChange({ includeIntegration: checked })}
            />
            <Label>Include Integration Tests</Label>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-base font-medium">Exclude Patterns</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Test file patterns to exclude from coverage analysis
        </p>

        <div className="space-y-2">
          {(testConfig.excludePatterns || []).map((pattern, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={pattern}
                onChange={(e) => updateExcludePattern(index, e.target.value)}
                placeholder="e.g., *.spec.ts, **/e2e/**"
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

      <div className="p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">Test Quality Checks</h4>
        <div className="text-sm space-y-1">
          <div className="text-foreground font-medium">
            <strong>Coverage:</strong> Ensures sufficient code is tested
          </div>
          <div
            className={
              (testConfig.checkQuality ?? true)
                ? 'text-foreground font-medium'
                : 'text-muted-foreground'
            }
          >
            <strong>Test Quality:</strong> Validates test structure and naming
          </div>
          <div
            className={
              (testConfig.checkAssertions ?? true)
                ? 'text-foreground font-medium'
                : 'text-muted-foreground'
            }
          >
            <strong>Assertions:</strong> Checks for proper test assertions
          </div>
          <div
            className={
              (testConfig.includeIntegration ?? false)
                ? 'text-foreground font-medium'
                : 'text-muted-foreground'
            }
          >
            <strong>Integration Tests:</strong> Includes end-to-end test coverage
          </div>
        </div>
      </div>
    </div>
  );
}
