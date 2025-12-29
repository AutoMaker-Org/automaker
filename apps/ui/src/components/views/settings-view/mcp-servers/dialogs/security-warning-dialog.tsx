import { ShieldAlert, Terminal, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SecurityWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  serverType: 'stdio' | 'sse' | 'http';
  serverName: string;
  command?: string;
  args?: string[];
  url?: string;
  /** Number of servers being imported (for import dialog) */
  importCount?: number;
}

export function SecurityWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  serverType,
  serverName,
  command,
  args,
  url,
  importCount,
}: SecurityWarningDialogProps) {
  const isImport = importCount !== undefined && importCount > 0;
  const isStdio = serverType === 'stdio';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="mcp-security-warning-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Security Warning
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2">
              <p className="font-medium text-foreground">
                {isImport
                  ? `You are about to import ${importCount} MCP server${importCount > 1 ? 's' : ''}.`
                  : 'MCP servers can execute code on your machine.'}
              </p>

              {!isImport && isStdio && command && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Terminal className="h-4 w-4 text-destructive" />
                    This server will run:
                  </div>
                  <code className="mt-1 block break-all text-sm text-muted-foreground">
                    {command} {args?.join(' ')}
                  </code>
                </div>
              )}

              {!isImport && !isStdio && url && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Globe className="h-4 w-4 text-amber-500" />
                    This server will connect to:
                  </div>
                  <code className="mt-1 block break-all text-sm text-muted-foreground">{url}</code>
                </div>
              )}

              {isImport && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-sm text-foreground">
                    Each imported server can execute arbitrary commands or connect to external
                    services. Review the JSON carefully before importing.
                  </p>
                </div>
              )}

              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>Only add servers from sources you trust</li>
                {isStdio && <li>Stdio servers run with your user privileges</li>}
                {!isStdio && <li>HTTP/SSE servers can access network resources</li>}
                <li>Review the {isStdio ? 'command' : 'URL'} before confirming</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} data-testid="mcp-security-confirm-button">
            I understand, {isImport ? 'import' : 'add'} server
            {isImport && importCount! > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
