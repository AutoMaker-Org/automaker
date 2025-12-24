import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import type { CreateBeadsIssueInput, BeadsIssueType, BeadsIssuePriority } from '@automaker/types';
import { DEFAULT_PRIORITY } from '../constants';

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateBeadsIssueInput) => Promise<boolean>;
}

const ISSUE_TYPES: BeadsIssueType[] = ['bug', 'feature', 'task', 'epic', 'chore'];
const PRIORITY_OPTIONS: { value: BeadsIssuePriority; label: string }[] = [
  { value: 0, label: 'CRITICAL' },
  { value: 1, label: 'HIGH' },
  { value: 2, label: 'MEDIUM' },
  { value: 3, label: 'LOW' },
  { value: 4, label: 'LOWEST' },
];

/**
 * Modal dialog UI for creating a new Beads issue with title, description, type, priority and labels.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback invoked with the updated open state when the dialog should open or close
 * @param onCreate - Async callback invoked with the issue input when the user submits; should resolve to `true` on successful creation
 * @returns The rendered Create Issue dialog element
 */
export function CreateIssueDialog({ open, onOpenChange, onCreate }: CreateIssueDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<BeadsIssueType>('task');
  const [priority, setPriority] = useState<BeadsIssuePriority>(DEFAULT_PRIORITY);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setType('task');
      setPriority(DEFAULT_PRIORITY);
      setLabels([]);
      setLabelInput('');
    }
  }, [open]);

  const handleAddLabel = () => {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
      setLabelInput('');
    }
  };

  const handleRemoveLabel = (label: string) => {
    setLabels(labels.filter((l) => l !== label));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      return;
    }

    setIsCreating(true);
    const success = await onCreate({
      title: title.trim(),
      description: description.trim(),
      type,
      priority,
      labels: labels.length > 0 ? labels : undefined,
    });

    setIsCreating(false);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Issue</DialogTitle>
          <DialogDescription>Create a new issue in the Beads tracker.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Issue title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Detailed description of the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          {/* Type and Priority */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as BeadsIssueType)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={String(priority)}
                onValueChange={(v) => setPriority(Number(v) as BeadsIssuePriority)}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <Label>Labels</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add label..."
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddLabel();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddLabel}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {labels.map((label) => (
                  <Badge key={label} variant="secondary" className="gap-1">
                    {label}
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(label)}
                      className="rounded-full hover:bg-muted-foreground/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || isCreating}>
            {isCreating ? 'Creating...' : 'Create Issue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
