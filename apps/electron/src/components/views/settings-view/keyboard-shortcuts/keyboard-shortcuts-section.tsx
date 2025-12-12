import { Button } from "@/components/ui/button";
import { Settings2, Keyboard } from "lucide-react";

interface KeyboardShortcutsSectionProps {
  onOpenKeyboardMap: () => void;
}

export function KeyboardShortcutsSection({
  onOpenKeyboardMap,
}: KeyboardShortcutsSectionProps) {
  return (
    <div
      id="keyboard"
      className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-5 h-5 text-brand-500" />
          <h2 className="text-lg font-semibold text-foreground">
            Keyboard Shortcuts
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Customize keyboard shortcuts for navigation and actions using the
          visual keyboard map.
        </p>
      </div>
      <div className="p-6">
        {/* Centered message directing to keyboard map */}
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="relative">
            <Keyboard className="w-16 h-16 text-brand-500/30" />
            <div className="absolute inset-0 bg-brand-500/10 blur-xl rounded-full" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-lg font-semibold text-foreground">
              Use the Visual Keyboard Map
            </h3>
            <p className="text-sm text-muted-foreground">
              Click the &quot;View Keyboard Map&quot; button above to customize
              your keyboard shortcuts. The visual interface shows all available
              keys and lets you easily edit shortcuts with single-modifier
              restrictions.
            </p>
          </div>
          <Button
            variant="default"
            size="lg"
            onClick={onOpenKeyboardMap}
            className="gap-2 mt-4"
          >
            <Keyboard className="w-5 h-5" />
            Open Keyboard Map
          </Button>
        </div>
      </div>
    </div>
  );
}
