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
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Textarea } from '@/components/ui/textarea';
import { Play, Plus } from 'lucide-react';
import type { PhaseModelEntry } from '@automaker/types';
import { PhaseModelSelector } from '@/components/views/settings-view/model-defaults/phase-model-selector';
import { useAppStore } from '@/store/app-store';

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (description: string, modelEntry: PhaseModelEntry) => void;
  onAddAndStart: (description: string, modelEntry: PhaseModelEntry) => void;
}

export function QuickAddDialog({ open, onOpenChange, onAdd, onAddAndStart }: QuickAddDialogProps) {
  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get default feature model from store
  const defaultFeatureModel = useAppStore((s) => s.defaultFeatureModel);
  const currentProject = useAppStore((s) => s.currentProject);

  // Use project-level default feature model if set, otherwise fall back to global
  const effectiveDefaultFeatureModel = currentProject?.defaultFeatureModel ?? defaultFeatureModel;

  const [modelEntry, setModelEntry] = useState<PhaseModelEntry>(
    effectiveDefaultFeatureModel || { model: 'claude-opus' }
  );

  // Reset form when dialog opens (in useEffect to avoid state mutation during render)
  useEffect(() => {
    if (open) {
      setDescription('');
      setDescriptionError(false);
      setModelEntry(effectiveDefaultFeatureModel || { model: 'claude-opus' });
    }
  }, [open, effectiveDefaultFeatureModel]);

  const handleSubmit = (actionFn: (description: string, modelEntry: PhaseModelEntry) => void) => {
    if (!description.trim()) {
      setDescriptionError(true);
      textareaRef.current?.focus();
      return;
    }

    actionFn(description.trim(), modelEntry);
    setDescription('');
    setDescriptionError(false);
    onOpenChange(false);
  };

  const handleAdd = () => handleSubmit(onAdd);
  const handleAddAndStart = () => handleSubmit(onAddAndStart);

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    if (value.trim()) {
      setDescriptionError(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        compact
        className="sm:max-w-md"
        data-testid="quick-add-dialog"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Quick Add Feature</DialogTitle>
          <DialogDescription>
            Create a new feature with minimal configuration. All other settings use defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Description Input */}
          <div className="space-y-2">
            <label htmlFor="quick-add-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              ref={textareaRef}
              id="quick-add-description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Describe what you want to build..."
              className={
                descriptionError ? 'border-destructive focus-visible:ring-destructive' : ''
              }
              rows={3}
              data-testid="quick-add-description-input"
            />
            {descriptionError && (
              <p className="text-xs text-destructive">Description is required</p>
            )}
          </div>

          {/* Model Selection */}
          <PhaseModelSelector value={modelEntry} onChange={setModelEntry} compact align="end" />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleAdd} data-testid="quick-add-button">
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
          <HotkeyButton
            onClick={handleAddAndStart}
            hotkey={{ key: 'Enter', cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="quick-add-and-start-button"
          >
            <Play className="w-4 h-4 mr-2" />
            Make
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
