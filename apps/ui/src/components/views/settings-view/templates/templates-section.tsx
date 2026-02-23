import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GripVertical, Plus, Pencil, Trash2, FileText, Lock, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FeatureTemplate, PhaseModelEntry } from '@automaker/types';
import { PhaseModelSelector } from '../model-defaults/phase-model-selector';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TemplatesSectionProps {
  templates: FeatureTemplate[];
  onAddTemplate: (template: FeatureTemplate) => Promise<void>;
  onUpdateTemplate: (id: string, updates: Partial<FeatureTemplate>) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onReorderTemplates: (templateIds: string[]) => Promise<void>;
}

interface TemplateFormData {
  name: string;
  prompt: string;
  model?: PhaseModelEntry;
}

const MAX_NAME_LENGTH = 50;

function generateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function SortableTemplateItem({
  template,
  onEdit,
  onToggleEnabled,
  onDelete,
}: {
  template: FeatureTemplate;
  onEdit: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: template.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isEnabled = template.enabled !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50',
        'transition-all duration-200',
        isDragging && 'opacity-50 shadow-lg',
        !isEnabled && 'opacity-60'
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
        data-testid={`template-drag-handle-${template.id}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Template Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium truncate">{template.name}</span>
          {template.isBuiltIn && (
            <span title="Built-in template">
              <Lock className="w-3 h-3 text-muted-foreground" />
            </span>
          )}
          {!isEnabled && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Disabled
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{template.prompt}</p>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit} data-testid={`template-edit-${template.id}`}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onToggleEnabled}
            data-testid={`template-toggle-${template.id}`}
          >
            <Checkbox checked={isEnabled} className="w-4 h-4 mr-2 pointer-events-none" />
            {isEnabled ? 'Disable' : 'Enable'}
          </DropdownMenuItem>
          {!template.isBuiltIn && (
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
              data-testid={`template-delete-${template.id}`}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function TemplatesSection({
  templates,
  onAddTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onReorderTemplates,
}: TemplatesSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FeatureTemplate | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    prompt: '',
  });
  const [nameError, setNameError] = useState(false);
  const [promptError, setPromptError] = useState(false);

  const defaultFeatureModel = useAppStore((s) => s.defaultFeatureModel);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddNew = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      prompt: '',
      model: undefined,
    });
    setNameError(false);
    setPromptError(false);
    setDialogOpen(true);
  };

  const handleEdit = (template: FeatureTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      prompt: template.prompt,
      model: template.model,
    });
    setNameError(false);
    setPromptError(false);
    setDialogOpen(true);
  };

  const handleToggleEnabled = async (template: FeatureTemplate) => {
    await onUpdateTemplate(template.id, { enabled: template.enabled === false ? true : false });
  };

  const handleDelete = async (template: FeatureTemplate) => {
    if (template.isBuiltIn) {
      toast.error('Built-in templates cannot be deleted');
      return;
    }
    await onDeleteTemplate(template.id);
    toast.success('Template deleted');
  };

  const handleSave = async () => {
    // Validate
    let hasError = false;
    if (!formData.name.trim()) {
      setNameError(true);
      hasError = true;
    }
    if (!formData.prompt.trim()) {
      setPromptError(true);
      hasError = true;
    }
    if (hasError) return;

    if (editingTemplate) {
      // Update existing
      await onUpdateTemplate(editingTemplate.id, {
        name: formData.name.trim(),
        prompt: formData.prompt.trim(),
        model: formData.model,
      });
      toast.success('Template updated');
    } else {
      // Create new
      const newTemplate: FeatureTemplate = {
        id: generateId(),
        name: formData.name.trim(),
        prompt: formData.prompt.trim(),
        model: formData.model,
        isBuiltIn: false,
        enabled: true,
        order: Math.max(...templates.map((t) => t.order ?? 0), -1) + 1,
      };
      await onAddTemplate(newTemplate);
      toast.success('Template created');
    }
    setDialogOpen(false);
  };

  // Memoized sorted copy — avoids mutating the Zustand-managed templates array
  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [templates]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedTemplates.findIndex((t) => t.id === active.id);
      const newIndex = sortedTemplates.findIndex((t) => t.id === over.id);
      const reordered = arrayMove(sortedTemplates, oldIndex, newIndex);
      onReorderTemplates(reordered.map((t) => t.id));
    }
  };

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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <FileText className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Feature Templates
            </h2>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleAddNew}
            data-testid="add-template-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Template
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Create reusable task templates for quick feature creation from the Add Feature dropdown.
        </p>
      </div>

      <div className="p-6">
        {templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No templates yet</p>
            <p className="text-xs mt-1">Create your first template to get started</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedTemplates.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sortedTemplates.map((template) => (
                  <SortableTemplateItem
                    key={template.id}
                    template={template}
                    onEdit={() => handleEdit(template)}
                    onToggleEnabled={() => handleToggleEnabled(template)}
                    onDelete={() => handleDelete(template)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="template-dialog">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? 'Update the template details below.'
                : 'Create a new template for quick feature creation.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="template-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="template-name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (e.target.value.trim()) setNameError(false);
                }}
                placeholder="e.g., Run tests and fix issues"
                maxLength={MAX_NAME_LENGTH}
                className={nameError ? 'border-destructive' : ''}
                data-testid="template-name-input"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {nameError && <span className="text-destructive">Name is required</span>}
                <span className="ml-auto">
                  {formData.name.length}/{MAX_NAME_LENGTH}
                </span>
              </div>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <Label htmlFor="template-prompt">
                Prompt <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="template-prompt"
                value={formData.prompt}
                onChange={(e) => {
                  setFormData({ ...formData, prompt: e.target.value });
                  if (e.target.value.trim()) setPromptError(false);
                }}
                placeholder="Describe the task the AI should perform..."
                rows={4}
                className={promptError ? 'border-destructive' : ''}
                data-testid="template-prompt-input"
              />
              {promptError && <p className="text-xs text-destructive">Prompt is required</p>}
            </div>

            {/* Model (optional) */}
            <div className="space-y-2">
              <Label htmlFor="template-model">Preferred Model (optional)</Label>
              <PhaseModelSelector
                value={formData.model ?? defaultFeatureModel}
                onChange={(entry) => setFormData({ ...formData, model: entry })}
                compact
                align="end"
              />
              <p className="text-xs text-muted-foreground">
                If set, this model will be pre-selected when using this template.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} data-testid="template-save-button">
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
