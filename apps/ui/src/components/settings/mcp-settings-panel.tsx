import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import type { McpServerConfig } from '@automaker/types';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Server, Globe, Terminal } from 'lucide-react';
import { toast } from 'sonner';

type TransportType = 'stdio' | 'http';

interface McpServerFormData {
  name: string;
  description: string;
  transportType: TransportType;
  // Stdio fields
  command: string;
  args: string;
  env: string;
  // HTTP fields
  url: string;
  headers: string;
  // Common
  enabled: boolean;
}

const DEFAULT_FORM_DATA: McpServerFormData = {
  name: '',
  description: '',
  transportType: 'stdio',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
  enabled: true,
};

export function McpSettingsPanel() {
  const { mcpServers, addMcpServer, updateMcpServer, deleteMcpServer } = useAppStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [formData, setFormData] = useState<McpServerFormData>(DEFAULT_FORM_DATA);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleOpenAddDialog = () => {
    setEditingServer(null);
    setFormData(DEFAULT_FORM_DATA);
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (server: McpServerConfig) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      description: server.description || '',
      transportType: server.transport.type,
      command: server.transport.type === 'stdio' ? server.transport.command : '',
      args: server.transport.type === 'stdio' ? server.transport.args.join('\n') : '',
      env:
        server.transport.type === 'stdio' && server.transport.env
          ? Object.entries(server.transport.env)
              .map(([k, v]) => `${k}=${v}`)
              .join('\n')
          : '',
      url: server.transport.type === 'http' ? server.transport.url : '',
      headers:
        server.transport.type === 'http' && server.transport.headers
          ? Object.entries(server.transport.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')
          : '',
      enabled: server.enabled,
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingServer(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const parseKeyValuePairs = (text: string, separator: string): Record<string, string> => {
    const result: Record<string, string> = {};
    if (!text.trim()) return result;

    text.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf(separator);
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + separator.length).trim();
        if (key) result[key] = value;
      }
    });
    return result;
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error('Server name is required');
      return;
    }

    // Check for duplicate names
    const existingServer = mcpServers.find(
      (s) =>
        s.name.toLowerCase() === formData.name.trim().toLowerCase() && s.id !== editingServer?.id
    );
    if (existingServer) {
      toast.error('A server with this name already exists');
      return;
    }

    if (formData.transportType === 'stdio') {
      if (!formData.command.trim()) {
        toast.error('Command is required for stdio transport');
        return;
      }

      const transport = {
        type: 'stdio' as const,
        command: formData.command.trim(),
        args: formData.args
          .split('\n')
          .map((a) => a.trim())
          .filter(Boolean),
        env: parseKeyValuePairs(formData.env, '='),
      };

      // Remove empty env object
      if (Object.keys(transport.env).length === 0) {
        delete (transport as { env?: Record<string, string> }).env;
      }

      if (editingServer) {
        updateMcpServer(editingServer.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          transport,
          enabled: formData.enabled,
        });
        toast.success('MCP server updated');
      } else {
        addMcpServer({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          transport,
          enabled: formData.enabled,
        });
        toast.success('MCP server added');
      }
    } else {
      if (!formData.url.trim()) {
        toast.error('URL is required for HTTP transport');
        return;
      }

      // Validate URL format
      try {
        new URL(formData.url.trim());
      } catch {
        toast.error('Invalid URL format');
        return;
      }

      const transport = {
        type: 'http' as const,
        url: formData.url.trim(),
        headers: parseKeyValuePairs(formData.headers, ':'),
      };

      // Remove empty headers object
      if (Object.keys(transport.headers).length === 0) {
        delete (transport as { headers?: Record<string, string> }).headers;
      }

      if (editingServer) {
        updateMcpServer(editingServer.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          transport,
          enabled: formData.enabled,
        });
        toast.success('MCP server updated');
      } else {
        addMcpServer({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          transport,
          enabled: formData.enabled,
        });
        toast.success('MCP server added');
      }
    }

    handleCloseDialog();
  };

  const handleDelete = (id: string) => {
    deleteMcpServer(id);
    setDeleteConfirmId(null);
    toast.success('MCP server deleted');
  };

  const handleToggleEnabled = (server: McpServerConfig) => {
    updateMcpServer(server.id, { enabled: !server.enabled });
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Server className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">MCP Servers</h2>
              <p className="text-sm text-muted-foreground/80">
                Configure Model Context Protocol servers for extended AI capabilities
              </p>
            </div>
          </div>
          <Button onClick={handleOpenAddDialog} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Server List */}
      <div className="p-6">
        {mcpServers.length === 0 ? (
          <div className="text-center py-8">
            <Server className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No MCP servers configured</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Add an MCP server to extend Claude's capabilities with external tools
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {mcpServers.map((server) => (
              <div
                key={server.id}
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl',
                  'bg-accent/30 border border-border/50',
                  'transition-all duration-200 hover:bg-accent/50'
                )}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    {server.transport.type === 'stdio' ? (
                      <Terminal className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <Globe className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{server.name}</span>
                      <Badge
                        variant={server.transport.type === 'stdio' ? 'outline' : 'secondary'}
                        size="sm"
                      >
                        {server.transport.type}
                      </Badge>
                    </div>
                    {server.description && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {server.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                      {server.transport.type === 'stdio'
                        ? `${server.transport.command} ${server.transport.args.join(' ')}`
                        : server.transport.url}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`enabled-${server.id}`}
                      className="text-xs text-muted-foreground cursor-pointer"
                    >
                      Default
                    </Label>
                    <Switch
                      id={`enabled-${server.id}`}
                      checked={server.enabled}
                      onCheckedChange={() => handleToggleEnabled(server)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleOpenEditDialog(server)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {deleteConfirmId === server.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(server.id)}
                        className="h-7 px-2 text-xs"
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(null)}
                        className="h-7 px-2 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteConfirmId(server.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingServer ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
            <DialogDescription>
              Configure a Model Context Protocol server to extend Claude's capabilities
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., filesystem, context7"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="e.g., Access to project files"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            {/* Transport Type */}
            <div className="space-y-3">
              <Label>Transport Type</Label>
              <RadioGroup
                value={formData.transportType}
                onValueChange={(value: TransportType) =>
                  setFormData((prev) => ({ ...prev, transportType: value }))
                }
                className="grid grid-cols-2 gap-3"
              >
                <div
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200',
                    formData.transportType === 'stdio'
                      ? 'bg-brand-500/10 border-2 border-brand-500/40'
                      : 'bg-accent/30 border border-border/50 hover:bg-accent/50'
                  )}
                  onClick={() => setFormData((prev) => ({ ...prev, transportType: 'stdio' }))}
                >
                  <RadioGroupItem value="stdio" id="stdio" />
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-muted-foreground" />
                    <Label htmlFor="stdio" className="cursor-pointer font-medium">
                      Stdio
                    </Label>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200',
                    formData.transportType === 'http'
                      ? 'bg-brand-500/10 border-2 border-brand-500/40'
                      : 'bg-accent/30 border border-border/50 hover:bg-accent/50'
                  )}
                  onClick={() => setFormData((prev) => ({ ...prev, transportType: 'http' }))}
                >
                  <RadioGroupItem value="http" id="http" />
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <Label htmlFor="http" className="cursor-pointer font-medium">
                      HTTP
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Stdio Fields */}
            {formData.transportType === 'stdio' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="command">Command</Label>
                  <Input
                    id="command"
                    placeholder="e.g., npx, node, python"
                    value={formData.command}
                    onChange={(e) => setFormData((prev) => ({ ...prev, command: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="args">Arguments (one per line)</Label>
                  <Textarea
                    id="args"
                    placeholder={`e.g.,\n-y\n@modelcontextprotocol/server-filesystem\n./project-dir`}
                    value={formData.args}
                    onChange={(e) => setFormData((prev) => ({ ...prev, args: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="env">Environment Variables (optional, KEY=value per line)</Label>
                  <Textarea
                    id="env"
                    placeholder={`e.g.,\nNODE_ENV=production\nDEBUG=true`}
                    value={formData.env}
                    onChange={(e) => setFormData((prev) => ({ ...prev, env: e.target.value }))}
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* HTTP Fields */}
            {formData.transportType === 'http' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    placeholder="e.g., https://mcp.example.com"
                    value={formData.url}
                    onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="headers">Headers (optional, Key: value per line)</Label>
                  <Textarea
                    id="headers"
                    placeholder={`e.g.,\nAuthorization: Bearer token123\nX-Custom-Header: value`}
                    value={formData.headers}
                    onChange={(e) => setFormData((prev) => ({ ...prev, headers: e.target.value }))}
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* Default Enabled */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-accent/30 border border-border/50">
              <div className="space-y-0.5">
                <Label htmlFor="enabled" className="cursor-pointer">
                  Enabled by Default
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically enable for new features
                </p>
              </div>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editingServer ? 'Save Changes' : 'Add Server'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
