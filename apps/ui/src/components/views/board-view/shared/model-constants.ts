import type { AgentModel, ThinkingLevel } from "@/store/app-store";
import {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
} from "lucide-react";

export type ModelOption = {
  id: AgentModel;
  label: string;
  description: string;
  badge?: string;
  provider: "claude";
};

export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: "haiku",
    label: "Claude Haiku",
    description: "Fast and efficient for simple tasks.",
    badge: "Speed",
    provider: "claude",
  },
  {
    id: "sonnet",
    label: "Claude Sonnet",
    description: "Balanced performance with strong reasoning.",
    badge: "Balanced",
    provider: "claude",
  },
  {
    id: "opus",
    label: "Claude Opus",
    description: "Most capable model for complex work.",
    badge: "Premium",
    provider: "claude",
  },
];

export const THINKING_LEVELS: ThinkingLevel[] = [
  "none",
  "low",
  "medium",
  "high",
  "ultrathink",
];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: "None",
  low: "Low",
  medium: "Med",
  high: "High",
  ultrathink: "Ultra",
};

// Profile icon mapping
export const PROFILE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
};
