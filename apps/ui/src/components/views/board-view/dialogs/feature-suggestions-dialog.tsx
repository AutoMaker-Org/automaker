import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Lightbulb,
  Download,
  StopCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Shield,
  Zap,
  List,
  FileText,
} from 'lucide-react';
import {
  getElectronAPI,
  FeatureSuggestion,
  SuggestionsEvent,
  SuggestionType,
} from '@/lib/electron';
import { useAppStore, Feature } from '@/store/app-store';
import { toast } from 'sonner';
import { LogViewer } from '@/components/ui/log-viewer';

interface FeatureSuggestionsDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  // Props to persist state across dialog open/close
  suggestions: FeatureSuggestion[];
  setSuggestions: (suggestions: FeatureSuggestion[]) => void;
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;
}

// Configuration for each suggestion type
const suggestionTypeConfig: Record<
  SuggestionType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    color: string;
  }
> = {
  features: {
    label: 'Feature Suggestions',
    icon: Lightbulb,
    description: 'Discover missing features and improvements',
    color: 'text-yellow-500',
  },
  refactoring: {
    label: 'Refactoring Suggestions',
    icon: RefreshCw,
    description: 'Find code smells and refactoring opportunities',
    color: 'text-blue-500',
  },
  security: {
    label: 'Security Suggestions',
    icon: Shield,
    description: 'Identify security vulnerabilities and issues',
    color: 'text-red-500',
  },
  performance: {
    label: 'Performance Suggestions',
    icon: Zap,
    description: 'Discover performance bottlenecks and optimizations',
    color: 'text-green-500',
  },
};

export function FeatureSuggestionsDialog({
  open,
  onClose,
  projectPath,
  suggestions,
  setSuggestions,
  isGenerating,
  setIsGenerating,
}: FeatureSuggestionsDialogProps) {
  const [progress, setProgress] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [currentSuggestionType, setCurrentSuggestionType] = useState<SuggestionType | null>(null);
  const [viewMode, setViewMode] = useState<'parsed' | 'raw'>('parsed');
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const { features, setFeatures } = useAppStore();

  // Initialize selectedIds when suggestions change
  useEffect(() => {
    if (suggestions.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(suggestions.map((s) => s.id)));
    }
  }, [suggestions, selectedIds.size]);

  // Auto-scroll progress when new content arrives
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current && isGenerating) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [progress, isGenerating]);

  // Listen for suggestion events when dialog is open
  useEffect(() => {
    if (!open) return;

    const api = getElectronAPI();
    if (!api?.suggestions) return;

    const unsubscribe = api.suggestions.onEvent((event: SuggestionsEvent) => {
      if (event.type === 'suggestions_progress') {
        setProgress((prev) => [...prev, event.content || '']);
      } else if (event.type === 'suggestions_tool') {
        const toolName = event.tool || 'Unknown Tool';
        const toolInput = event.input ? JSON.stringify(event.input, null, 2) : '';
        const formattedTool = `\n🔧 Tool: ${toolName}\n${toolInput ? `Input: ${toolInput}\n` : ''}`;
        setProgress((prev) => [...prev, formattedTool]);
      } else if (event.type === 'suggestions_complete') {
        setIsGenerating(false);
        if (event.suggestions && event.suggestions.length > 0) {
          setSuggestions(event.suggestions);
          // Select all by default
          setSelectedIds(new Set(event.suggestions.map((s) => s.id)));
          const typeLabel = currentSuggestionType
            ? suggestionTypeConfig[currentSuggestionType].label.toLowerCase()
            : 'suggestions';
          toast.success(`Generated ${event.suggestions.length} ${typeLabel}!`);
        } else {
          toast.info('No suggestions generated. Try again.');
        }
      } else if (event.type === 'suggestions_error') {
        setIsGenerating(false);
        toast.error(`Error: ${event.error}`);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [open, setSuggestions, setIsGenerating, currentSuggestionType]);

  // Start generating suggestions for a specific type
  const handleGenerate = useCallback(
    async (suggestionType: SuggestionType) => {
      const api = getElectronAPI();
      if (!api?.suggestions) {
        toast.error('Suggestions API not available');
        return;
      }

      setIsGenerating(true);
      setProgress([]);
      setSuggestions([]);
      setSelectedIds(new Set());
      setCurrentSuggestionType(suggestionType);

      try {
        const result = await api.suggestions.generate(projectPath, suggestionType);
        if (!result.success) {
          toast.error(result.error || 'Failed to start generation');
          setIsGenerating(false);
        }
      } catch (error) {
        console.error('Failed to generate suggestions:', error);
        toast.error('Failed to start generation');
        setIsGenerating(false);
      }
    },
    [projectPath, setIsGenerating, setSuggestions]
  );

  // Stop generating
  const handleStop = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.suggestions) return;

    try {
      await api.suggestions.stop();
      setIsGenerating(false);
      toast.info('Generation stopped');
    } catch (error) {
      console.error('Failed to stop generation:', error);
    }
  }, [setIsGenerating]);

  // Toggle suggestion selection
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Toggle expand/collapse for a suggestion
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map((s) => s.id)));
    }
  }, [selectedIds.size, suggestions]);

  // Import selected suggestions as features
  const handleImport = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.warning('No suggestions selected');
      return;
    }

    setIsImporting(true);

    try {
      const api = getElectronAPI();
      const selectedSuggestions = suggestions.filter((s) => selectedIds.has(s.id));

      // Create new features from selected suggestions
      const newFeatures: Feature[] = selectedSuggestions.map((s) => ({
        id: `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: s.category,
        description: s.description,
        steps: [], // Required empty steps array for new features
        status: 'backlog' as const,
        skipTests: true, // As specified, testing mode true
        priority: s.priority, // Preserve priority from suggestion
      }));

      // Create each new feature using the features API
      if (api.features) {
        for (const feature of newFeatures) {
          await api.features.create(projectPath, feature);
        }
      }

      // Merge with existing features for store update
      const updatedFeatures = [...features, ...newFeatures];

      // Update store
      setFeatures(updatedFeatures);

      toast.success(`Imported ${newFeatures.length} features to backlog!`);

      // Clear suggestions after importing
      setSuggestions([]);
      setSelectedIds(new Set());
      setProgress([]);
      setCurrentSuggestionType(null);

      onClose();
    } catch (error) {
      console.error('Failed to import features:', error);
      toast.error('Failed to import features');
    } finally {
      setIsImporting(false);
    }
  }, [selectedIds, suggestions, features, setFeatures, setSuggestions, projectPath, onClose]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  // Go back to type selection
  const handleBackToSelection = useCallback(() => {
    setSuggestions([]);
    setSelectedIds(new Set());
    setProgress([]);
    setCurrentSuggestionType(null);
  }, [setSuggestions]);

  const hasStarted = isGenerating || progress.length > 0 || suggestions.length > 0;
  const hasSuggestions = suggestions.length > 0;
  const currentConfig = currentSuggestionType ? suggestionTypeConfig[currentSuggestionType] : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-[70vw] max-w-[70vw] max-h-[85vh] flex flex-col"
        data-testid="feature-suggestions-dialog"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {currentConfig ? (
              <>
                <currentConfig.icon className={`w-5 h-5 ${currentConfig.color}`} />
                {currentConfig.label}
              </>
            ) : (
              <>
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                AI Suggestions
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {currentConfig
              ? currentConfig.description
              : 'Analyze your project to discover improvements. Choose a suggestion type below.'}
          </DialogDescription>
        </DialogHeader>

        {!hasStarted ? (
          // Initial state - show suggestion type buttons
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground text-center max-w-lg mb-8">
              Our AI will analyze your project and generate actionable suggestions. Choose what type
              of analysis you want to perform:
            </p>
            <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
              {(
                Object.entries(suggestionTypeConfig) as [
                  SuggestionType,
                  (typeof suggestionTypeConfig)[SuggestionType],
                ][]
              ).map(([type, config]) => {
                const Icon = config.icon;
                return (
                  <Button
                    key={type}
                    variant="outline"
                    className="h-auto py-6 px-6 flex flex-col items-center gap-3 hover:border-primary/50 transition-colors"
                    onClick={() => handleGenerate(type)}
                    data-testid={`generate-${type}-btn`}
                  >
                    <Icon className={`w-8 h-8 ${config.color}`} />
                    <div className="text-center">
                      <div className="font-semibold">
                        {config.label.replace(' Suggestions', '')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{config.description}</div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
        ) : isGenerating ? (
          // Generating state - show progress
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing project...
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('parsed')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                      viewMode === 'parsed'
                        ? 'bg-primary/20 text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                    data-testid="view-mode-parsed"
                  >
                    <List className="w-3 h-3" />
                    Logs
                  </button>
                  <button
                    onClick={() => setViewMode('raw')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                      viewMode === 'raw'
                        ? 'bg-primary/20 text-primary shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                    data-testid="view-mode-raw"
                  >
                    <FileText className="w-3 h-3" />
                    Raw
                  </button>
                </div>
                <Button variant="destructive" size="sm" onClick={handleStop}>
                  <StopCircle className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </div>
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto bg-zinc-950 rounded-lg p-4 font-mono text-xs min-h-[200px] max-h-[400px]"
            >
              {progress.length === 0 ? (
                <div className="flex items-center justify-center min-h-[168px] text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Waiting for AI response...
                </div>
              ) : viewMode === 'parsed' ? (
                <LogViewer output={progress.join('')} />
              ) : (
                <div className="whitespace-pre-wrap break-words text-zinc-300">
                  {progress.join('')}
                </div>
              )}
            </div>
          </div>
        ) : hasSuggestions ? (
          // Results state - show suggestions list
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {suggestions.length} suggestions generated
                </span>
                <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                  {selectedIds.size === suggestions.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[400px] pr-2"
            >
              {suggestions.map((suggestion) => {
                const isSelected = selectedIds.has(suggestion.id);
                const isExpanded = expandedIds.has(suggestion.id);

                return (
                  <div
                    key={suggestion.id}
                    className={`border rounded-lg p-3 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    data-testid={`suggestion-${suggestion.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={suggestion.id}
                        checked={isSelected}
                        onCheckedChange={() => toggleSelection(suggestion.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() => toggleExpanded(suggestion.id)}
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                            #{suggestion.priority}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                            {suggestion.category}
                          </span>
                        </div>
                        <Label
                          htmlFor={suggestion.id}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {suggestion.description}
                        </Label>

                        {isExpanded && suggestion.reasoning && (
                          <div className="mt-3 text-sm">
                            <p className="text-muted-foreground italic">{suggestion.reasoning}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // No results state
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <p className="text-muted-foreground mb-4">
              No suggestions were generated. Try running the analysis again.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBackToSelection}>
                Back to Selection
              </Button>
              {currentSuggestionType && (
                <Button onClick={() => handleGenerate(currentSuggestionType)}>
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          {hasSuggestions && (
            <div className="flex gap-2 w-full justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBackToSelection}>
                  Back
                </Button>
                {currentSuggestionType && (
                  <Button variant="outline" onClick={() => handleGenerate(currentSuggestionType)}>
                    {currentConfig && <currentConfig.icon className="w-4 h-4 mr-2" />}
                    Regenerate
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <HotkeyButton
                  onClick={handleImport}
                  disabled={selectedIds.size === 0 || isImporting}
                  hotkey={{ key: 'Enter', cmdCtrl: true }}
                  hotkeyActive={open && hasSuggestions}
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Import {selectedIds.size} Feature
                  {selectedIds.size !== 1 ? 's' : ''}
                </HotkeyButton>
              </div>
            </div>
          )}
          {!hasSuggestions && !isGenerating && hasStarted && (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
