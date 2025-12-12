import { cn } from "@/lib/utils";
import type { Project } from "@/lib/electron";
import type { NavigationItem } from "../config/navigation";

interface SettingsNavigationProps {
  navItems: NavigationItem[];
  activeSection: string;
  currentProject: Project | null;
  onNavigate: (sectionId: string) => void;
}

export function SettingsNavigation({
  navItems,
  activeSection,
  currentProject,
  onNavigate,
}: SettingsNavigationProps) {
  return (
    <nav className="hidden lg:block w-48 shrink-0 border-r border-border bg-card/50 backdrop-blur-sm">
      <div className="sticky top-0 p-4 space-y-1">
        {navItems
          .filter((item) => item.id !== "danger" || currentProject)
          .map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left",
                  isActive
                    ? "bg-brand-500/10 text-brand-500 border border-brand-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0",
                    isActive ? "text-brand-500" : ""
                  )}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
      </div>
    </nav>
  );
}
