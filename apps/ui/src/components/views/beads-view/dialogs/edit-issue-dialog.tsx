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
import type {
  BeadsIssue,
  UpdateBeadsIssueInput,
  BeadsIssueType,
  BeadsIssuePriority,
} from '@automaker/types';

interface EditIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: BeadsIssue | null;
  onUpdate: (issueId: string, updates: UpdateBeadsIssueInput) => Promise<boolean>;
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
 * Dialog UI for editing an existing Beads issue.
 *
 * Preloads form fields from `issue`, lets the user edit title, description, type, priority and labels,
 * validates that title is present before submitting, shows an updating state while saving, and closes the dialog when the update succeeds.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback invoked with the new open state
 * @param issue - The current issue to edit (or `null` to show an empty/initial form)
 * @param onUpdate - Async callback called with `(issueId, updates)` to persist changes; should return `true` on success
 * @returns The EditIssueDialog React element
 */
export function EditIssueDialog({ open, onOpenChange, issue, onUpdate }: EditIssueDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<BeadsIssueType>('task');
  const [priority, setPriority] = useState<BeadsIssuePriority>(2);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Populate form when issue changes
  useEffect(() => {
    if (issue) {
      setTitle(issue.title);
      setDescription(issue.description || '');
      setType(issue.type);
      setPriority(issue.priority);
      setLabels(issue.labels || []);
      setLabelInput('');
    }
  }, [issue]);

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

  const handleUpdate = async () => {
    if (!issue || !title.trim()) {
      return;
    }

    setIsUpdating(true);
    const success = await onUpdate(issue.id, {
      title: title.trim(),
      description: description.trim(),
      type,
      priority,
      labels,
    });

    setIsUpdating(false);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Issue</DialogTitle>
          <DialogDescription>Update the issue details. Issue ID: {issue?.id}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title *</Label>
            <Input
              id="edit-title"
              placeholder="Issue title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              placeholder="Detailed description of the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          {/* Type and Priority */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="edit-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as BeadsIssueType)}>
                <SelectTrigger id="edit-type">
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
              <Label htmlFor="edit-priority">Priority</Label>
              <Select
                value={String(priority)}
                onValueChange={(v) => setPriority(Number(v) as BeadsIssuePriority)}
              >
                <SelectTrigger id="edit-priority">
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
          <Button onClick={handleUpdate} disabled={!title.trim() || isUpdating}>
            {isUpdating ? 'Updating...' : 'Update Issue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}