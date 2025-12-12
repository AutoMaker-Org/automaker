import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Palette } from "lucide-react";
import { themeOptions } from "@/config/theme-options";
import type { Theme, Project } from "../shared/types";

interface AppearanceSectionProps {
  effectiveTheme: Theme;
  currentProject: Project | null;
  onThemeChange: (theme: Theme) => void;
}

export function AppearanceSection({
  effectiveTheme,
  currentProject,
  onThemeChange,
}: AppearanceSectionProps) {
  return (
    <div
      id="appearance"
      className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-5 h-5 text-brand-500" />
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Customize the look and feel of your application.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="space-y-3">
          <Label className="text-foreground">
            Theme{" "}
            {currentProject ? `(for ${currentProject.name})` : "(Global)"}
          </Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {themeOptions.map(({ value, label, Icon, testId }) => {
              const isActive = effectiveTheme === value;
              return (
                <Button
                  key={value}
                  variant={isActive ? "secondary" : "outline"}
                  onClick={() => onThemeChange(value)}
                  className={`flex items-center justify-center gap-2 px-3 py-3 h-auto ${
                    isActive ? "border-brand-500 ring-1 ring-brand-500/50" : ""
                  }`}
                  data-testid={testId}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium text-sm">{label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
