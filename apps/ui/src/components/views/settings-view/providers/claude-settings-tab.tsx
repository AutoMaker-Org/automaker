import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useCliStatus } from '../hooks/use-cli-status';
import { ClaudeCliStatus } from '../cli-status/claude-cli-status';
import { ClaudeMdSettings } from '../claude/claude-md-settings';
import { ClaudeUsageSection } from '../api-keys/claude-usage-section';
import { Info } from 'lucide-react';

export function ClaudeSettingsTab() {
  const { apiKeys, autoLoadClaudeMd, setAutoLoadClaudeMd } = useAppStore();
  const { claudeAuthStatus } = useSetupStore();

  // Use CLI status hook
  const { claudeCliStatus, isCheckingClaudeCli, handleRefreshClaudeCli } = useCliStatus();

  // Hide usage tracking when using API key (only show for Claude Code CLI users)
  // Also hide on Windows for now (CLI usage command not supported)
  const isWindows =
    typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('win');
  const showUsageTracking = !apiKeys.anthropic && !isWindows;

  return (
    <div className="space-y-6">
      {/* Usage Info */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-400/90">
          <span className="font-medium">Primary Provider</span>
          <p className="text-xs text-blue-400/70 mt-1">
            Claude is used throughout the app including chat, analysis, and agent tasks.
          </p>
        </div>
      </div>

      <ClaudeCliStatus
        status={claudeCliStatus}
        authStatus={claudeAuthStatus}
        isChecking={isCheckingClaudeCli}
        onRefresh={handleRefreshClaudeCli}
      />
      <ClaudeMdSettings
        autoLoadClaudeMd={autoLoadClaudeMd}
        onAutoLoadClaudeMdChange={setAutoLoadClaudeMd}
      />
      {showUsageTracking && <ClaudeUsageSection />}
    </div>
  );
}

export default ClaudeSettingsTab;
