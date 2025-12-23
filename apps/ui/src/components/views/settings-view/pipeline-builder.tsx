/**
 * Pipeline Builder UI
 *
 * Visual pipeline diagram with drag-and-drop functionality
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PipelineConfig, PipelineStepConfig, StepType } from '@automaker/types';
import {
  Plus,
  Settings,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  GripVertical,
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
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PipelineBuilderProps {
  config: PipelineConfig;
  onSave: (config: PipelineConfig) => void;
  onClose: () => void;
}

// Extracted SortableStep component to prevent re-creation on each render
const SortableStep = ({
  step,
  isLast,
  onEdit,
}: {
  step: PipelineStepConfig;
  isLast: boolean;
  onEdit?: (step: PipelineStepConfig) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getStepStatus = (step: PipelineStepConfig) => {
    // This would come from actual execution status
    // For now, just show as pending
    return 'pending';
  };

  const status = getStepStatus(step);

  return (
    <div style={style} className="flex items-center gap-4 select-none">
      <div
        ref={setNodeRef}
        className={cn('flex-1 border-2 rounded-lg p-4 transition-all', stepTypeColors[step.type])}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white dark:bg-gray-800 rounded-md">
              {stepTypeIcons[step.type]}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{step.name}</h4>
                <Badge variant="outline">{step.type}</Badge>
                {step.required && <Badge variant="secondary">Required</Badge>}
                {step.autoTrigger && <Badge variant="outline">Auto</Badge>}
              </div>

              {step.description && (
                <p className="text-sm text-muted-foreground">{step.description}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Model: {step.model}</span>
                {step.maxLoops && step.maxLoops > 1 && <span>Max loops: {step.maxLoops}</span>}
                {step.memoryEnabled && <span>Memory enabled</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none select-none"
              style={{ touchAction: 'none' }}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => onEdit?.(step)}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {!isLast && (
        <div className="flex flex-col items-center">
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
};

const stepTypeColors: Record<StepType, string> = {
  review: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950',
  security: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950',
  performance: 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950',
  test: 'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950',
  custom: 'border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-950',
};

export function PipelineBuilder({ config, onSave, onClose }: PipelineBuilderProps) {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    console.log('PipelineBuilder - localConfig.steps:', localConfig.steps);
    console.log('PipelineBuilder - Number of steps:', localConfig.steps.length);
  }, [localConfig.steps]);

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

  const stepTypeIcons: Record<StepType, React.ReactNode> = {
    review: <Settings className="w-4 h-4" />,
    security: <XCircle className="w-4 h-4" />,
    performance: <Play className="w-4 h-4" />,
    test: <CheckCircle className="w-4 h-4" />,
    custom: <Clock className="w-4 h-4" />,
  };

  const stepTypeColors: Record<StepType, string> = {
    review: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950',
    security: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950',
    performance: 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950',
    test: 'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950',
    custom: 'border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-950',
  };

  const handleAddStep = (type: StepType) => {
    const newStep: PipelineStepConfig = {
      id: `step-${Date.now()}`,
      type,
      name: `New ${type} step`,
      model: 'opus',
      required: true,
      autoTrigger: true,
      config: {},
    };

    setLocalConfig({
      ...localConfig,
      steps: [...localConfig.steps, newStep],
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    console.log('Drag end event:', event);
    const { active, over } = event;

    if (active.id !== over?.id) {
      console.log('Reordering from', active.id, 'to', over?.id);
      setLocalConfig((current) => {
        const oldIndex = current.steps.findIndex((step) => step.id === active.id);
        const newIndex = current.steps.findIndex((step) => step.id === over?.id);

        console.log('Old index:', oldIndex, 'New index:', newIndex);

        return {
          ...current,
          steps: arrayMove(current.steps, oldIndex, newIndex),
        };
      });
    }
  };

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Visual Pipeline Builder</CardTitle>
              <p className="text-sm text-muted-foreground">
                Drag and drop steps to reorder. Click settings to configure.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save Pipeline</Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {/* Pipeline Flow */}
              <div className="p-6 bg-muted/30 rounded-lg">
                <h3 className="font-medium mb-4">Pipeline Flow</h3>

                {localConfig.steps.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No steps configured yet.</p>
                    <p className="text-sm">Add a step below to get started.</p>
                  </div>
                ) : (
                  <SortableContext
                    items={localConfig.steps.map((step) => step.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {localConfig.steps.map((step, index) => (
                        <SortableStep
                          key={step.id}
                          step={step}
                          isLast={index === localConfig.steps.length - 1}
                        />
                      ))}
                    </div>
                  </SortableContext>
                )}
              </div>

              {/* Add Step Section */}
              <div className="p-6 border-2 border-dashed rounded-lg">
                <h3 className="font-medium mb-4">Add Step</h3>

                <div className="grid grid-cols-5 gap-3">
                  <Button
                    variant="outline"
                    className="h-20 flex-col"
                    onClick={() => handleAddStep('review')}
                  >
                    <Settings className="w-6 h-6 mb-2" />
                    Review
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex-col"
                    onClick={() => handleAddStep('security')}
                  >
                    <XCircle className="w-6 h-6 mb-2" />
                    Security
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex-col"
                    onClick={() => handleAddStep('performance')}
                  >
                    <Play className="w-6 h-6 mb-2" />
                    Performance
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex-col"
                    onClick={() => handleAddStep('test')}
                  >
                    <CheckCircle className="w-6 h-6 mb-2" />
                    Test
                  </Button>

                  <Button
                    variant="outline"
                    className="h-20 flex-col"
                    onClick={() => handleAddStep('custom')}
                  >
                    <Plus className="w-6 h-6 mb-2" />
                    Custom
                  </Button>
                </div>
              </div>

              {/* Pipeline Statistics */}
              {localConfig.steps.length > 0 && (
                <div className="grid grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">{localConfig.steps.length}</div>
                      <div className="text-sm text-muted-foreground">Total Steps</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">
                        {localConfig.steps.filter((s) => s.required).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Required</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">
                        {localConfig.steps.filter((s) => s.autoTrigger).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Auto Trigger</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">
                        {localConfig.steps.filter((s) => s.memoryEnabled).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Memory Enabled</div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
}
