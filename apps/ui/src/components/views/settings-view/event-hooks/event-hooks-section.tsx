import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Webhook, Plus, Trash2, Pencil, Terminal, Globe, History } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import type { EventHook, EventHookTrigger } from '@automaker/types';
import { EVENT_HOOK_TRIGGER_LABELS } from '@automaker/types';
import { EventHookDialog } from './event-hook-dialog';
import { EventHistoryView } from './event-history-view';

export function EventHooksSection() {
  const { eventHooks, setEventHooks } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<EventHook | null>(null);
  const [activeTab, setActiveTab] = useState<'hooks' | 'history'>('hooks');

  const handleAddHook = () => {
    setEditingHook(null);
    setDialogOpen(true);
  };

  const handleEditHook = (hook: EventHook) => {
    setEditingHook(hook);
    setDialogOpen(true);
  };

  const handleDeleteHook = (hookId: string) => {
    setEventHooks(eventHooks.filter((h) => h.id !== hookId));
  };

  const handleToggleHook = (hookId: string, enabled: boolean) => {
    setEventHooks(eventHooks.map((h) => (h.id === hookId ? { ...h, enabled } : h)));
  };

  const handleSaveHook = (hook: EventHook) => {
    if (editingHook) {
      // Update existing
      setEventHooks(eventHooks.map((h) => (h.id === hook.id ? hook : h)));
    } else {
      // Add new
      setEventHooks([...eventHooks, hook]);
    }
    setDialogOpen(false);
    setEditingHook(null);
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
                Run custom commands or webhooks when events occur
              </p>
            </div>
          </div>
          {activeTab === 'hooks' && (
            <Button onClick={handleAddHook} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Hook
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'hooks' | 'history')}>
        <div className="px-6 pt-4">
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="hooks" className="gap-2">
              <Webhook className="w-4 h-4" />
              Hooks
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
                {'{{error}}'} {'{{timestamp}}'} {'{{eventType}}'}
              </code>
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

      {/* Dialog */}
      <EventHookDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingHook={editingHook}
        onSave={handleSaveHook}
      />
    </div>
  );
}

interface HookCardProps {
  hook: EventHook;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

function HookCard({ hook, onEdit, onDelete, onToggle }: HookCardProps) {
  const isShell = hook.action.type === 'shell';

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border',
        'bg-background/50 hover:bg-background/80 transition-colors',
        !hook.enabled && 'opacity-60'
      )}
    >
      {/* Type icon */}
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          isShell ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
        )}
      >
        {isShell ? <Terminal className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {hook.name || (isShell ? 'Shell Command' : 'HTTP Webhook')}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {isShell
            ? (hook.action as { type: 'shell'; command: string }).command
            : (hook.action as { type: 'http'; url: string }).url}
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
