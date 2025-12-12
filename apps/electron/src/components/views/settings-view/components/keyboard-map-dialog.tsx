import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyboardMap, ShortcutReferencePanel } from "@/components/ui/keyboard-map";

interface KeyboardMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardMapDialog({ open, onOpenChange }: KeyboardMapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-brand-500" />
            Keyboard Shortcut Map
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Visual overview of all keyboard shortcuts. Keys in color are bound to
            shortcuts. Click on any shortcut below to edit it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pl-3 pr-6 pb-6">
          {/* Visual Keyboard Map */}
          <KeyboardMap />

          {/* Shortcut Reference - Editable */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              All Shortcuts Reference (Click to Edit)
            </h3>
            <ShortcutReferencePanel editable />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
