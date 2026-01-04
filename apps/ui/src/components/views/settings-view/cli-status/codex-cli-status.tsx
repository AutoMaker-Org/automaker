import type { CliStatus } from '../shared/types';
import { CliStatusCard } from './cli-status-card';
import { OpenAIIcon } from '@/components/ui/provider-icon';

interface CliStatusProps {
  status: CliStatus | null;
  isChecking: boolean;
  onRefresh: () => void;
}

export function CodexCliStatus({ status, isChecking, onRefresh }: CliStatusProps) {
  return (
    <CliStatusCard
      title="Codex CLI"
      description="Codex CLI powers OpenAI models for coding and automation workflows."
      status={status}
      isChecking={isChecking}
      onRefresh={onRefresh}
      refreshTestId="refresh-codex-cli"
      icon={OpenAIIcon}
      fallbackRecommendation="Install Codex CLI to unlock OpenAI models with tool support."
    />
  );
}
