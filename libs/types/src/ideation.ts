/**
 * Ideation types for AutoMaker brainstorming and idea management
 */

// ============================================================================
// Core Types
// ============================================================================

export type IdeaCategory =
  | 'feature'
  | 'ux-ui'
  | 'dx'
  | 'growth'
  | 'technical'
  | 'security'
  | 'performance'
  | 'accessibility'
  | 'analytics';
export type IdeaStatus = 'raw' | 'refined' | 'ready' | 'archived';
export type ImpactLevel = 'low' | 'medium' | 'high';
export type EffortLevel = 'low' | 'medium' | 'high';

// ============================================================================
// Idea Entity
// ============================================================================

export interface IdeaAttachment {
  id: string;
  type: 'image' | 'link' | 'reference';
  path?: string;
  url?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Idea {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  status: IdeaStatus;
  impact: ImpactLevel;
  effort: EffortLevel;

  // Conversation context
  conversationId?: string;
  sourcePromptId?: string;

  // Content
  attachments?: IdeaAttachment[];
  userStories?: string[];
  notes?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;

  // Extensibility
  [key: string]: unknown;
}

// ============================================================================
// Ideation Session
// ============================================================================

export type IdeationSessionStatus = 'active' | 'completed' | 'abandoned';

export interface IdeationSession {
  id: string;
  projectPath: string;
  promptCategory?: IdeaCategory;
  promptId?: string;
  status: IdeationSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IdeationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  savedAsIdeaId?: string;
}

export interface IdeationSessionWithMessages extends IdeationSession {
  messages: IdeationMessage[];
}

// ============================================================================
// Guided Prompts
// ============================================================================

export interface PromptCategory {
  id: IdeaCategory;
  name: string;
  icon: string;
  description: string;
}

export interface IdeationPrompt {
  id: string;
  category: IdeaCategory;
  title: string;
  description: string;
  prompt: string;
  icon?: string;
}

// ============================================================================
// Project Analysis
// ============================================================================

export interface AnalysisFileInfo {
  path: string;
  type: 'route' | 'component' | 'service' | 'model' | 'config' | 'test' | 'other';
  name: string;
}

export interface AnalysisSuggestion {
  id: string;
  category: IdeaCategory;
  title: string;
  description: string;
  rationale: string;
  relatedFiles?: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface ProjectAnalysisResult {
  projectPath: string;
  analyzedAt: string;

  // Structure analysis
  totalFiles: number;
  routes: AnalysisFileInfo[];
  components: AnalysisFileInfo[];
  services: AnalysisFileInfo[];

  // Tech stack detection
  framework?: string;
  language?: string;
  dependencies?: string[];

  // AI-generated suggestions
  suggestions: AnalysisSuggestion[];

  // Summary
  summary: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface StartSessionOptions {
  promptId?: string;
  promptCategory?: IdeaCategory;
  initialMessage?: string;
}

export interface SendMessageOptions {
  imagePaths?: string[];
  model?: string;
}

export interface CreateIdeaInput {
  title: string;
  description: string;
  category: IdeaCategory;
  status?: IdeaStatus;
  impact?: ImpactLevel;
  effort?: EffortLevel;
  conversationId?: string;
  sourcePromptId?: string;
  userStories?: string[];
  notes?: string;
}

export interface UpdateIdeaInput {
  title?: string;
  description?: string;
  category?: IdeaCategory;
  status?: IdeaStatus;
  impact?: ImpactLevel;
  effort?: EffortLevel;
  userStories?: string[];
  notes?: string;
}

export interface ConvertToFeatureOptions {
  column?: string;
  dependencies?: string[];
  tags?: string[];
  keepIdea?: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export type IdeationEventType =
  | 'ideation:stream'
  | 'ideation:session-started'
  | 'ideation:session-ended'
  | 'ideation:analysis-started'
  | 'ideation:analysis-progress'
  | 'ideation:analysis-complete'
  | 'ideation:analysis-error';

export interface IdeationStreamEvent {
  type: 'ideation:stream';
  sessionId: string;
  content: string;
  done: boolean;
}

export interface IdeationAnalysisEvent {
  type:
    | 'ideation:analysis-started'
    | 'ideation:analysis-progress'
    | 'ideation:analysis-complete'
    | 'ideation:analysis-error';
  projectPath: string;
  progress?: number;
  message?: string;
  result?: ProjectAnalysisResult;
  error?: string;
}
