/**
 * Performance Step Configuration
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PipelineStepConfig, PerformanceConfig } from '@automaker/types';

interface PerformanceStepConfigProps {
  config: PipelineStepConfig;
  onChange: (config: PipelineStepConfig) => void;
}

export function PerformanceStepConfig({ config, onChange }: PerformanceStepConfigProps) {
  const performanceConfig = (config.config as PerformanceConfig) || {};

  const updateConfig = (updates: Partial<PerformanceConfig>) => {
    onChange({
      ...config,
      config: {
        ...performanceConfig,
        ...updates,
      },
    });
  };

  const metricOptions = [
    {
      id: 'complexity',
      label: 'Algorithm Complexity',
      description: 'Cyclomatic complexity of functions',
      defaultThreshold: 15,
    },
    {
      id: 'memory',
      label: 'Memory Usage',
      description: 'Peak memory consumption during execution',
      defaultThreshold: 512,
    },
    {
      id: 'cpu',
      label: 'CPU Performance',
      description: 'Execution time of critical paths',
      defaultThreshold: 1000,
    },
    {
      id: 'network',
      label: 'Network Requests',
      description: 'Number and efficiency of API calls',
      defaultThreshold: 10,
    },
    {
      id: 'bundle-size',
      label: 'Bundle Size',
      description: 'Size of compiled JavaScript bundles',
      defaultThreshold: 500,
    },
  ];

  const toggleMetric = (metricId: string) => {
    const metrics = performanceConfig.metrics || [];
    const thresholds = performanceConfig.thresholds || {};
    const isCurrentlySelected = metrics.includes(metricId as any);

    if (isCurrentlySelected) {
      // Removing metric - also remove its threshold
      const { [metricId]: _, ...remainingThresholds } = thresholds;
      updateConfig({
        metrics: metrics.filter((m) => m !== metricId),
        thresholds: remainingThresholds,
      });
    } else {
      // Adding metric - set default threshold
      const metricOption = metricOptions.find((m) => m.id === metricId);
      updateConfig({
        metrics: [...metrics, metricId as any],
        thresholds: {
          ...thresholds,
          [metricId]: metricOption?.defaultThreshold || 0,
        },
      });
    }
  };

  const updateThreshold = (metric: string, value: string) => {
    const thresholds = performanceConfig.thresholds || {};
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      updateConfig({
        thresholds: {
          ...thresholds,
          [metric]: numValue,
        },
      });
    }
  };

  const getThresholdValue = (metric: string) => {
    return performanceConfig.thresholds?.[metric] || '';
  };

  const getThresholdLabel = (metric: string) => {
    switch (metric) {
      case 'complexity':
        return 'Maximum cyclomatic complexity';
      case 'memory':
        return 'Maximum memory usage (MB)';
      case 'cpu':
        return 'Maximum CPU time (ms)';
      case 'network':
        return 'Maximum requests per operation';
      case 'bundle-size':
        return 'Maximum bundle size (KB)';
      default:
        return 'Threshold value';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-medium">Performance Metrics</Label>
        <p className="text-sm text-muted-foreground mb-3">Select performance aspects to analyze</p>

        <div className="flex flex-wrap gap-2">
          {metricOptions.map((option) => (
            <Badge
              key={option.id}
              variant={
                performanceConfig.metrics?.includes(option.id as any) ? 'default' : 'outline'
              }
              className="cursor-pointer"
              onClick={() => toggleMetric(option.id)}
            >
              {option.label}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-base font-medium">Performance Thresholds</Label>
        <p className="text-sm text-muted-foreground mb-3">
          Set maximum acceptable values for each metric
        </p>

        <div className="space-y-3">
          {(performanceConfig.metrics || []).map((metric) => (
            <div key={metric} className="flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor={`threshold-${metric}`} className="text-sm">
                  {metric.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </Label>
                <Input
                  id={`threshold-${metric}`}
                  type="number"
                  step="0.1"
                  min="0"
                  value={getThresholdValue(metric)}
                  onChange={(e) => updateThreshold(metric, e.target.value)}
                  placeholder={getThresholdLabel(metric)}
                  className="mt-1"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={performanceConfig.profile ?? false}
          onCheckedChange={(checked) => updateConfig({ profile: checked })}
        />
        <Label>Enable Performance Profiling</Label>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">Performance Metrics Explained</h4>
        <div className="text-sm space-y-1">
          {metricOptions.map((metric) => {
            const isSelected = performanceConfig.metrics?.includes(metric.id as any);
            return (
              <div
                key={metric.id}
                className={isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}
              >
                <strong>{metric.label}:</strong> {metric.description}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
