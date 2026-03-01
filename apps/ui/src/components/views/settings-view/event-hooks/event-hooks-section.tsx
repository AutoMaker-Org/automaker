import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Webhook,
  Plus,
  Trash2,
  Pencil,
  Terminal,
  Globe,
  History,
  Bell,
  Server,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import type {
  EventHook,
  EventHookTrigger,
  NtfyEndpointConfig,
  NtfyAuthenticationType,
} from '@automaker/types';
import { EVENT_HOOK_TRIGGER_LABELS } from '@automaker/types';
import { EventHookDialog } from './event-hook-dialog';
import { EventHistoryView } from './event-history-view';
import { toast } from 'sonner';
import { createLogger } from '@automaker/utils/logger';
import { generateUUID } from '@/lib/utils';

const logger = createLogger('EventHooks');

type TabType = 'hooks' | 'endpoints' | 'history';

export function EventHooksSection() {
  const { eventHooks, setEventHooks, ntfyEndpoints, setNtfyEndpoints } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<EventHook | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('hooks');

  // Ntfy endpoint dialog state
  const [endpointDialogOpen, setEndpointDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<NtfyEndpointConfig | null>(null);

  const handleAddHook = () => {
    setEditingHook(null);
    setDialogOpen(true);
  };

  const handleEditHook = (hook: EventHook) => {
    setEditingHook(hook);
    setDialogOpen(true);
  };

  const handleDeleteHook = async (hookId: string) => {
    try {
      await setEventHooks(eventHooks.filter((h) => h.id !== hookId));
    } catch (error) {
      logger.error('Failed to delete event hook:', error);
      toast.error('Failed to delete event hook');
    }
  };

  const handleToggleHook = async (hookId: string, enabled: boolean) => {
    try {
      await setEventHooks(eventHooks.map((h) => (h.id === hookId ? { ...h, enabled } : h)));
    } catch (error) {
      logger.error('Failed to toggle event hook:', error);
      toast.error('Failed to update event hook');
    }
  };

  const handleSaveHook = async (hook: EventHook) => {
    try {
      if (editingHook) {
        // Update existing
        await setEventHooks(eventHooks.map((h) => (h.id === hook.id ? hook : h)));
      } else {
        // Add new
        await setEventHooks([...eventHooks, hook]);
      }
      setDialogOpen(false);
      setEditingHook(null);
    } catch (error) {
      logger.error('Failed to save event hook:', error);
      toast.error('Failed to save event hook');
    }
  };

  // Ntfy endpoint handlers
  const handleAddEndpoint = () => {
    setEditingEndpoint(null);
    setEndpointDialogOpen(true);
  };

  const handleEditEndpoint = (endpoint: NtfyEndpointConfig) => {
    setEditingEndpoint(endpoint);
    setEndpointDialogOpen(true);
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    try {
      await setNtfyEndpoints(ntfyEndpoints.filter((e) => e.id !== endpointId));
      toast.success('Endpoint deleted');
    } catch (error) {
      logger.error('Failed to delete ntfy endpoint:', error);
      toast.error('Failed to delete endpoint');
    }
  };

  const handleToggleEndpoint = async (endpointId: string, enabled: boolean) => {
    try {
      await setNtfyEndpoints(
        ntfyEndpoints.map((e) => (e.id === endpointId ? { ...e, enabled } : e))
      );
    } catch (error) {
      logger.error('Failed to toggle ntfy endpoint:', error);
      toast.error('Failed to update endpoint');
    }
  };

  const handleSaveEndpoint = async (endpoint: NtfyEndpointConfig) => {
    try {
      if (editingEndpoint) {
        // Update existing
        await setNtfyEndpoints(ntfyEndpoints.map((e) => (e.id === endpoint.id ? endpoint : e)));
        toast.success('Endpoint updated');
      } else {
        // Add new
        await setNtfyEndpoints([...ntfyEndpoints, endpoint]);
        toast.success('Endpoint added');
      }
      setEndpointDialogOpen(false);
      setEditingEndpoint(null);
    } catch (error) {
      logger.error('Failed to save ntfy endpoint:', error);
      toast.error('Failed to save endpoint');
    }
  };

  // Group hooks by trigger type for better organization
  const hooksByTrigger = eventHooks.reduce(
    (acc, hook) => {
      if (!acc[hook.trigger]) {
        acc[hook.trigger] = [];
      }
      acc[hook.trigger].push(hook);
      return acc;
    },
    {} as Record<EventHookTrigger, EventHook[]>
  );

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
              <Webhook className="w-5 h-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground tracking-tight">Event Hooks</h2>
              <p className="text-sm text-muted-foreground/80">
                Run custom commands or send notifications when events occur
              </p>
            </div>
          </div>
          {activeTab === 'hooks' && (
            <Button onClick={handleAddHook} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Hook
            </Button>
          )}
          {activeTab === 'endpoints' && (
            <Button onClick={handleAddEndpoint} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Endpoint
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <div className="px-6 pt-4">
          <TabsList className="grid w-full max-w-sm grid-cols-3">
            <TabsTrigger value="hooks" className="gap-2">
              <Webhook className="w-4 h-4" />
              Hooks
            </TabsTrigger>
            <TabsTrigger value="endpoints" className="gap-2">
              <Bell className="w-4 h-4" />
              Endpoints
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Hooks Tab */}
        <TabsContent value="hooks" className="m-0">
          <div className="p-6 pt-4">
            {eventHooks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Webhook className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No event hooks configured</p>
                <p className="text-xs mt-1">
                  Add hooks to run commands or send webhooks when features complete
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group by trigger type */}
                {Object.entries(hooksByTrigger).map(([trigger, hooks]) => (
                  <div key={trigger} className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      {EVENT_HOOK_TRIGGER_LABELS[trigger as EventHookTrigger]}
                    </h3>
                    <div className="space-y-2">
                      {hooks.map((hook) => (
                        <HookCard
                          key={hook.id}
                          hook={hook}
                          ntfyEndpoints={ntfyEndpoints}
                          onEdit={() => handleEditHook(hook)}
                          onDelete={() => handleDeleteHook(hook.id)}
                          onToggle={(enabled) => handleToggleHook(hook.id, enabled)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Variable reference */}
          <div className="px-6 pb-6">
            <div className="rounded-lg bg-muted/30 p-4 text-xs text-muted-foreground">
              <p className="font-medium mb-2">Available variables:</p>
              <code className="text-[10px] leading-relaxed">
                {'{{featureId}}'} {'{{featureName}}'} {'{{projectPath}}'} {'{{projectName}}'}{' '}
                {'{{error}}'} {'{{errorType}}'} {'{{timestamp}}'} {'{{eventType}}'}
              </code>
            </div>
          </div>
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="m-0">
          <div className="p-6 pt-4">
            {ntfyEndpoints.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No ntfy endpoints configured</p>
                <p className="text-xs mt-1">Add endpoints to send push notifications via ntfy.sh</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ntfyEndpoints.map((endpoint) => (
                  <EndpointCard
                    key={endpoint.id}
                    endpoint={endpoint}
                    onEdit={() => handleEditEndpoint(endpoint)}
                    onDelete={() => handleDeleteEndpoint(endpoint.id)}
                    onToggle={(enabled) => handleToggleEndpoint(endpoint.id, enabled)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Help text */}
          <div className="px-6 pb-6">
            <div className="rounded-lg bg-muted/30 p-4 text-xs text-muted-foreground">
              <p className="font-medium mb-2">About ntfy.sh:</p>
              <p className="mb-2">
                ntfy.sh is a simple pub-sub notification service. Create a topic and subscribe via
                web, mobile app, or API.
              </p>
              <a
                href="https://ntfy.sh"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-500 hover:underline"
              >
                https://ntfy.sh
              </a>
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="m-0">
          <div className="p-6 pt-4">
            <EventHistoryView />
          </div>
        </TabsContent>
      </Tabs>

      {/* Hook Dialog */}
      <EventHookDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingHook={editingHook}
        onSave={handleSaveHook}
      />

      {/* Endpoint Dialog */}
      <NtfyEndpointDialog
        open={endpointDialogOpen}
        onOpenChange={setEndpointDialogOpen}
        editingEndpoint={editingEndpoint}
        onSave={handleSaveEndpoint}
      />
    </div>
  );
}

interface HookCardProps {
  hook: EventHook;
  ntfyEndpoints: NtfyEndpointConfig[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

function HookCard({ hook, ntfyEndpoints, onEdit, onDelete, onToggle }: HookCardProps) {
  const isShell = hook.action.type === 'shell';
  const isHttp = hook.action.type === 'http';
  const isNtfy = hook.action.type === 'ntfy';

  // Get ntfy endpoint name if this is an ntfy hook
  const ntfyEndpointName = isNtfy
    ? ntfyEndpoints.find(
        (e) => e.id === (hook.action as { type: 'ntfy'; endpointId: string }).endpointId
      )?.name || 'Unknown endpoint'
    : null;

  // Get icon background and color
  const iconStyle = isShell
    ? 'bg-amber-500/10 text-amber-500'
    : isHttp
      ? 'bg-blue-500/10 text-blue-500'
      : 'bg-purple-500/10 text-purple-500';

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        'bg-background/50 hover:bg-background/80 transition-colors',
        !hook.enabled && 'opacity-60'
      )}
    >
      {/* Type icon */}
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconStyle)}>
        {isShell ? (
          <Terminal className="w-4 h-4" />
        ) : isHttp ? (
          <Globe className="w-4 h-4" />
        ) : (
          <Bell className="w-4 h-4" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {hook.name || (isShell ? 'Shell Command' : isHttp ? 'HTTP Webhook' : 'Ntfy Notification')}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {isShell
            ? (hook.action as { type: 'shell'; command: string }).command
            : isHttp
              ? (hook.action as { type: 'http'; url: string }).url
              : ntfyEndpointName}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Switch checked={hook.enabled} onCheckedChange={onToggle} />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

interface EndpointCardProps {
  endpoint: NtfyEndpointConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

function EndpointCard({ endpoint, onEdit, onDelete, onToggle }: EndpointCardProps) {
  return (
    <div
      data-testid="endpoint-card"
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        'bg-background/50 hover:bg-background/80 transition-colors',
        !endpoint.enabled && 'opacity-60'
      )}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10 text-purple-500">
        <Server className="w-4 h-4" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{endpoint.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {endpoint.topic} • {endpoint.serverUrl.replace(/^https?:\/\//, '')}
        </p>
      </div>

      {/* Auth badge */}
      {endpoint.authType !== 'none' && (
        <div className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
          {endpoint.authType === 'basic' ? 'Basic Auth' : 'Token'}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Switch
          checked={endpoint.enabled}
          onCheckedChange={onToggle}
          aria-label={`${endpoint.enabled ? 'Disable' : 'Enable'} endpoint ${endpoint.name}`}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onEdit}
          aria-label={`Edit endpoint ${endpoint.name}`}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label={`Delete endpoint ${endpoint.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Ntfy Endpoint Dialog Component
interface NtfyEndpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEndpoint: NtfyEndpointConfig | null;
  onSave: (endpoint: NtfyEndpointConfig) => void;
}

function NtfyEndpointDialog({
  open,
  onOpenChange,
  editingEndpoint,
  onSave,
}: NtfyEndpointDialogProps) {
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('https://ntfy.sh');
  const [topic, setTopic] = useState('');
  const [authType, setAuthType] = useState<NtfyAuthenticationType>('none');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [defaultTags, setDefaultTags] = useState('');
  const [defaultEmoji, setDefaultEmoji] = useState('');
  const [defaultClickUrl, setDefaultClickUrl] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (editingEndpoint) {
        setName(editingEndpoint.name);
        setServerUrl(editingEndpoint.serverUrl);
        setTopic(editingEndpoint.topic);
        setAuthType(editingEndpoint.authType);
        setUsername(editingEndpoint.username || '');
        setPassword(''); // Don't populate password for security
        setToken(''); // Don't populate token for security
        setDefaultTags(editingEndpoint.defaultTags || '');
        setDefaultEmoji(editingEndpoint.defaultEmoji || '');
        setDefaultClickUrl(editingEndpoint.defaultClickUrl || '');
        setEnabled(editingEndpoint.enabled);
      } else {
        setName('');
        setServerUrl('https://ntfy.sh');
        setTopic('');
        setAuthType('none');
        setUsername('');
        setPassword('');
        setToken('');
        setDefaultTags('');
        setDefaultEmoji('');
        setDefaultClickUrl('');
        setEnabled(true);
      }
    }
  }, [open, editingEndpoint]);

  const handleSave = () => {
    const trimmedPassword = password.trim();
    const trimmedToken = token.trim();
    const endpoint: NtfyEndpointConfig = {
      id: editingEndpoint?.id || generateUUID(),
      name: name.trim(),
      serverUrl: serverUrl.trim(),
      topic: topic.trim(),
      authType,
      username: authType === 'basic' ? username.trim() : undefined,
      // Preserve existing secret if input was left blank when editing
      password:
        authType === 'basic'
          ? trimmedPassword || (editingEndpoint ? editingEndpoint.password : undefined)
          : undefined,
      token:
        authType === 'token'
          ? trimmedToken || (editingEndpoint ? editingEndpoint.token : undefined)
          : undefined,
      defaultTags: defaultTags.trim() || undefined,
      defaultEmoji: defaultEmoji.trim() || undefined,
      defaultClickUrl: defaultClickUrl.trim() || undefined,
      enabled,
    };

    onSave(endpoint);
  };

  // Validate form
  const isServerUrlValid = (() => {
    const trimmed = serverUrl.trim();
    if (!trimmed) return false;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  })();
  const isValid =
    name.trim().length > 0 &&
    isServerUrlValid &&
    topic.trim().length > 0 &&
    !topic.includes(' ') &&
    (authType !== 'basic' ||
      (username.trim().length > 0 &&
        (password.trim().length > 0 || Boolean(editingEndpoint?.password)))) &&
    (authType !== 'token' || token.trim().length > 0 || Boolean(editingEndpoint?.token));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingEndpoint ? 'Edit Ntfy Endpoint' : 'Add Ntfy Endpoint'}</DialogTitle>
          <DialogDescription>
            Configure an ntfy.sh server to receive push notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-name">Name *</Label>
            <Input
              id="endpoint-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Personal Phone"
            />
          </div>

          {/* Server URL */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-server">Server URL</Label>
            <Input
              id="endpoint-server"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://ntfy.sh"
            />
            <p className="text-xs text-muted-foreground">
              Default is ntfy.sh. Use custom URL for self-hosted servers.
            </p>
          </div>

          {/* Topic */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-topic">Topic *</Label>
            <Input
              id="endpoint-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="my-automaker-notifications"
            />
            <p className="text-xs text-muted-foreground">
              Topic name (no spaces). This acts like a channel for your notifications.
            </p>
          </div>

          {/* Authentication */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-auth">Authentication</Label>
            <Select
              value={authType}
              onValueChange={(v) => setAuthType(v as NtfyAuthenticationType)}
            >
              <SelectTrigger id="endpoint-auth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (public topic)</SelectItem>
                <SelectItem value="basic">Username & Password</SelectItem>
                <SelectItem value="token">Access Token</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conditional auth fields */}
          {authType === 'basic' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="endpoint-username">Username</Label>
                <Input
                  id="endpoint-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endpoint-password">Password</Label>
                <Input
                  id="endpoint-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password"
                />
              </div>
            </div>
          )}

          {authType === 'token' && (
            <div className="space-y-2">
              <Label htmlFor="endpoint-token">Access Token</Label>
              <Input
                id="endpoint-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="tk_xxxxxxxxxxxxx"
              />
            </div>
          )}

          {/* Default Tags */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-tags">Default Tags (optional)</Label>
            <Input
              id="endpoint-tags"
              value={defaultTags}
              onChange={(e) => setDefaultTags(e.target.value)}
              placeholder="warning,skull"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated tags or emoji shortcodes (e.g., warning, partypopper)
            </p>
          </div>

          {/* Default Emoji */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-emoji">Default Emoji (optional)</Label>
            <Input
              id="endpoint-emoji"
              value={defaultEmoji}
              onChange={(e) => setDefaultEmoji(e.target.value)}
              placeholder="tada"
            />
          </div>

          {/* Default Click URL */}
          <div className="space-y-2">
            <Label htmlFor="endpoint-click">Default Click URL (optional)</Label>
            <Input
              id="endpoint-click"
              value={defaultClickUrl}
              onChange={(e) => setDefaultClickUrl(e.target.value)}
              placeholder="http://localhost:3007"
            />
            <p className="text-xs text-muted-foreground">
              URL to open when notification is clicked. Auto-linked to project/feature if available.
            </p>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="endpoint-enabled">Enabled</Label>
            <Switch id="endpoint-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {editingEndpoint ? 'Save Changes' : 'Add Endpoint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
