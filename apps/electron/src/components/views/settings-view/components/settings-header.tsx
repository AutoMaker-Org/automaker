import { Settings } from "lucide-react";

interface SettingsHeaderProps {
  title?: string;
  description?: string;
}

export function SettingsHeader({
  title = "Settings",
  description = "Configure your API keys and preferences",
}: SettingsHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border bg-glass backdrop-blur-md">
      <div className="px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
