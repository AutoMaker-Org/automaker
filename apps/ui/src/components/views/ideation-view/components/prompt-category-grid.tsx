/**
 * PromptCategoryGrid - Grid of prompt categories to select from
 */

import {
  ArrowLeft,
  Zap,
  Palette,
  Code,
  TrendingUp,
  Cpu,
  Shield,
  Gauge,
  Accessibility,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useGuidedPrompts } from '@/hooks/use-guided-prompts';
import type { IdeaCategory } from '@automaker/types';

interface PromptCategoryGridProps {
  onSelect: (category: IdeaCategory) => void;
  onBack: () => void;
}

const iconMap: Record<string, typeof Zap> = {
  Zap,
  Palette,
  Code,
  TrendingUp,
  Cpu,
  Shield,
  Gauge,
  Accessibility,
  BarChart3,
};

export function PromptCategoryGrid({ onSelect, onBack }: PromptCategoryGridProps) {
  const { categories, isLoading, error } = useGuidedPrompts();

  return (
    <div className="flex-1 flex flex-col p-6 overflow-auto">
      <div className="max-w-4xl w-full mx-auto space-y-4">
        {/* Back link */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading categories...</span>
          </div>
        )}
        {error && (
          <div className="text-center py-12 text-destructive">
            <p>Failed to load categories: {error}</p>
          </div>
        )}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => {
              const Icon = iconMap[category.icon] || Zap;
              return (
                <Card
                  key={category.id}
                  className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
                  onClick={() => onSelect(category.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="p-4 rounded-full bg-primary/10">
                        <Icon className="w-8 h-8 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{category.name}</h3>
                        <p className="text-muted-foreground text-sm mt-1">{category.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
