import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="flex items-center justify-center mx-auto">
        <img src="/logo.png" alt="DevFlow Logo" className="w-24 h-24" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-foreground mb-3">Welcome to DevFlow</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          To get started, we&apos;ll need to verify either claude code cli is installed or you have
          Anthropic api keys
        </p>
      </div>

      <Button
        size="lg"
        className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white"
        onClick={onNext}
        data-testid="setup-start-button"
      >
        Get Started
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
