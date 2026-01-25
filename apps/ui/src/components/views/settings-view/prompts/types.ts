import type { LucideIcon } from 'lucide-react';
import type { PromptCustomization, CustomPrompt } from '@automaker/types';

/** Props for the PromptField component */
export interface PromptFieldProps {
  label: string;
  description: string;
  defaultValue: string;
  customValue?: CustomPrompt;
  onCustomValueChange: (value: CustomPrompt | undefined) => void;
  critical?: boolean;
}

/** Configuration for a single prompt field */
export interface PromptFieldConfig {
  key: string;
  label: string;
  description: string;
  defaultValue: string;
  critical?: boolean;
}

/** Banner type for tabs */
export type BannerType = 'info' | 'warning';

/** Configuration for info/warning banners */
export interface BannerConfig {
  type: BannerType;
  title: string;
  description: string;
}

/** Configuration for a section within a tab */
export interface TabSectionConfig {
  title?: string;
  banner?: BannerConfig;
  fields: PromptFieldConfig[];
}

/** Configuration for a tab with prompt fields */
export interface TabConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  category: keyof PromptCustomization;
  banner?: BannerConfig;
  fields: PromptFieldConfig[];
  /** For tabs with grouped sections (like Auto Mode) */
  sections?: TabSectionConfig[];
}
