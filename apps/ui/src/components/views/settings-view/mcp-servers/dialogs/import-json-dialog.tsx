import { FileJson } from 'lucide-react';
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

interface ImportJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importJson: string;
  onImportJsonChange: (value: string) => void;
  onImport: () => void;
  onCancel: () => void;
}

export function ImportJsonDialog({
  open,
  onOpenChange,
  importJson,
  onImportJsonChange,
  onImport,
  onCancel,
}: ImportJsonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="mcp-import-dialog">
        <DialogHeader>
          <DialogTitle>Import MCP Servers</DialogTitle>
          <DialogDescription>
            Paste JSON configuration in Claude Code format. Servers with duplicate names will be
            skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={importJson}
            onChange={(e) => onImportJsonChange(e.target.value)}
            placeholder={`{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-name"],
      "type": "stdio"
    }
  }
}`}
            className="font-mono text-sm h-64"
            data-testid="mcp-import-textarea"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onImport} disabled={!importJson.trim()} data-testid="mcp-import-button">
            <FileJson className="w-4 h-4 mr-2" />
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
