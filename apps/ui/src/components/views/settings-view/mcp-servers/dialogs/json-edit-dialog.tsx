import { Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MCPServerConfig } from '@automaker/types';

interface JsonEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: MCPServerConfig | null;
  jsonValue: string;
  onJsonValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function JsonEditDialog({
  open,
  onOpenChange,
  server,
  jsonValue,
  onJsonValueChange,
  onSave,
  onCancel,
}: JsonEditDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        } else {
          onOpenChange(open);
        }
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="mcp-json-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit Server Configuration</DialogTitle>
          <DialogDescription>
            Edit the raw JSON configuration for "{server?.name}". Changes will be validated before
            saving.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={jsonValue}
            onChange={(e) => onJsonValueChange(e.target.value)}
            placeholder="Server configuration JSON..."
            className="font-mono text-sm h-80"
            data-testid="mcp-json-edit-textarea"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!jsonValue.trim()}
            data-testid="mcp-json-edit-save-button"
          >
            <Code className="w-4 h-4 mr-2" />
            Save JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
