/**
 * IdeationView - Main view for brainstorming and idea management
 * Dashboard-first design with Generate Ideas flow
 */

import { useCallback, useState } from 'react';
import { useIdeationStore } from '@/store/ideation-store';
import { useAppStore } from '@/store/app-store';
import { PromptCategoryGrid } from './components/prompt-category-grid';
import { PromptList } from './components/prompt-list';
import { IdeationDashboard } from './components/ideation-dashboard';
import { useGuidedPrompts } from '@/hooks/use-guided-prompts';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight, Lightbulb, CheckCheck, Loader2 } from 'lucide-react';
import type { IdeaCategory } from '@automaker/types';
import type { IdeationMode } from '@/store/ideation-store';

// Breadcrumb component - compact inline breadcrumbs
function IdeationBreadcrumbs({
  currentMode,
  selectedCategory,
  onNavigate,
}: {
  currentMode: IdeationMode;
  selectedCategory: IdeaCategory | null;
  onNavigate: (mode: IdeationMode, category?: IdeaCategory | null) => void;
}) {
  const { getCategoryById } = useGuidedPrompts();
  const categoryInfo = selectedCategory ? getCategoryById(selectedCategory) : null;

  // On dashboard, no breadcrumbs needed (it's the root)
  if (currentMode === 'dashboard') {
    return null;
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <button
        onClick={() => onNavigate('dashboard')}
        className="hover:text-foreground transition-colors"
      >
        Dashboard
      </button>
      <ChevronRight className="w-3 h-3" />
      {selectedCategory && categoryInfo ? (
        <>
          <button
            onClick={() => onNavigate('prompts', null)}
            className="hover:text-foreground transition-colors"
          >
            Generate Ideas
          </button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{categoryInfo.name}</span>
        </>
      ) : (
        <span className="text-foreground">Generate Ideas</span>
      )}
    </nav>
  );
}

// Header shown on all pages - matches other view headers
function IdeationHeader({
  currentMode,
  selectedCategory,
  onNavigate,
  onGenerateIdeas,
  onBack,
  acceptAllReady,
  acceptAllCount,
  onAcceptAll,
  isAcceptingAll,
}: {
  currentMode: IdeationMode;
  selectedCategory: IdeaCategory | null;
  onNavigate: (mode: IdeationMode, category?: IdeaCategory | null) => void;
  onGenerateIdeas: () => void;
  onBack: () => void;
  acceptAllReady: boolean;
  acceptAllCount: number;
  onAcceptAll: () => void;
  isAcceptingAll: boolean;
}) {
  const { getCategoryById } = useGuidedPrompts();
  const showBackButton = currentMode === 'prompts';

  // Get subtitle text based on current mode
  const getSubtitle = (): string => {
    if (currentMode === 'dashboard') {
      return 'Review and accept generated ideas';
    }
    if (currentMode === 'prompts') {
      if (selectedCategory) {
        const categoryInfo = getCategoryById(selectedCategory);
        return `Select a prompt from ${categoryInfo?.name || 'category'}`;
      }
      return 'Select a category to generate ideas';
    }
    return '';
  };

  const subtitle = getSubtitle();

  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
      <div className="flex items-center gap-3">
        {showBackButton && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div>
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Ideation</h1>
          </div>
          {currentMode === 'dashboard' ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : (
            <IdeationBreadcrumbs
              currentMode={currentMode}
              selectedCategory={selectedCategory}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </div>

      <div className="flex gap-2 items-center">
        {currentMode === 'dashboard' && acceptAllReady && (
          <Button
            onClick={onAcceptAll}
            variant="outline"
            className="gap-2"
            disabled={isAcceptingAll}
          >
            {isAcceptingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCheck className="w-4 h-4" />
            )}
            Accept All ({acceptAllCount})
          </Button>
        )}
        <Button onClick={onGenerateIdeas} className="gap-2">
          <Lightbulb className="w-4 h-4" />
          Generate Ideas
        </Button>
      </div>
    </div>
  );
}

export function IdeationView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const { currentMode, selectedCategory, setMode, setCategory } = useIdeationStore();

  // Accept all state
  const [acceptAllReady, setAcceptAllReady] = useState(false);
  const [acceptAllCount, setAcceptAllCount] = useState(0);
  const [acceptAllHandler, setAcceptAllHandler] = useState<(() => Promise<void>) | null>(null);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);

  const handleAcceptAllReady = useCallback(
    (isReady: boolean, count: number, handler: () => Promise<void>) => {
      setAcceptAllReady(isReady);
      setAcceptAllCount(count);
      setAcceptAllHandler(() => handler);
    },
    []
  );

  const handleAcceptAll = useCallback(async () => {
    if (acceptAllHandler) {
      setIsAcceptingAll(true);
      try {
        await acceptAllHandler();
      } finally {
        setIsAcceptingAll(false);
      }
    }
  }, [acceptAllHandler]);

  const handleNavigate = useCallback(
    (mode: IdeationMode, category?: IdeaCategory | null) => {
      setMode(mode);
      if (category !== undefined) {
        setCategory(category);
      } else if (mode !== 'prompts') {
        setCategory(null);
      }
    },
    [setMode, setCategory]
  );

  const handleSelectCategory = useCallback(
    (category: IdeaCategory) => {
      setCategory(category);
    },
    [setCategory]
  );

  const handleBackFromPrompts = useCallback(() => {
    // If viewing a category, go back to category grid
    if (selectedCategory) {
      setCategory(null);
      return;
    }
    // Otherwise, go back to dashboard
    setMode('dashboard');
  }, [selectedCategory, setCategory, setMode]);

  const handleGenerateIdeas = useCallback(() => {
    setMode('prompts');
    setCategory(null);
  }, [setMode, setCategory]);

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center content-bg"
        data-testid="ideation-view"
      >
        <div className="text-center text-muted-foreground">
          <p>Open a project to start brainstorming ideas</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col content-bg min-h-0 overflow-hidden"
      data-testid="ideation-view"
    >
      {/* Header with breadcrumbs - always shown */}
      <IdeationHeader
        currentMode={currentMode}
        selectedCategory={selectedCategory}
        onNavigate={handleNavigate}
        onGenerateIdeas={handleGenerateIdeas}
        onBack={handleBackFromPrompts}
        acceptAllReady={acceptAllReady}
        acceptAllCount={acceptAllCount}
        onAcceptAll={handleAcceptAll}
        isAcceptingAll={isAcceptingAll}
      />

      {/* Dashboard - main view */}
      {currentMode === 'dashboard' && (
        <IdeationDashboard
          onGenerateIdeas={handleGenerateIdeas}
          onAcceptAllReady={handleAcceptAllReady}
        />
      )}

      {/* Prompts - category selection */}
      {currentMode === 'prompts' && !selectedCategory && (
        <PromptCategoryGrid onSelect={handleSelectCategory} onBack={handleBackFromPrompts} />
      )}

      {/* Prompts - prompt selection within category */}
      {currentMode === 'prompts' && selectedCategory && (
        <PromptList category={selectedCategory} onBack={handleBackFromPrompts} />
      )}
    </div>
  );
}
