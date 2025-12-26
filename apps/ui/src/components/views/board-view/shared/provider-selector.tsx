import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ModelProvider } from '@automaker/types';
import { PROVIDERS, type ProviderConfig } from './provider-constants';

interface ProviderSelectorProps {
  selectedProvider: ModelProvider;
  onProviderSelect: (provider: ModelProvider) => void;
  availableProviders?: ProviderConfig[];
  testIdPrefix?: string;
}

export function ProviderSelector({
  selectedProvider,
  onProviderSelect,
  availableProviders = PROVIDERS,
  testIdPrefix = 'provider-select',
}: ProviderSelectorProps) {
  const selectedProviderConfig = availableProviders.find((p) => p.id === selectedProvider);

  return (
    <div className="space-y-2">
      <Label>Provider</Label>
      <Select value={selectedProvider} onValueChange={onProviderSelect}>
        <SelectTrigger data-testid={testIdPrefix}>
          <SelectValue>{selectedProviderConfig?.name || 'Select a provider'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {availableProviders.map((provider) => (
            <SelectItem
              key={provider.id}
              value={provider.id}
              data-testid={`${testIdPrefix}-option-${provider.id}`}
            >
              <span className="flex items-center gap-2">
                {provider.name}
                <span className="text-[11px] text-muted-foreground">{provider.badge}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
