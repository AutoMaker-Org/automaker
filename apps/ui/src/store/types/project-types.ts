import type {
  Feature as BaseFeature,
  FeatureImagePath,
  FeatureTextFilePath,
  ThinkingLevel,
  ReasoningEffort,
  FeatureStatusWithPipeline,
  PlanSpec,
} from '@automaker/types';
import type { FeatureImage } from './chat-types';

// Available models for feature execution
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

export interface Feature extends Omit<
  BaseFeature,
  | 'steps'
  | 'imagePaths'
  | 'textFilePaths'
  | 'status'
  | 'planSpec'
  | 'dependencies'
  | 'model'
  | 'branchName'
  | 'thinkingLevel'
  | 'reasoningEffort'
  | 'summary'
> {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  steps: string[]; // Required in UI (not optional)
  status: FeatureStatusWithPipeline;
  images?: FeatureImage[]; // UI-specific base64 images
  imagePaths?: FeatureImagePath[]; // Stricter type than base (no string | union)
  textFilePaths?: FeatureTextFilePath[]; // Text file attachments for context
  justFinishedAt?: string; // UI-specific: ISO timestamp when agent just finished
  prUrl?: string; // UI-specific: Pull request URL
  planSpec?: PlanSpec; // Explicit planSpec type to override BaseFeature's index signature
  dependencies?: string[]; // Explicit type to override BaseFeature's index signature
  model?: string; // Explicit type to override BaseFeature's index signature
  branchName?: string; // Explicit type to override BaseFeature's index signature
  thinkingLevel?: ThinkingLevel; // Explicit type to override BaseFeature's index signature
  reasoningEffort?: ReasoningEffort; // Explicit type to override BaseFeature's index signature
  providerId?: string; // Explicit type to override BaseFeature's index signature
  summary?: string; // Explicit type to override BaseFeature's index signature
}

// File tree node for project analysis
export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  extension?: string;
  children?: FileTreeNode[];
}

// Project analysis result
export interface ProjectAnalysis {
  fileTree: FileTreeNode[];
  totalFiles: number;
  totalDirectories: number;
  filesByExtension: Record<string, number>;
  analyzedAt: string;
}
