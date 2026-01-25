import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquareText, RotateCcw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PromptCustomization, CustomPrompt } from '@automaker/types';
import { TAB_CONFIGS } from './tab-configs';
import { Banner, PromptFieldList } from './components';

interface PromptCustomizationSectionProps {
  promptCustomization?: PromptCustomization;
  onPromptCustomizationChange: (customization: PromptCustomization) => void;
}

/**
 * PromptCustomizationSection Component
 *
 * Allows users to customize AI prompts for different parts of the application:
 * - Auto Mode (feature implementation)
 * - Agent Runner (interactive chat)
 * - Backlog Plan (Kanban planning)
 * - Enhancement (feature description improvement)
 * - And many more...
 */
export function PromptCustomizationSection({
  promptCustomization = {},
  onPromptCustomizationChange,
}: PromptCustomizationSectionProps) {
  const [activeTab, setActiveTab] = useState('auto-mode');

  const updatePrompt = (
    category: keyof PromptCustomization,
    field: string,
    value: CustomPrompt | undefined
  ) => {
    const updated = {
      ...promptCustomization,
      [category]: {
        ...promptCustomization[category],
        [field]: value,
      },
    };
    onPromptCustomizationChange(updated);
  };

  const resetToDefaults = (category: keyof PromptCustomization) => {
    const updated = {
      ...promptCustomization,
      [category]: {},
    };
    onPromptCustomizationChange(updated);
  };

  const resetAllToDefaults = () => {
    onPromptCustomizationChange({});
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
      data-testid="prompt-customization-section"
    >
      {/* Header */}
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <MessageSquareText className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Prompt Customization
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={resetAllToDefaults} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset All to Defaults
          </Button>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Customize AI prompts for Auto Mode, Agent Runner, and other features.
        </p>
      </div>

      {/* Info Banner */}
      <div className="px-6 pt-6">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm text-foreground font-medium">How to Customize Prompts</p>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              Toggle the switch to enable custom mode and edit the prompt. When disabled, the
              default built-in prompt is used. You can use the default as a starting point by
              enabling the toggle.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 gap-1 h-auto w-full bg-transparent p-0">
            {TAB_CONFIGS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_CONFIGS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="space-y-6 mt-6">
              {/* Tab Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-foreground">{tab.title}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetToDefaults(tab.category)}
                  className="gap-2"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Section
                </Button>
              </div>

              {/* Tab Banner */}
              {tab.banner && <Banner config={tab.banner} />}

              {/* Main Fields */}
              {tab.fields.length > 0 && (
                <div className="space-y-4">
                  <PromptFieldList
                    fields={tab.fields}
                    category={tab.category}
                    promptCustomization={promptCustomization}
                    updatePrompt={updatePrompt}
                  />
                </div>
              )}

              {/* Sections (for tabs like Auto Mode with grouped fields) */}
              {tab.sections?.map((section, idx) => (
                <div key={idx} className="pt-4 border-t border-border/50">
                  {section.title && (
                    <h4 className="text-sm font-medium text-muted-foreground mb-4">
                      {section.title}
                    </h4>
                  )}
                  {section.banner && (
                    <div className="mb-4">
                      <Banner config={section.banner} />
                    </div>
                  )}
                  <div className="space-y-4">
                    <PromptFieldList
                      fields={section.fields}
                      category={tab.category}
                      promptCustomization={promptCustomization}
                      updatePrompt={updatePrompt}
                    />
                  </div>
                </div>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
