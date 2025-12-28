import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Users, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AncestorContext } from '@automaker/dependency-resolver';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ParentFeatureContext {
  id: string;
  title?: string;
  description: string;
  spec?: string;
  summary?: string;
}

interface AncestorContextSectionProps {
  parentFeature: ParentFeatureContext;
  ancestors: AncestorContext[];
  selectedAncestorIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

export function AncestorContextSection({
  parentFeature,
  ancestors,
  selectedAncestorIds,
  onSelectionChange,
}: AncestorContextSectionProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const toggleSelected = (id: string) => {
    const newSelected = new Set(selectedAncestorIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    onSelectionChange(newSelected);
  };

  const selectAll = () => {
    const allIds = new Set([parentFeature.id, ...ancestors.map((a) => a.id)]);
    onSelectionChange(allIds);
  };

  const selectNone = () => {
    onSelectionChange(new Set());
  };

  // Combine parent and ancestors into a single list
  const allAncestorItems: Array<
    (AncestorContext | ParentFeatureContext) & { isParent: boolean; depth: number }
  > = [
    { ...parentFeature, depth: -1, isParent: true },
    ...ancestors.map((a) => ({ ...a, isParent: false })),
  ];

  const totalCount = allAncestorItems.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Ancestor Context</Label>
          <span className="text-xs text-muted-foreground">
            ({selectedAncestorIds.size}/{totalCount} selected)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectAll}
            className="h-6 px-2 text-xs"
          >
            All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectNone}
            className="h-6 px-2 text-xs"
          >
            None
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The parent task context will be included to help the AI understand the background.
        Additional ancestors can optionally be included for more context.
      </p>

      <div className="space-y-1 max-h-[200px] overflow-y-auto border rounded-lg p-2 bg-muted/20">
        {allAncestorItems.map((item) => {
          const isSelected = selectedAncestorIds.has(item.id);
          const isExpanded = expandedIds.has(item.id);
          const hasContent =
            item.description ||
            ('spec' in item && item.spec) ||
            ('summary' in item && item.summary);
          const displayTitle =
            item.title ||
            item.description.slice(0, 50) + (item.description.length > 50 ? '...' : '');

          return (
            <Collapsible key={item.id} open={isExpanded}>
              <div
                className={cn(
                  'flex items-start gap-2 p-2 rounded-md transition-colors',
                  item.isParent
                    ? isSelected
                      ? 'bg-[var(--status-success-bg)] border border-[var(--status-success)]/30'
                      : 'bg-muted/30 border border-border hover:bg-muted/50'
                    : isSelected
                      ? 'bg-primary/10'
                      : 'hover:bg-muted/50'
                )}
                style={{ marginLeft: item.isParent ? 0 : `${item.depth * 12}px` }}
              >
                <Checkbox
                  id={`ancestor-${item.id}`}
                  checked={isSelected}
                  onCheckedChange={() => toggleSelected(item.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    {hasContent && (
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => toggleExpanded(item.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    )}
                    <label
                      htmlFor={`ancestor-${item.id}`}
                      className="text-sm font-medium cursor-pointer truncate flex-1"
                    >
                      {displayTitle}
                    </label>
                    {item.isParent && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--status-success)] font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Completed Parent
                      </span>
                    )}
                  </div>

                  <CollapsibleContent>
                    <div className="mt-2 space-y-2 text-xs text-muted-foreground pl-5">
                      {item.description && (
                        <div>
                          <span className="font-medium text-foreground">Description:</span>
                          <p className="mt-0.5 line-clamp-3">{item.description}</p>
                        </div>
                      )}
                      {'spec' in item && item.spec && (
                        <div>
                          <span className="font-medium text-foreground">Specification:</span>
                          <p className="mt-0.5 line-clamp-3">{item.spec}</p>
                        </div>
                      )}
                      {'summary' in item && item.summary && (
                        <div>
                          <span className="font-medium text-foreground">Summary:</span>
                          <p className="mt-0.5 line-clamp-3">{item.summary}</p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </div>
            </Collapsible>
          );
        })}

        {ancestors.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Parent task has no additional ancestors
          </p>
        )}
      </div>
    </div>
  );
}
