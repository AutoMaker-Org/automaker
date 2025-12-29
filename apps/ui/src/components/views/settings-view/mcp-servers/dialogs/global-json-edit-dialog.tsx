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

interface GlobalJsonEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jsonValue: string;
  onJsonValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function GlobalJsonEditDialog({
  open,
  onOpenChange,
  jsonValue,
  onJsonValueChange,
  onSave,
  onCancel,
}: GlobalJsonEditDialogProps) {
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
      <DialogContent className="max-w-3xl max-h-[90vh]" data-testid="mcp-global-json-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit All MCP Servers</DialogTitle>
          <DialogDescription>
            Edit the full MCP servers configuration. Add, modify, or remove servers directly in
            JSON. Servers removed from JSON will be deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={jsonValue}
            onChange={(e) => onJsonValueChange(e.target.value)}
            placeholder={`{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"]
    }
  }
}`}
            className="font-mono text-sm h-[50vh] min-h-[300px]"
            data-testid="mcp-global-json-edit-textarea"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!jsonValue.trim()}
            data-testid="mcp-global-json-edit-save-button"
          >
            <Code className="w-4 h-4 mr-2" />
            Save All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
