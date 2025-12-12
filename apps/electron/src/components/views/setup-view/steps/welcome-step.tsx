import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, ArrowRight } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="flex items-center justify-center mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Automaker Logo" className="w-24 h-24" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-foreground mb-3">
          Welcome to Automaker
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Let&apos;s set up your development environment. We&apos;ll check for
          required CLI tools and help you configure them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card className="bg-card/50 border-border hover:border-brand-500/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="w-5 h-5 text-brand-500" />
              Claude CLI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Anthropic&apos;s powerful AI assistant for code generation and
              analysis
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border hover:border-brand-500/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="w-5 h-5 text-green-500" />
              Codex CLI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              OpenAI&apos;s GPT-5.1 Codex for advanced code generation tasks
            </p>
          </CardContent>
        </Card>
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
