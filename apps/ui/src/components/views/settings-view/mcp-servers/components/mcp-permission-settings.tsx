import { ShieldAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { syncSettingsToServer } from '@/hooks/use-settings-migration';
import { cn } from '@/lib/utils';

interface MCPPermissionSettingsProps {
  mcpAutoApproveTools: boolean;
  mcpUnrestrictedTools: boolean;
  onAutoApproveChange: (checked: boolean) => void;
  onUnrestrictedChange: (checked: boolean) => void;
}

export function MCPPermissionSettings({
  mcpAutoApproveTools,
  mcpUnrestrictedTools,
  onAutoApproveChange,
  onUnrestrictedChange,
}: MCPPermissionSettingsProps) {
  const hasAnyEnabled = mcpAutoApproveTools || mcpUnrestrictedTools;

  return (
    <div className="px-6 py-4 border-b border-border/50 bg-muted/20">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Switch
            id="mcp-auto-approve"
            checked={mcpAutoApproveTools}
            onCheckedChange={async (checked) => {
              onAutoApproveChange(checked);
              await syncSettingsToServer();
            }}
            data-testid="mcp-auto-approve-toggle"
            className="mt-0.5"
          />
          <div className="space-y-1 flex-1">
            <Label htmlFor="mcp-auto-approve" className="text-sm font-medium cursor-pointer">
              Auto-approve MCP tool calls
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, the AI agent can use MCP tools without permission prompts.
            </p>
            {mcpAutoApproveTools && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                <ShieldAlert className="h-3 w-3" />
                Bypasses normal permission checks
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Switch
            id="mcp-unrestricted"
            checked={mcpUnrestrictedTools}
            onCheckedChange={async (checked) => {
              onUnrestrictedChange(checked);
              await syncSettingsToServer();
            }}
            data-testid="mcp-unrestricted-toggle"
            className="mt-0.5"
          />
          <div className="space-y-1 flex-1">
            <Label htmlFor="mcp-unrestricted" className="text-sm font-medium cursor-pointer">
              Unrestricted tool access
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, the AI agent can use any tool, not just the default set.
            </p>
            {mcpUnrestrictedTools && (
              <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                <ShieldAlert className="h-3 w-3" />
                Agent has full tool access including file writes and bash
              </p>
            )}
          </div>
        </div>

        {hasAnyEnabled && (
          <div
            className={cn(
              'rounded-md border border-amber-500/30 bg-amber-500/10 p-3 mt-2',
              'text-xs text-amber-700 dark:text-amber-400'
            )}
          >
            <p className="font-medium mb-1">Security Note</p>
            <p>
              These settings reduce security restrictions for MCP tool usage. Only enable if you
              trust all configured MCP servers.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
