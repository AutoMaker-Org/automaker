/**
 * Pipeline Settings Section
 *
 * Allows users to configure and manage pipeline steps
 */

import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  PipelineConfig,
  PipelineStepConfig,
  StepType,
  DEFAULT_PIPELINE_CONFIG,
} from '@automaker/types';
import { PipelineBuilder } from './pipeline-builder';
import { ReviewStepConfig } from './step-configs/review-step-config';
import { SecurityStepConfig } from './step-configs/security-step-config';
import { PerformanceStepConfig } from './step-configs/performance-step-config';
import { TestStepConfig } from './step-configs/test-step-config';
import { CustomStepConfig } from './step-configs/custom-step-config';
import {
  Settings2,
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
  Download,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PipelineSectionProps {
  pipelineConfig: PipelineConfig | null;
  onPipelineChange: (config: PipelineConfig) => void;
  className?: string;
}

interface SortableStepItemProps {
  step: PipelineStepConfig;
  stepTypeColors: Record<StepType, string>;
  onEdit: (step: PipelineStepConfig) => void;
  onDelete: (stepId: string) => void;
}

function SortableStepItem({ step, stepTypeColors, onEdit, onDelete }: SortableStepItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors',
        isDragging && 'shadow-lg'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{step.name}</span>
          <Badge variant="secondary" className={stepTypeColors[step.type]}>
            {step.type}
          </Badge>
          {step.required && <Badge variant="outline">Required</Badge>}
          {step.autoTrigger && <Badge variant="outline">Auto</Badge>}
        </div>
        {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onEdit(step)}>
          Configure
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(step.id)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function PipelineSection({
  pipelineConfig,
  onPipelineChange,
  className,
}: PipelineSectionProps) {
  const [config, setConfig] = useState<PipelineConfig>(pipelineConfig || DEFAULT_PIPELINE_CONFIG);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<PipelineStepConfig | null>(null);
  const [isEditingNewStep, setIsEditingNewStep] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (pipelineConfig) {
      setConfig(pipelineConfig);
    }
  }, [pipelineConfig]);

  const handleToggleEnabled = (enabled: boolean) => {
    const newConfig = { ...config, enabled };
    setConfig(newConfig);
    onPipelineChange(newConfig);
  };

  const handleAddStep = () => {
    const newStep: PipelineStepConfig = {
      id: `step-${Date.now()}`,
      type: 'review',
      name: 'New Step',
      model: 'opus',
      required: true,
      autoTrigger: true,
      config: {},
    };

    const newConfig = {
      ...config,
      steps: [...config.steps, newStep],
    };

    setConfig(newConfig);
    setEditingStep(newStep);
    setIsEditingNewStep(true);
  };

  const handleEditStep = (step: PipelineStepConfig) => {
    setEditingStep(step);
    setIsEditingNewStep(false);
  };

  const handleDeleteStep = (stepId: string) => {
    const newConfig = {
      ...config,
      steps: config.steps.filter((s) => s.id !== stepId),
    };
    setConfig(newConfig);
    onPipelineChange(newConfig);
  };

  const handleStepUpdate = (updatedStep: PipelineStepConfig) => {
    const newConfig = {
      ...config,
      steps: config.steps.map((s) => (s.id === updatedStep.id ? updatedStep : s)),
    };
    setConfig(newConfig);
    onPipelineChange(newConfig);
    setEditingStep(null);
    setIsEditingNewStep(false);
  };

  const handleCancelEdit = () => {
    if (isEditingNewStep && editingStep) {
      // Remove the newly added step
      const newConfig = {
        ...config,
        steps: config.steps.filter((s) => s.id !== editingStep.id),
      };
      setConfig(newConfig);
      onPipelineChange(newConfig);
    }
    setEditingStep(null);
    setIsEditingNewStep(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = config.steps.findIndex((step) => step.id === active.id);
      const newIndex = config.steps.findIndex((step) => step.id === over?.id);

      const newConfig = {
        ...config,
        steps: arrayMove(config.steps, oldIndex, newIndex),
      };
      setConfig(newConfig);
      onPipelineChange(newConfig);
    }
  };

  const handleExport = async () => {
    try {
      const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pipeline-config.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export pipeline:', error);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const imported = JSON.parse(content);

      // Basic validation
      if (!imported.version || !Array.isArray(imported.steps)) {
        throw new Error('Invalid pipeline configuration file');
      }

      setConfig(imported);
      onPipelineChange(imported);
    } catch (error) {
      setErrors([`Failed to import: ${error instanceof Error ? error.message : 'Unknown error'}`]);
      setTimeout(() => setErrors([]), 5000);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_PIPELINE_CONFIG);
    onPipelineChange(DEFAULT_PIPELINE_CONFIG);
  };

  const validateConfig = (): string[] => {
    const errors: string[] = [];

    if (config.enabled && config.steps.length === 0) {
      errors.push('Pipeline is enabled but has no steps');
    }

    const stepIds = new Set<string>();
    for (const step of config.steps) {
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);

      if (!step.name.trim()) {
        errors.push(`Step ${step.id} has no name`);
      }

      // Check for circular dependencies
      const visited = new Set<string>();
      const visiting = new Set<string>();

      const checkDeps = (stepId: string, deps: string[] = []) => {
        if (visiting.has(stepId)) {
          errors.push(`Circular dependency detected involving step: ${stepId}`);
          return;
        }
        if (visited.has(stepId)) return;

        visiting.add(stepId);
        const step = config.steps.find((s) => s.id === stepId);
        if (step?.dependencies) {
          for (const dep of step.dependencies) {
            checkDeps(dep);
          }
        }
        visiting.delete(stepId);
        visited.add(stepId);
      };

      if (step.dependencies) {
        checkDeps(step.id, step.dependencies);
      }
    }

    return errors;
  };

  const stepTypeColors: Record<StepType, string> = {
    review: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    security: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    performance: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    test: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
    custom: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Pipeline Configuration
          </h3>
          <p className="text-sm text-muted-foreground">
            Define custom verification steps for your workflow
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={config.enabled} onCheckedChange={handleToggleEnabled} />
          <span className="text-sm">{config.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errors.map((error, i) => (
              <div key={i}>{error}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Pipeline Steps */}
      {config.enabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pipeline Steps</CardTitle>
                <CardDescription>
                  Drag to reorder. Steps execute from top to bottom.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('pipeline-import')?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
                <input
                  id="pipeline-import"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImport}
                />
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
                <Button onClick={handleAddStep}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
            {config.steps.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pipeline steps configured. Click "Add Step" to get started.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={config.steps.map((step) => step.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {config.steps.map((step) => (
                      <SortableStepItem
                        key={step.id}
                        step={step}
                        stepTypeColors={stepTypeColors}
                        onEdit={handleEditStep}
                        onDelete={handleDeleteStep}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step Configuration Modal */}
      {editingStep && (
        <StepConfigModal step={editingStep} onSave={handleStepUpdate} onCancel={handleCancelEdit} />
      )}

      {/* Pipeline Builder */}
      {isBuilderOpen && (
        <PipelineBuilder
          config={config}
          onSave={onPipelineChange}
          onClose={() => setIsBuilderOpen(false)}
        />
      )}
    </div>
  );
}

interface StepConfigModalProps {
  step: PipelineStepConfig;
  onSave: (step: PipelineStepConfig) => void;
  onCancel: () => void;
}

function StepConfigModal({ step, onSave, onCancel }: StepConfigModalProps) {
  const [localStep, setLocalStep] = useState(step);

  const handleSave = () => {
    onSave(localStep);
  };

  const renderConfigForm = () => {
    switch (localStep.type) {
      case 'review':
        return <ReviewStepConfig config={localStep} onChange={setLocalStep} />;
      case 'security':
        return <SecurityStepConfig config={localStep} onChange={setLocalStep} />;
      case 'performance':
        return <PerformanceStepConfig config={localStep} onChange={setLocalStep} />;
      case 'test':
        return <TestStepConfig config={localStep} onChange={setLocalStep} />;
      case 'custom':
        return <CustomStepConfig config={localStep} onChange={setLocalStep} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Configure Step: {step.name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Basic Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                value={localStep.name}
                onChange={(e) => setLocalStep({ ...localStep, name: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-foreground"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Type</label>
              <select
                value={localStep.type}
                onChange={(e) =>
                  setLocalStep({
                    ...localStep,
                    type: e.target.value as StepType,
                    config: {}, // Reset config when type changes
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-foreground"
              >
                <option value="review">Review</option>
                <option value="security">Security</option>
                <option value="performance">Performance</option>
                <option value="test">Test</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={localStep.description || ''}
              onChange={(e) => setLocalStep({ ...localStep, description: e.target.value })}
              className="w-full mt-1 px-3 py-2 border rounded-md bg-background text-foreground"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                checked={localStep.required}
                onCheckedChange={(checked) => setLocalStep({ ...localStep, required: checked })}
              />
              <label className="text-sm font-medium">Required</label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={localStep.autoTrigger}
                onCheckedChange={(checked) => setLocalStep({ ...localStep, autoTrigger: checked })}
              />
              <label className="text-sm font-medium">Auto Trigger</label>
            </div>
          </div>

          {/* Type-specific Configuration */}
          {renderConfigForm()}
        </CardContent>

        <div className="flex justify-end gap-2 p-6 border-t">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </Card>
    </div>
  );
}
