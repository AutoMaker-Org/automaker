import { useState, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollText, Save, RotateCcw, Info, Plus, GripVertical, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useProjectSettings } from '@/hooks/queries';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import type { Project } from '@/lib/electron';
import { DEFAULT_TERMINAL_SCRIPTS } from './terminal-scripts-constants';

/** Preset scripts for quick addition */
const SCRIPT_PRESETS = [
  { name: 'Dev Server', command: 'npm run dev' },
  { name: 'Build', command: 'npm run build' },
  { name: 'Test', command: 'npm run test' },
  { name: 'Lint', command: 'npm run lint' },
  { name: 'Format', command: 'npm run format' },
  { name: 'Type Check', command: 'npm run typecheck' },
  { name: 'Start', command: 'npm start' },
  { name: 'Clean', command: 'npm run clean' },
] as const;

interface ScriptEntry {
  id: string;
  name: string;
  command: string;
}

interface TerminalScriptsSectionProps {
  project: Project;
}

/** Generate a unique ID for a new script */
function generateId(): string {
  return `script-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function TerminalScriptsSection({ project }: TerminalScriptsSectionProps) {
  // Fetch project settings using TanStack Query
  const { data: projectSettings, isLoading, isError } = useProjectSettings(project.path);

  // Mutation hook for updating project settings
  const updateSettingsMutation = useUpdateProjectSettings(project.path);

  // Local state for scripts
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [originalScripts, setOriginalScripts] = useState<ScriptEntry[]>([]);

  // Dragging state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Reset local state when project changes
  useEffect(() => {
    setScripts([]);
    setOriginalScripts([]);
  }, [project.path]);

  // Sync local state when project settings load or project path changes.
  // Including project.path ensures originalScripts is re-populated after a
  // project switch even if projectSettings is cached from a previous render.
  useEffect(() => {
    if (projectSettings) {
      const configured = projectSettings.terminalScripts;
      const scriptList =
        configured && configured.length > 0
          ? configured.map((s) => ({ id: s.id, name: s.name, command: s.command }))
          : DEFAULT_TERMINAL_SCRIPTS.map((s) => ({ ...s }));
      setScripts(scriptList);
      setOriginalScripts(JSON.parse(JSON.stringify(scriptList)));
    }
  }, [projectSettings, project.path]);

  // Check if there are unsaved changes
  const hasChanges = JSON.stringify(scripts) !== JSON.stringify(originalScripts);
  const isSaving = updateSettingsMutation.isPending;

  // Save scripts
  const handleSave = useCallback(() => {
    // Filter out scripts with empty names or commands
    const validScripts = scripts.filter((s) => s.name.trim() && s.command.trim());
    const normalizedScripts = validScripts.map((s) => ({
      id: s.id,
      name: s.name.trim(),
      command: s.command.trim(),
    }));

    updateSettingsMutation.mutate(
      { terminalScripts: normalizedScripts },
      {
        onSuccess: () => {
          setScripts(normalizedScripts);
          setOriginalScripts(JSON.parse(JSON.stringify(normalizedScripts)));
        },
      }
    );
  }, [scripts, updateSettingsMutation]);

  // Reset to original values
  const handleReset = useCallback(() => {
    setScripts(JSON.parse(JSON.stringify(originalScripts)));
  }, [originalScripts]);

  // Add a new empty script entry
  const handleAddScript = useCallback(() => {
    setScripts((prev) => [...prev, { id: generateId(), name: '', command: '' }]);
  }, []);

  // Add a preset script
  const handleAddPreset = useCallback((preset: { name: string; command: string }) => {
    setScripts((prev) => [
      ...prev,
      { id: generateId(), name: preset.name, command: preset.command },
    ]);
  }, []);

  // Remove a script by index
  const handleRemoveScript = useCallback((index: number) => {
    setScripts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Update a script field
  const handleUpdateScript = useCallback(
    (index: number, field: 'name' | 'command', value: string) => {
      setScripts((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
    },
    []
  );

  // Handle keyboard shortcuts (Enter to save)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && hasChanges && !isSaving) {
        e.preventDefault();
        handleSave();
      }
    },
    [hasChanges, isSaving, handleSave]
  );

  // Drag and drop handlers for reordering
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedIndex === null || draggedIndex === index) return;
      setDragOverIndex(index);
    },
    [draggedIndex]
  );

  // Accept the drop so the browser sets dropEffect correctly (prevents 'none')
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
        setScripts((prev) => {
          const newScripts = [...prev];
          const [removed] = newScripts.splice(draggedIndex, 1);
          newScripts.splice(dragOverIndex, 0, removed);
          return newScripts;
        });
      }
      setDraggedIndex(null);
      setDragOverIndex(null);
    },
    [draggedIndex, dragOverIndex]
  );

  const handleDragEnd = useCallback((_e: React.DragEvent) => {
    // The reorder is already performed in handleDrop. This handler only
    // needs to reset the drag state (e.g. when the drop was cancelled by
    // releasing outside a valid target or pressing Escape).
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

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
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <ScrollText className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Terminal Quick Scripts
          </h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure quick-access scripts that appear in the terminal header dropdown. Click any
          script to run it instantly.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-8 text-sm text-destructive">
            Failed to load project settings. Please try again.
          </div>
        ) : (
          <>
            {/* Scripts List */}
            <div className="space-y-2">
              {scripts.map((script, index) => (
                <div
                  key={script.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-lg border border-border/30 bg-accent/10 transition-all',
                    draggedIndex === index && 'opacity-50',
                    dragOverIndex === index && 'border-brand-500/50 bg-brand-500/5'
                  )}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e)}
                  onDragEnd={(e) => handleDragEnd(e)}
                >
                  {/* Drag handle */}
                  <div
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 p-0.5"
                    title="Drag to reorder"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Script name */}
                  <Input
                    value={script.name}
                    onChange={(e) => handleUpdateScript(index, 'name', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Script name"
                    className="h-8 text-sm flex-[0.4] min-w-0"
                  />

                  {/* Script command */}
                  <Input
                    value={script.command}
                    onChange={(e) => handleUpdateScript(index, 'command', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Command to run"
                    className="h-8 text-sm font-mono flex-[0.6] min-w-0"
                  />

                  {/* Remove button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveScript(index)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    aria-label={`Remove ${script.name || 'script'}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}

              {scripts.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No scripts configured. Add some below or use a preset.
                </div>
              )}
            </div>

            {/* Add Script Button */}
            <Button variant="outline" size="sm" onClick={handleAddScript} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Add Script
            </Button>

            {/* Divider */}
            <div className="border-t border-border/30" />

            {/* Presets */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Quick Add Presets</h3>
              <div className="flex flex-wrap gap-1.5">
                {SCRIPT_PRESETS.map((preset) => (
                  <Button
                    key={preset.command}
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddPreset(preset)}
                    className="text-xs font-mono h-7 px-2"
                  >
                    {preset.command}
                  </Button>
                ))}
              </div>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/20 border border-border/30">
              <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Terminal Quick Scripts</p>
                <p>
                  These scripts appear in the terminal header as a dropdown menu (the{' '}
                  <ScrollText className="inline-block w-3 h-3 mx-0.5 align-middle" /> icon).
                  Clicking a script will type the command into the active terminal and press Enter.
                  Drag to reorder scripts.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
                className="gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="gap-1.5"
              >
                {isSaving ? <Spinner size="xs" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
