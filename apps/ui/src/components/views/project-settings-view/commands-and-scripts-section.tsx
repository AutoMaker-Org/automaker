import { useState, useEffect, useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Terminal,
  Save,
  RotateCcw,
  Info,
  X,
  Play,
  FlaskConical,
  ScrollText,
  Plus,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useProjectSettings } from '@/hooks/queries';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import type { Project } from '@/lib/electron';
import { toast } from 'sonner';
import { DEFAULT_TERMINAL_SCRIPTS } from './terminal-scripts-constants';

/** Preset dev server commands for quick selection */
const DEV_SERVER_PRESETS = [
  { label: 'npm run dev', command: 'npm run dev' },
  { label: 'yarn dev', command: 'yarn dev' },
  { label: 'pnpm dev', command: 'pnpm dev' },
  { label: 'bun dev', command: 'bun dev' },
  { label: 'npm start', command: 'npm start' },
  { label: 'cargo watch', command: 'cargo watch -x run' },
  { label: 'go run', command: 'go run .' },
] as const;

/** Preset test commands for quick selection */
const TEST_PRESETS = [
  { label: 'npm test', command: 'npm test' },
  { label: 'yarn test', command: 'yarn test' },
  { label: 'pnpm test', command: 'pnpm test' },
  { label: 'bun test', command: 'bun test' },
  { label: 'pytest', command: 'pytest' },
  { label: 'cargo test', command: 'cargo test' },
  { label: 'go test', command: 'go test ./...' },
] as const;

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

interface CommandsAndScriptsSectionProps {
  project: Project;
}

/** Generate a unique ID for a new script */
function generateId(): string {
  return `script-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CommandsAndScriptsSection({ project }: CommandsAndScriptsSectionProps) {
  // Fetch project settings using TanStack Query
  const { data: projectSettings, isLoading, isError } = useProjectSettings(project.path);

  // Mutation hook for updating project settings
  const updateSettingsMutation = useUpdateProjectSettings(project.path);

  // ── Commands state ──
  const [devCommand, setDevCommand] = useState('');
  const [originalDevCommand, setOriginalDevCommand] = useState('');
  const [testCommand, setTestCommand] = useState('');
  const [originalTestCommand, setOriginalTestCommand] = useState('');

  // ── Scripts state ──
  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [originalScripts, setOriginalScripts] = useState<ScriptEntry[]>([]);

  // Dragging state for scripts
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Track previous project path to detect project switches
  const prevProjectPathRef = useRef(project.path);
  // Track whether we've done the initial sync for the current project
  const isInitializedRef = useRef(false);

  // Sync commands and scripts state when project settings load or project changes
  useEffect(() => {
    const projectChanged = prevProjectPathRef.current !== project.path;
    prevProjectPathRef.current = project.path;

    // Always clear local state on project change to avoid flashing stale data
    if (projectChanged) {
      isInitializedRef.current = false;
      setDevCommand('');
      setOriginalDevCommand('');
      setTestCommand('');
      setOriginalTestCommand('');
      setScripts([]);
      setOriginalScripts([]);
    }

    // Apply project settings only when they are available
    if (projectSettings) {
      // Only sync from server if this is the initial load or if there are no unsaved edits.
      // This prevents background refetches from overwriting in-progress local edits.
      const isDirty =
        isInitializedRef.current &&
        (devCommand !== originalDevCommand ||
          testCommand !== originalTestCommand ||
          JSON.stringify(scripts) !== JSON.stringify(originalScripts));

      if (!isInitializedRef.current || !isDirty) {
        // Commands
        const dev = projectSettings.devCommand || '';
        const test = projectSettings.testCommand || '';
        setDevCommand(dev);
        setOriginalDevCommand(dev);
        setTestCommand(test);
        setOriginalTestCommand(test);

        // Scripts
        const configured = projectSettings.terminalScripts;
        const scriptList =
          configured && configured.length > 0
            ? configured.map((s) => ({ id: s.id, name: s.name, command: s.command }))
            : DEFAULT_TERMINAL_SCRIPTS.map((s) => ({ ...s }));
        setScripts(scriptList);
        setOriginalScripts(structuredClone(scriptList));

        isInitializedRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSettings, project.path]);

  // ── Change detection ──
  const hasDevChanges = devCommand !== originalDevCommand;
  const hasTestChanges = testCommand !== originalTestCommand;
  const hasCommandChanges = hasDevChanges || hasTestChanges;
  const hasScriptChanges = useMemo(
    () => JSON.stringify(scripts) !== JSON.stringify(originalScripts),
    [scripts, originalScripts]
  );
  const hasChanges = hasCommandChanges || hasScriptChanges;
  const isSaving = updateSettingsMutation.isPending;

  // ── Save all (commands + scripts) ──
  const handleSave = useCallback(() => {
    const normalizedDevCommand = devCommand.trim();
    const normalizedTestCommand = testCommand.trim();
    const validScripts = scripts.filter((s) => s.name.trim() && s.command.trim());
    const normalizedScripts = validScripts.map((s) => ({
      id: s.id,
      name: s.name.trim(),
      command: s.command.trim(),
    }));

    updateSettingsMutation.mutate(
      {
        devCommand: normalizedDevCommand || null,
        testCommand: normalizedTestCommand || null,
        terminalScripts: normalizedScripts,
      },
      {
        onSuccess: () => {
          setDevCommand(normalizedDevCommand);
          setOriginalDevCommand(normalizedDevCommand);
          setTestCommand(normalizedTestCommand);
          setOriginalTestCommand(normalizedTestCommand);
          setScripts(normalizedScripts);
          setOriginalScripts(structuredClone(normalizedScripts));
        },
        onError: (error) => {
          toast.error('Failed to save settings', {
            description: error instanceof Error ? error.message : 'An unexpected error occurred',
          });
        },
      }
    );
  }, [devCommand, testCommand, scripts, updateSettingsMutation]);

  // ── Reset all ──
  const handleReset = useCallback(() => {
    setDevCommand(originalDevCommand);
    setTestCommand(originalTestCommand);
    setScripts(structuredClone(originalScripts));
  }, [originalDevCommand, originalTestCommand, originalScripts]);

  // ── Command handlers ──
  const handleUseDevPreset = useCallback((command: string) => {
    setDevCommand(command);
  }, []);

  const handleUseTestPreset = useCallback((command: string) => {
    setTestCommand(command);
  }, []);

  const handleClearDev = useCallback(() => {
    setDevCommand('');
  }, []);

  const handleClearTest = useCallback(() => {
    setTestCommand('');
  }, []);

  // ── Script handlers ──
  const handleAddScript = useCallback(() => {
    setScripts((prev) => [...prev, { id: generateId(), name: '', command: '' }]);
  }, []);

  const handleAddPreset = useCallback((preset: { name: string; command: string }) => {
    setScripts((prev) => [
      ...prev,
      { id: generateId(), name: preset.name, command: preset.command },
    ]);
  }, []);

  const handleRemoveScript = useCallback((index: number) => {
    setScripts((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

  // ── Drag and drop handlers for script reordering ──
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
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  // ── Keyboard reorder helpers for accessibility ──
  const moveScript = useCallback((fromIndex: number, toIndex: number) => {
    setScripts((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const newScripts = [...prev];
      const [removed] = newScripts.splice(fromIndex, 1);
      newScripts.splice(toIndex, 0, removed);
      return newScripts;
    });
  }, []);

  const handleDragHandleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveScript(index, index - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveScript(index, index + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        moveScript(index, 0);
      } else if (e.key === 'End') {
        e.preventDefault();
        moveScript(index, scripts.length - 1);
      }
    },
    [moveScript, scripts.length]
  );

  return (
    <div className="space-y-6">
      {/* ── Commands Card ── */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
        data-testid="commands-section"
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Terminal className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Project Commands
            </h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Configure custom commands for development and testing.
          </p>
        </div>

        <div className="p-6 space-y-8">
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
              {/* Dev Server Command Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-brand-500" />
                  <h3 className="text-base font-medium text-foreground">Dev Server</h3>
                  {hasDevChanges && (
                    <span className="text-xs text-amber-500 font-medium">(unsaved)</span>
                  )}
                </div>

                <div className="space-y-3 pl-6">
                  <div className="relative">
                    <Input
                      id="dev-command"
                      value={devCommand}
                      onChange={(e) => setDevCommand(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g., npm run dev, yarn dev, cargo watch"
                      className="font-mono text-sm pr-8"
                      data-testid="dev-command-input"
                    />
                    {devCommand && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearDev}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        aria-label="Clear dev command"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/80">
                    Leave empty to auto-detect based on your package manager.
                  </p>

                  {/* Dev Presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {DEV_SERVER_PRESETS.map((preset) => (
                      <Button
                        key={preset.command}
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseDevPreset(preset.command)}
                        className="text-xs font-mono h-7 px-2"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border/30" />

              {/* Test Command Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-brand-500" />
                  <h3 className="text-base font-medium text-foreground">Test Runner</h3>
                  {hasTestChanges && (
                    <span className="text-xs text-amber-500 font-medium">(unsaved)</span>
                  )}
                </div>

                <div className="space-y-3 pl-6">
                  <div className="relative">
                    <Input
                      id="test-command"
                      value={testCommand}
                      onChange={(e) => setTestCommand(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g., npm test, pytest, cargo test"
                      className="font-mono text-sm pr-8"
                      data-testid="test-command-input"
                    />
                    {testCommand && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearTest}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        aria-label="Clear test command"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/80">
                    Leave empty to auto-detect based on your project structure.
                  </p>

                  {/* Test Presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {TEST_PRESETS.map((preset) => (
                      <Button
                        key={preset.command}
                        variant="outline"
                        size="sm"
                        onClick={() => handleUseTestPreset(preset.command)}
                        className="text-xs font-mono h-7 px-2"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Auto-detection Info */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/20 border border-border/30">
                <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Auto-detection</p>
                  <p>
                    When no custom command is set, the system automatically detects your package
                    manager and test framework based on project files (package.json, Cargo.toml,
                    go.mod, etc.).
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Terminal Quick Scripts Card ── */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
        data-testid="scripts-section"
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
                    {/* Drag handle - keyboard accessible */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded shrink-0 p-0.5"
                      title="Drag to reorder (or use Arrow keys)"
                      tabIndex={0}
                      role="button"
                      aria-label={`Reorder ${script.name || 'script'}. Use arrow keys to move.`}
                      onKeyDown={(e) => handleDragHandleKeyDown(e, index)}
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
                    Clicking a script will type the command into the active terminal and press
                    Enter. Drag to reorder scripts.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Shared Action Buttons ── */}
      <div className="flex items-center justify-end gap-2">
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
    </div>
  );
}
