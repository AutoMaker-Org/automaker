import { useAppStore } from '@/store/app-store';
import type { ModelProvider } from '@automaker/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { EyeOff, Eye } from 'lucide-react';

interface ProviderToggleProps {
  provider: ModelProvider;
  providerLabel: string;
}

export function ProviderToggle({ provider, providerLabel }: ProviderToggleProps) {
  const { disabledProviders, toggleProviderDisabled } = useAppStore();
  const isDisabled = disabledProviders.includes(provider);

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-accent/20 border border-border/30">
      <div className="flex items-center gap-3">
        {isDisabled ? (
          <EyeOff className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Eye className="w-4 h-4 text-primary" />
        )}
        <div>
          <Label className="text-sm font-medium">Show {providerLabel} in model dropdowns</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isDisabled
              ? `${providerLabel} models are hidden from all model selectors`
              : `${providerLabel} models appear in model selection dropdowns`}
          </p>
        </div>
      </div>
      <Switch
        checked={!isDisabled}
        onCheckedChange={(checked) => toggleProviderDisabled(provider, !checked)}
      />
    </div>
  );
}

export default ProviderToggle;
