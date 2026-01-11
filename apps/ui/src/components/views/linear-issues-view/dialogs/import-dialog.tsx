import { memo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { LinearIssue, LinearImportOptions } from '@/lib/electron';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: LinearIssue[];
  importing: boolean;
  onImport: (issueIds: string[], options: Partial<LinearImportOptions>) => void;
}

export const ImportDialog = memo(function ImportDialog({
  open,
  onOpenChange,
  issues,
  importing,
  onImport,
}: ImportDialogProps) {
  const [targetStatus, setTargetStatus] = useState<'backlog' | 'in-progress'>('backlog');
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includeLabelsAsCategory, setIncludeLabelsAsCategory] = useState(true);
  const [linkBackToLinear, setLinkBackToLinear] = useState(true);

  const handleImport = () => {
    const issueIds = issues.map((issue) => issue.id);
    onImport(issueIds, {
      targetStatus,
      includeDescription,
      includeLabelsAsCategory,
      linkBackToLinear,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Import to Board
          </DialogTitle>
          <DialogDescription>
            Import {issues.length} issue{issues.length !== 1 ? 's' : ''} as feature
            {issues.length !== 1 ? 's' : ''} to your Kanban board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Issues preview */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Issues to import:</Label>
            <div className="max-h-32 overflow-auto rounded border border-border p-2 space-y-1">
              {issues.map((issue) => (
                <div key={issue.id} className="text-sm flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-xs">
                    {issue.identifier}
                  </span>
                  <span className="truncate">{issue.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Target status */}
          <div className="space-y-2">
            <Label htmlFor="target-status">Import to column:</Label>
            <Select
              value={targetStatus}
              onValueChange={(value) => setTargetStatus(value as 'backlog' | 'in-progress')}
            >
              <SelectTrigger id="target-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Options:</Label>

            <div className="flex items-center gap-2">
              <Checkbox
                id="include-description"
                checked={includeDescription}
                onCheckedChange={(checked) => setIncludeDescription(checked === true)}
              />
              <Label htmlFor="include-description" className="text-sm cursor-pointer">
                Include issue description
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="include-labels"
                checked={includeLabelsAsCategory}
                onCheckedChange={(checked) => setIncludeLabelsAsCategory(checked === true)}
              />
              <Label htmlFor="include-labels" className="text-sm cursor-pointer">
                Use first label as category
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="link-back"
                checked={linkBackToLinear}
                onCheckedChange={(checked) => setLinkBackToLinear(checked === true)}
              />
              <Label htmlFor="link-back" className="text-sm cursor-pointer">
                Add link back to Linear issue
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || issues.length === 0}>
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Import {issues.length} Issue{issues.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
