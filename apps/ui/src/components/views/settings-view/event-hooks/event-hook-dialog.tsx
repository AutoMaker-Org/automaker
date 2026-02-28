import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Terminal, Globe, Bell } from 'lucide-react';
import type {
  EventHook,
  EventHookTrigger,
  EventHookHttpMethod,
  EventHookShellAction,
  EventHookHttpAction,
  EventHookNtfyAction,
} from '@automaker/types';
import { EVENT_HOOK_TRIGGER_LABELS } from '@automaker/types';
import { generateUUID } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';

interface EventHookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingHook: EventHook | null;
  onSave: (hook: EventHook) => void;
}

type ActionType = 'shell' | 'http' | 'ntfy';

const TRIGGER_OPTIONS: EventHookTrigger[] = [
  'feature_created',
  'feature_success',
  'feature_error',
  'auto_mode_complete',
  'auto_mode_error',
];

const HTTP_METHODS: EventHookHttpMethod[] = ['POST', 'GET', 'PUT', 'PATCH'];

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Min (no sound/vibration)' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Default' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Urgent (max)' },
];

export function EventHookDialog({ open, onOpenChange, editingHook, onSave }: EventHookDialogProps) {
  const ntfyEndpoints = useAppStore((state) => state.ntfyEndpoints);

  // Form state
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<EventHookTrigger>('feature_success');
  const [actionType, setActionType] = useState<ActionType>('shell');

  // Shell action state
  const [command, setCommand] = useState('');
  const [timeout, setTimeout] = useState('30000');

  // HTTP action state
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<EventHookHttpMethod>('POST');
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');

  // Ntfy action state
  const [ntfyEndpointId, setNtfyEndpointId] = useState('');
  const [ntfyTitle, setNtfyTitle] = useState('');
  const [ntfyBody, setNtfyBody] = useState('');
  const [ntfyTags, setNtfyTags] = useState('');
  const [ntfyEmoji, setNtfyEmoji] = useState('');
  const [ntfyClickUrl, setNtfyClickUrl] = useState('');
  const [ntfyPriority, setNtfyPriority] = useState<1 | 2 | 3 | 4 | 5>(3);

  // Reset form when dialog opens/closes or editingHook changes
  useEffect(() => {
    if (open) {
      if (editingHook) {
        // Populate form with existing hook data
        setName(editingHook.name || '');
        setTrigger(editingHook.trigger);
        setActionType(editingHook.action.type as ActionType);

        if (editingHook.action.type === 'shell') {
          const shellAction = editingHook.action as EventHookShellAction;
          setCommand(shellAction.command);
          setTimeout(String(shellAction.timeout || 30000));
          // Reset other fields
          resetHttpFields();
          resetNtfyFields();
        } else if (editingHook.action.type === 'http') {
          const httpAction = editingHook.action as EventHookHttpAction;
          setUrl(httpAction.url);
          setMethod(httpAction.method);
          setHeaders(httpAction.headers ? JSON.stringify(httpAction.headers, null, 2) : '');
          setBody(httpAction.body || '');
          // Reset other fields
          resetShellFields();
          resetNtfyFields();
        } else if (editingHook.action.type === 'ntfy') {
          const ntfyAction = editingHook.action as EventHookNtfyAction;
          setNtfyEndpointId(ntfyAction.endpointId);
          setNtfyTitle(ntfyAction.title || '');
          setNtfyBody(ntfyAction.body || '');
          setNtfyTags(ntfyAction.tags || '');
          setNtfyEmoji(ntfyAction.emoji || '');
          setNtfyClickUrl(ntfyAction.clickUrl || '');
          setNtfyPriority(ntfyAction.priority || 3);
          // Reset other fields
          resetShellFields();
          resetHttpFields();
        }
      } else {
        // Reset to defaults for new hook
        setName('');
        setTrigger('feature_success');
        setActionType('shell');
        resetShellFields();
        resetHttpFields();
        resetNtfyFields();
      }
    }
  }, [open, editingHook]);

  const resetShellFields = () => {
    setCommand('');
    setTimeout('30000');
  };

  const resetHttpFields = () => {
    setUrl('');
    setMethod('POST');
    setHeaders('');
    setBody('');
  };

  const resetNtfyFields = () => {
    setNtfyEndpointId('');
    setNtfyTitle('');
    setNtfyBody('');
    setNtfyTags('');
    setNtfyEmoji('');
    setNtfyClickUrl('');
    setNtfyPriority(3);
  };

  const handleSave = () => {
    let action: EventHook['action'];

    if (actionType === 'shell') {
      action = {
        type: 'shell',
        command,
        timeout: parseInt(timeout, 10) || 30000,
      };
    } else if (actionType === 'http') {
      // Parse headers JSON with error handling
      let parsedHeaders: Record<string, string> | undefined;
      if (headers.trim()) {
        try {
          parsedHeaders = JSON.parse(headers);
        } catch {
          // If JSON is invalid, show error and don't save
          toast.error('Invalid JSON in Headers field');
          return;
        }
      }
      action = {
        type: 'http',
        url,
        method,
        headers: parsedHeaders,
        body: body.trim() || undefined,
      };
    } else {
      action = {
        type: 'ntfy',
        endpointId: ntfyEndpointId,
        title: ntfyTitle.trim() || undefined,
        body: ntfyBody.trim() || undefined,
        tags: ntfyTags.trim() || undefined,
        emoji: ntfyEmoji.trim() || undefined,
        clickUrl: ntfyClickUrl.trim() || undefined,
        priority: ntfyPriority,
      };
    }

    const hook: EventHook = {
      id: editingHook?.id || generateUUID(),
      name: name.trim() || undefined,
      trigger,
      enabled: editingHook?.enabled ?? true,
      action,
    };

    onSave(hook);
  };

  const selectedEndpoint = ntfyEndpoints.find((e) => e.id === ntfyEndpointId);

  const isValid = (() => {
    if (actionType === 'shell') return command.trim().length > 0;
    if (actionType === 'http') return url.trim().length > 0;
    if (actionType === 'ntfy') return Boolean(selectedEndpoint);
    return false;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingHook ? 'Edit Event Hook' : 'Add Event Hook'}</DialogTitle>
          <DialogDescription>
            Configure an action to run when a specific event occurs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name (optional) */}
          <div className="space-y-2">
            <Label htmlFor="hook-name">Name (optional)</Label>
            <Input
              id="hook-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My notification hook"
            />
          </div>

          {/* Trigger selection */}
          <div className="space-y-2">
            <Label htmlFor="hook-trigger">Trigger Event</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as EventHookTrigger)}>
              <SelectTrigger id="hook-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_HOOK_TRIGGER_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action type tabs */}
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Tabs value={actionType} onValueChange={(v) => setActionType(v as ActionType)}>
              <TabsList className="w-full">
                <TabsTrigger value="shell" className="flex-1 gap-1">
                  <Terminal className="w-4 h-4" />
                  <span className="sr-only sm:inline">Shell</span>
                </TabsTrigger>
                <TabsTrigger value="http" className="flex-1 gap-1">
                  <Globe className="w-4 h-4" />
                  <span className="sr-only sm:inline">HTTP</span>
                </TabsTrigger>
                <TabsTrigger value="ntfy" className="flex-1 gap-1">
                  <Bell className="w-4 h-4" />
                  <span className="sr-only sm:inline">Ntfy</span>
                </TabsTrigger>
              </TabsList>

              {/* Shell command form */}
              <TabsContent value="shell" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="shell-command">Command</Label>
                  <Textarea
                    id="shell-command"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder='echo "Feature {{featureId}} completed!"'
                    className="font-mono text-sm"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {'{{variable}}'} syntax for dynamic values
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shell-timeout">Timeout (ms)</Label>
                  <Input
                    id="shell-timeout"
                    type="number"
                    value={timeout}
                    onChange={(e) => setTimeout(e.target.value)}
                    placeholder="30000"
                  />
                </div>
              </TabsContent>

              {/* HTTP request form */}
              <TabsContent value="http" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="http-url">URL</Label>
                  <Input
                    id="http-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://api.example.com/webhook"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="http-method">Method</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as EventHookHttpMethod)}>
                    <SelectTrigger id="http-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HTTP_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="http-headers">Headers (JSON, optional)</Label>
                  <Textarea
                    id="http-headers"
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    placeholder={'{\n  "Authorization": "Bearer {{token}}"\n}'}
                    className="font-mono text-sm"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="http-body">Body (JSON, optional)</Label>
                  <Textarea
                    id="http-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={'{\n  "feature": "{{featureId}}",\n  "status": "{{eventType}}"\n}'}
                    className="font-mono text-sm"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty for default body with all event context
                  </p>
                </div>
              </TabsContent>

              {/* Ntfy notification form */}
              <TabsContent value="ntfy" className="space-y-4 mt-4">
                {ntfyEndpoints.length === 0 ? (
                  <div className="rounded-lg bg-muted/50 p-4 text-center">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">No ntfy endpoints configured.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add an endpoint in the "Endpoints" tab first.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="ntfy-endpoint">Endpoint *</Label>
                      <Select value={ntfyEndpointId} onValueChange={setNtfyEndpointId}>
                        <SelectTrigger id="ntfy-endpoint">
                          <SelectValue placeholder="Select an endpoint" />
                        </SelectTrigger>
                        <SelectContent>
                          {ntfyEndpoints
                            .filter((e) => e.enabled)
                            .map((endpoint) => (
                              <SelectItem key={endpoint.id} value={endpoint.id}>
                                {endpoint.name} ({endpoint.topic})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedEndpoint && (
                      <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                        <p>
                          <strong>Server:</strong> {selectedEndpoint.serverUrl}
                        </p>
                        {selectedEndpoint.defaultTags && (
                          <p>
                            <strong>Default Tags:</strong> {selectedEndpoint.defaultTags}
                          </p>
                        )}
                        {selectedEndpoint.defaultEmoji && (
                          <p>
                            <strong>Default Emoji:</strong> {selectedEndpoint.defaultEmoji}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="ntfy-title">Title (optional)</Label>
                      <Input
                        id="ntfy-title"
                        value={ntfyTitle}
                        onChange={(e) => setNtfyTitle(e.target.value)}
                        placeholder="Feature {{featureName}} completed"
                      />
                      <p className="text-xs text-muted-foreground">
                        Defaults to event name. Use {'{{variable}}'} for dynamic values.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ntfy-body">Message (optional)</Label>
                      <Textarea
                        id="ntfy-body"
                        value={ntfyBody}
                        onChange={(e) => setNtfyBody(e.target.value)}
                        placeholder="Feature {{featureId}} completed at {{timestamp}}"
                        className="font-mono text-sm"
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Defaults to event details. Leave empty for auto-generated message.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="ntfy-tags">Tags (optional)</Label>
                        <Input
                          id="ntfy-tags"
                          value={ntfyTags}
                          onChange={(e) => setNtfyTags(e.target.value)}
                          placeholder="warning,skull"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ntfy-emoji">Emoji</Label>
                        <Input
                          id="ntfy-emoji"
                          value={ntfyEmoji}
                          onChange={(e) => setNtfyEmoji(e.target.value)}
                          placeholder="tada"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ntfy-click">Click URL (optional)</Label>
                      <Input
                        id="ntfy-click"
                        value={ntfyClickUrl}
                        onChange={(e) => setNtfyClickUrl(e.target.value)}
                        placeholder="https://example.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        URL to open when notification is clicked. Defaults to endpoint setting.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ntfy-priority">Priority</Label>
                      <Select
                        value={String(ntfyPriority)}
                        onValueChange={(v) => setNtfyPriority(Number(v) as 1 | 2 | 3 | 4 | 5)}
                      >
                        <SelectTrigger id="ntfy-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {editingHook ? 'Save Changes' : 'Add Hook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
