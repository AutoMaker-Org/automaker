import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { ALL_MODELS } from '@/components/views/board-view/shared/model-constants';

export function AIEnhancementSection() {
  const { enhancementModel, setEnhancementModel } = useAppStore();

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Sparkles className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">AI Enhancement</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Choose the model used when enhancing feature descriptions.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="space-y-4">
          <Label className="text-foreground font-medium">Enhancement Model</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ALL_MODELS.map(({ id, label, description, badge }) => {
              const isActive = enhancementModel === id;
              return (
                <button
                  key={id}
                  onClick={() => setEnhancementModel(id)}
                  className={cn(
                    'group flex flex-col items-start gap-2 px-4 py-4 rounded-xl text-left',
                    'transition-all duration-200 ease-out',
                    isActive
                      ? [
                          'bg-gradient-to-br from-brand-500/15 to-brand-600/10',
                          'border-2 border-brand-500/40',
                          'text-foreground',
                          'shadow-md shadow-brand-500/10',
                        ]
                      : [
                          'bg-accent/30 hover:bg-accent/50',
                          'border border-border/50 hover:border-border',
                          'text-muted-foreground hover:text-foreground',
                          'hover:shadow-sm',
                        ],
                    'hover:scale-[1.02] active:scale-[0.98]'
                  )}
                  data-testid={`enhancement-model-${id}`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span
                      className={cn(
                        'font-medium text-sm',
                        isActive ? 'text-foreground' : 'group-hover:text-foreground'
                      )}
                    >
                      {label}
                    </span>
                    {badge && (
                      <span
                        className={cn(
                          'ml-auto text-xs px-2 py-0.5 rounded-full',
                          isActive
                            ? 'bg-brand-500/20 text-brand-500'
                            : 'bg-accent text-muted-foreground'
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/80">{description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
