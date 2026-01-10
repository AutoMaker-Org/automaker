import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Button } from '@/components/ui/button';
import { Plus, Wand2 } from 'lucide-react';
import { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import { UsagePopover } from '@/components/usage-popover';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';

interface BoardHeaderProps {
  onAddFeature: () => void;
  onOpenPlanDialog: () => void;
  addFeatureShortcut: KeyboardShortcut;
  isMounted: boolean;
}

export function BoardHeader({
  onAddFeature,
  onOpenPlanDialog,
  addFeatureShortcut,
  isMounted,
}: BoardHeaderProps) {
  const apiKeys = useAppStore((state) => state.apiKeys);
  const claudeAuthStatus = useSetupStore((state) => state.claudeAuthStatus);
  const codexAuthStatus = useSetupStore((state) => state.codexAuthStatus);

  // Claude usage tracking visibility logic
  // Hide when using API key (only show for Claude Code CLI users)
  // Also hide on Windows for now (CLI usage command not supported)
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const hasClaudeApiKey = !!apiKeys.anthropic || !!claudeAuthStatus?.hasEnvApiKey;
  const isClaudeCliVerified =
    claudeAuthStatus?.authenticated && claudeAuthStatus?.method === 'cli_authenticated';
  const showClaudeUsage = !hasClaudeApiKey && !isWindows && isClaudeCliVerified;

  // Codex usage tracking visibility logic
  // Show if Codex is authenticated (CLI or API key)
  const showCodexUsage = !!codexAuthStatus?.authenticated;

  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-glass backdrop-blur-md">
      {/* Usage Popover - show if either provider is authenticated */}
      {isMounted && (showClaudeUsage || showCodexUsage) && <UsagePopover />}

      <Button
        size="sm"
        variant="outline"
        onClick={onOpenPlanDialog}
        data-testid="plan-backlog-button"
      >
        <Wand2 className="w-4 h-4 mr-2" />
        Plan
      </Button>

      <HotkeyButton
        size="sm"
        onClick={onAddFeature}
        hotkey={addFeatureShortcut}
        hotkeyActive={false}
        data-testid="add-feature-button"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Feature
      </HotkeyButton>
    </div>
  );
}
