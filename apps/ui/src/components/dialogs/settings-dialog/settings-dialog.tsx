import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SettingsContent } from '@/components/views/settings-view/settings-content';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
        data-testid="settings-dialog"
      >
        {/* Header */}
        <DialogHeader
          className={cn(
            'shrink-0 px-6 py-4',
            'border-b border-border/50',
            'bg-gradient-to-r from-card/90 via-card/70 to-card/80'
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                'bg-gradient-to-br from-brand-500 to-brand-600',
                'shadow-lg shadow-brand-500/25',
                'ring-1 ring-white/10'
              )}
            >
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Settings</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground/80 mt-0.5">
                Configure your API keys and preferences
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <SettingsContent compact />
        </div>
      </DialogContent>
    </Dialog>
  );
}
