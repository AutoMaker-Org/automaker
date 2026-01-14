import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineStep } from '@automaker/types';
import { cn } from '@/lib/utils';
import { STEP_TEMPLATES } from './pipeline-step-templates';

// Color options for pipeline columns
const COLOR_OPTIONS = [
  { value: 'bg-blue-500/20', label: 'Blue', preview: 'bg-blue-500' },
  { value: 'bg-purple-500/20', label: 'Purple', preview: 'bg-purple-500' },
  { value: 'bg-green-500/20', label: 'Green', preview: 'bg-green-500' },
  { value: 'bg-orange-500/20', label: 'Orange', preview: 'bg-orange-500' },
  { value: 'bg-red-500/20', label: 'Red', preview: 'bg-red-500' },
  { value: 'bg-pink-500/20', label: 'Pink', preview: 'bg-pink-500' },
  { value: 'bg-cyan-500/20', label: 'Cyan', preview: 'bg-cyan-500' },
  { value: 'bg-amber-500/20', label: 'Amber', preview: 'bg-amber-500' },
  { value: 'bg-indigo-500/20', label: 'Indigo', preview: 'bg-indigo-500' },
];

interface AddEditPipelineStepDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (step: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  existingStep?: PipelineStep | null;
  defaultOrder: number;
}

export function AddEditPipelineStepDialog({
  open,
  onClose,
  onSave,
  existingStep,
  defaultOrder,
}: AddEditPipelineStepDialogProps) {
  const isEditing = !!existingStep;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [colorClass, setColorClass] = useState(COLOR_OPTIONS[0].value);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Reset form when dialog opens/closes or existingStep changes
  useEffect(() => {
    if (open) {
      if (existingStep) {
        setName(existingStep.name);
        setInstructions(existingStep.instructions);
        setColorClass(existingStep.colorClass);
        setSelectedTemplate(null);
      } else {
        setName('');
        setInstructions('');
        setColorClass(COLOR_OPTIONS[defaultOrder % COLOR_OPTIONS.length].value);
        setSelectedTemplate(null);
      }
    }
  }, [open, existingStep, defaultOrder]);

  const handleTemplateClick = (templateId: string) => {
    const template = STEP_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setName(template.name);
      setInstructions(template.instructions);
      setColorClass(template.colorClass);
      setSelectedTemplate(templateId);
      toast.success(`Loaded "${template.name}" template`);
    }
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setInstructions(content);
      toast.success('Instructions loaded from file');
    } catch {
      toast.error('Failed to load file');
    }

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Step name is required');
      return;
    }

    if (!instructions.trim()) {
      toast.error('Step instructions are required');
      return;
    }

    onSave({
      id: existingStep?.id,
      name: name.trim(),
      instructions: instructions.trim(),
      colorClass,
      order: existingStep?.order ?? defaultOrder,
    });

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Hidden file input for loading instructions from .md files */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          className="hidden"
          onChange={handleFileInputChange}
        />

        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Pipeline Step' : 'Add Pipeline Step'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modify the step configuration below.'
              : 'Configure a new step for your pipeline. Choose a template to get started quickly, or create from scratch.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Template Quick Start - Only show for new steps */}
          {!isEditing && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Quick Start from Template</Label>
              <div className="flex flex-wrap gap-2">
                {STEP_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateClick(template.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm',
                      selectedTemplate === template.id
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    )}
                  >
                    <div
                      className={cn('w-2 h-2 rounded-full', template.colorClass.replace('/20', ''))}
                    />
                    {template.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Click a template to pre-fill the form, then customize as needed.
              </p>
            </div>
          )}

          {/* Divider */}
          {!isEditing && <div className="border-t" />}

          {/* Step Name */}
          <div className="space-y-2">
            <Label htmlFor="step-name">
              Step Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="step-name"
              placeholder="e.g., Code Review, Testing, Documentation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={isEditing}
            />
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>Column Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={cn(
                    'w-8 h-8 rounded-full transition-all',
                    color.preview,
                    colorClass === color.value
                      ? 'ring-2 ring-offset-2 ring-primary'
                      : 'opacity-60 hover:opacity-100'
                  )}
                  onClick={() => setColorClass(color.value)}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Agent Instructions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="step-instructions">
                Agent Instructions <span className="text-destructive">*</span>
              </Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleFileUpload}>
                <Upload className="h-3 w-3 mr-1" />
                Load from file
              </Button>
            </div>
            <Textarea
              id="step-instructions"
              placeholder="Instructions for the agent to follow during this pipeline step. Use markdown formatting for best results."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              These instructions will be sent to the agent when this step runs. Be specific about
              what you want the agent to review, check, or modify.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{isEditing ? 'Update Step' : 'Add to Pipeline'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
