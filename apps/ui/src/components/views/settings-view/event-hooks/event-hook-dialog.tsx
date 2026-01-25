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
import { Terminal, Globe } from 'lucide-react';
import type {
  EventHook,
  EventHookTrigger,
  EventHookHttpMethod,
  EventHookShellAction,
  EventHookHttpAction,
} from '@automaker/types';
import { EVENT_HOOK_TRIGGER_LABELS } from '@automaker/types';
import { generateUUID } from '@/lib/utils';

interface EventHookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingHook: EventHook | null;
  onSave: (hook: EventHook) => void;
}

type ActionType = 'shell' | 'http';

const TRIGGER_OPTIONS: EventHookTrigger[] = [
  'feature_created',
  'feature_success',
  'feature_error',
  'auto_mode_complete',
  'auto_mode_error',
];

const HTTP_METHODS: EventHookHttpMethod[] = ['POST', 'GET', 'PUT', 'PATCH'];

export function EventHookDialog({ open, onOpenChange, editingHook, onSave }: EventHookDialogProps) {
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

  // Reset form when dialog opens/closes or editingHook changes
  useEffect(() => {
    if (open) {
      if (editingHook) {
        // Populate form with existing hook data
        setName(editingHook.name || '');
        setTrigger(editingHook.trigger);
        setActionType(editingHook.action.type);

        if (editingHook.action.type === 'shell') {
          const shellAction = editingHook.action as EventHookShellAction;
          setCommand(shellAction.command);
          setTimeout(String(shellAction.timeout || 30000));
          // Reset HTTP fields
          setUrl('');
          setMethod('POST');
          setHeaders('');
          setBody('');
        } else {
          const httpAction = editingHook.action as EventHookHttpAction;
          setUrl(httpAction.url);
          setMethod(httpAction.method);
          setHeaders(httpAction.headers ? JSON.stringify(httpAction.headers, null, 2) : '');
          setBody(httpAction.body || '');
          // Reset shell fields
          setCommand('');
          setTimeout('30000');
        }
      } else {
        // Reset to defaults for new hook
        setName('');
        setTrigger('feature_success');
        setActionType('shell');
        setCommand('');
        setTimeout('30000');
        setUrl('');
        setMethod('POST');
        setHeaders('');
        setBody('');
      }
    }
  }, [open, editingHook]);

  const handleSave = () => {
    const hook: EventHook = {
      id: editingHook?.id || generateUUID(),
      name: name.trim() || undefined,
      trigger,
      enabled: editingHook?.enabled ?? true,
      action:
        actionType === 'shell'
          ? {
              type: 'shell',
              command,
              timeout: parseInt(timeout, 10) || 30000,
            }
          : {
              type: 'http',
              url,
              method,
              headers: headers.trim() ? JSON.parse(headers) : undefined,
              body: body.trim() || undefined,
            },
    };

    onSave(hook);
  };

  const isValid = actionType === 'shell' ? command.trim().length > 0 : url.trim().length > 0;

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
                <TabsTrigger value="shell" className="flex-1 gap-2">
                  <Terminal className="w-4 h-4" />
                  Shell Command
                </TabsTrigger>
                <TabsTrigger value="http" className="flex-1 gap-2">
                  <Globe className="w-4 h-4" />
                  HTTP Request
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
