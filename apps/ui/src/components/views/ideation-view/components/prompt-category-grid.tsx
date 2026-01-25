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
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
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
            <Spinner size="lg" />
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
                  className="group cursor-pointer transition-all duration-300 hover:border-primary hover:shadow-lg hover:-translate-y-1"
                  onClick={() => onSelect(category.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center gap-4">
                      <div className="p-4 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                        <Icon className="w-8 h-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
                          {category.name}
                        </h3>
                        <p className="text-muted-foreground text-sm">{category.description}</p>
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
