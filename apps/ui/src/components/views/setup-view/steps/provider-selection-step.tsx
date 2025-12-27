import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Terminal, Key, ArrowRight, ArrowLeft } from 'lucide-react';
import { useSetupStore, SelectedProvider } from '@/store/setup-store';

interface ProviderSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// Provider options displayed to users
const PROVIDER_OPTIONS = [
  {
    id: 'claude' as SelectedProvider,
    name: 'Claude (Anthropic)',
    description: 'Industry-leading AI with strong reasoning and code generation capabilities.',
    features: [
      'CLI support with authentication',
      'Multiple models: Haiku (speed), Sonnet (balanced), Opus (premium)',
      'Extended thinking for complex tasks',
      'Vision support',
    ],
    icon: Terminal,
    color: 'from-orange-500/20 to-orange-600/10',
    borderColor: 'border-orange-500/30',
    textColor: 'text-orange-500',
  },
  {
    id: 'zai' as SelectedProvider,
    name: 'Z.ai (GLM)',
    description: 'Powerful Chinese AI models with excellent multilingual capabilities.',
    features: [
      'Flagship GLM-4.7 model',
      'Multiple models: GLM-4.7, GLM-4.6v (vision), GLM-4.6, GLM-4.5-Air',
      'Extended thinking mode',
      'Cost-effective alternative',
    ],
    icon: Key,
    color: 'from-blue-500/20 to-blue-600/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-500',
  },
];

export function ProviderSelectionStep({ onNext, onBack, onSkip }: ProviderSelectionStepProps) {
  const { selectedProvider, setSelectedProvider } = useSetupStore();
  const [hoveredProvider, setHoveredProvider] = useState<SelectedProvider | null>(null);

  const handleProviderSelect = (providerId: SelectedProvider) => {
    setSelectedProvider(providerId);
    // Auto-advance to next step after a brief delay
    setTimeout(() => {
      onNext();
    }, 300);
  };

  const isReady = selectedProvider !== null;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
          <Key className="w-8 h-8 text-purple-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Choose Your AI Provider</h2>
        <p className="text-muted-foreground">
          Select the AI provider you want to use for code generation
        </p>
      </div>

      {/* Provider Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDER_OPTIONS.map((provider) => {
          const Icon = provider.icon;
          const isSelected = selectedProvider === provider.id;
          const isHovered = hoveredProvider === provider.id;

          return (
            <Card
              key={provider.id}
              className={cn(
                'cursor-pointer transition-all duration-200',
                'hover:shadow-lg hover:scale-[1.02]',
                provider.borderColor,
                isSelected
                  ? 'ring-2 ring-brand-500 shadow-md'
                  : 'border-border/50 hover:border-border'
              )}
              onClick={() => handleProviderSelect(provider.id)}
              onMouseEnter={() => setHoveredProvider(provider.id)}
              onMouseLeave={() => setHoveredProvider(null)}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                      'bg-gradient-to-br',
                      provider.color
                    )}
                  >
                    <Icon className={cn('w-6 h-6', provider.textColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-foreground">{provider.name}</h3>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-brand-500 shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{provider.description}</p>
                    <ul className="space-y-1">
                      {provider.features.map((feature, index) => (
                        <li
                          key={index}
                          className="text-xs text-muted-foreground flex items-center gap-2"
                        >
                          <span className="w-1 h-1 rounded-full bg-brand-500 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="p-4 rounded-lg bg-muted/30 border border-border">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> You can add additional providers later
          from the Settings view. Both providers can be enabled simultaneously for different use
          cases.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            Skip for now
          </Button>
          <Button
            onClick={onNext}
            disabled={!isReady}
            className="bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="provider-next-button"
          >
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | null | boolean)[]) {
  return classes.filter(Boolean).join(' ');
}
