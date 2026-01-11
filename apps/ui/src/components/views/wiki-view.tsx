import { useState, type ReactNode, type ElementType } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Rocket,
  Layers,
  Sparkles,
  GitBranch,
  FolderTree,
  Component,
  Settings,
  PlayCircle,
  Bot,
  LayoutGrid,
  Terminal,
  Palette,
  Keyboard,
  Cpu,
  Zap,
  Image,
  TestTube,
  Brain,
} from 'lucide-react';

interface WikiSection {
  id: string;
  title: string;
  icon: ElementType;
  content: ReactNode;
}

function CollapsibleSection({
  section,
  isOpen,
  onToggle,
}: {
  section: WikiSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = section.icon;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 backdrop-blur-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-500/10 text-brand-500">
          <Icon className="w-4 h-4" />
        </div>
        <span className="flex-1 font-medium text-foreground">{section.title}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-0 border-t border-border/50">
          <div className="pt-4 text-sm text-muted-foreground leading-relaxed">
            {section.content}
          </div>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border">
      {title && (
        <div className="px-3 py-1.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <pre className="p-3 bg-muted/30 overflow-x-auto text-xs font-mono text-foreground">
        {children}
      </pre>
    </div>
  );
}

function FeatureList({
  items,
}: {
  items: { icon: ElementType; title: string; description: string }[];
}) {
  return (
    <div className="grid gap-3 mt-3">
      {items.map((item, index) => {
        const ItemIcon = item.icon;
        return (
          <div
            key={index}
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded bg-brand-500/10 text-brand-500 shrink-0 mt-0.5">
              <ItemIcon className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="font-medium text-foreground text-sm">{item.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WikiView() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['overview']));

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setOpenSections(new Set(sections.map((s) => s.id)));
  };

  const collapseAll = () => {
    setOpenSections(new Set());
  };

  const sections: WikiSection[] = [
    {
      id: 'overview',
      title: 'Project Overview',
      icon: Rocket,
      content: (
        <div className="space-y-3">
          <p>
            <strong className="text-foreground">Automaker</strong> is an autonomous AI development
            studio that helps developers build software faster using AI agents.
          </p>
          <p>
            At its core, Automaker provides a visual Kanban board to manage features. When you're
            ready, AI agents automatically implement those features in your codebase, complete with
            git worktree isolation for safe parallel development.
          </p>
          <div className="p-3 rounded-lg bg-brand-500/10 border border-brand-500/20 mt-4">
            <p className="text-brand-400 text-sm">
              Think of it as having a team of AI developers that can work on multiple features
              simultaneously while you focus on the bigger picture.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'architecture',
      title: 'Architecture',
      icon: Layers,
      content: (
        <div className="space-y-3">
          <p>Automaker is built as a monorepo with two main applications and shared libraries:</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong className="text-foreground">apps/ui</strong> - React + TanStack Router +
              Electron frontend for the desktop application
            </li>
            <li>
              <strong className="text-foreground">apps/server</strong> - Express backend handling
              API requests and agent orchestration
            </li>
            <li>
              <strong className="text-foreground">libs/</strong> - Shared packages for types,
              utilities, and common logic used across apps
            </li>
          </ul>
          <div className="mt-4 space-y-2">
            <p className="font-medium text-foreground">Key Technologies:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Electron + React + TanStack Router for cross-platform desktop support</li>
              <li>Real-time communication via WebSocket for live agent updates</li>
              <li>State management with Zustand for reactive UI updates</li>
              <li>Claude Agent SDK for AI capabilities</li>
              <li>Shared monorepo packages (@automaker/*) for code reuse</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'features',
      title: 'Key Features',
      icon: Sparkles,
      content: (
        <div>
          <FeatureList
            items={[
              {
                icon: LayoutGrid,
                title: 'Kanban Board',
                description:
                  '4 columns: Backlog, In Progress, Waiting Approval, Verified. Drag and drop to manage feature lifecycle.',
              },
              {
                icon: Bot,
                title: 'AI Agent Integration',
                description:
                  'Powered by Claude via the Agent SDK with full file, bash, and git access.',
              },
              {
                icon: Cpu,
                title: 'Multi-Model Support',
                description:
                  'Claude Haiku/Sonnet/Opus models. Choose the right model for each task.',
              },
              {
                icon: Brain,
                title: 'Extended Thinking',
                description:
                  'Configurable thinking levels (none, low, medium, high, ultrathink) for complex tasks.',
              },
              {
                icon: Zap,
                title: 'Real-time Streaming',
                description: 'Watch AI agents work in real-time with live output streaming.',
              },
              {
                icon: GitBranch,
                title: 'Git Worktree Isolation',
                description:
                  'Each feature runs in its own git worktree for safe parallel development.',
              },
              {
                icon: Terminal,
                title: 'Integrated Terminal',
                description: 'Built-in terminal with tab support and split panes.',
              },
              {
                icon: Keyboard,
                title: 'Keyboard Shortcuts',
                description: 'Fully customizable shortcuts for power users.',
              },
              {
                icon: Palette,
                title: '14 Themes',
                description: 'From light to dark, retro to synthwave - pick your style.',
              },
              {
                icon: Image,
                title: 'Image Support',
                description: 'Attach images to features for visual context.',
              },
              {
                icon: TestTube,
                title: 'Test Integration',
                description: 'Automatic test running and TDD support for quality assurance.',
              },
            ]}
          />
        </div>
      ),
    },
    {
      id: 'data-flow',
      title: 'How It Works (Data Flow)',
      icon: GitBranch,
      content: (
        <div className="space-y-3">
          <p>Here's what happens when you use Automaker to implement a feature:</p>
          <ol className="list-decimal list-inside space-y-3 ml-2 mt-4">
            <li className="text-foreground">
              <strong>Create Feature</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Add a new feature card to the Kanban board with description and steps
              </p>
            </li>
            <li className="text-foreground">
              <strong>Feature Saved</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Feature saved to{' '}
                <code className="px-1 py-0.5 bg-muted rounded text-xs">
                  .automaker/features/&#123;id&#125;/feature.json
                </code>
              </p>
            </li>
            <li className="text-foreground">
              <strong>Start Work</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Drag to "In Progress" or enable auto mode to start implementation
              </p>
            </li>
            <li className="text-foreground">
              <strong>Git Worktree Created</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Backend AutoModeService creates isolated git worktree (if enabled)
              </p>
            </li>
            <li className="text-foreground">
              <strong>Agent Executes</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Claude Agent SDK runs with file/bash/git tool access
              </p>
            </li>
            <li className="text-foreground">
              <strong>Progress Streamed</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Real-time updates via WebSocket as agent works
              </p>
            </li>
            <li className="text-foreground">
              <strong>Completion</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                On success, feature moves to "waiting_approval" for your review
              </p>
            </li>
            <li className="text-foreground">
              <strong>Verify</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Review changes and move to "verified" when satisfied
              </p>
            </li>
          </ol>
        </div>
      ),
    },
    {
      id: 'structure',
      title: 'Project Structure',
      icon: FolderTree,
      content: (
        <div>
          <p className="mb-3">The Automaker codebase is organized as follows:</p>
          <CodeBlock title="Directory Structure">
            {`automaker/
├─ apps/
│  ├─ ui/                                    Frontend (React + Electron)
│  │  └─ src/
│  │     ├─ routes/                          TanStack Router pages
│  │     ├─ components/
│  │     │  ├─ layout/                       Layout components (sidebar, etc.)
│  │     │  ├─ views/                        View components (board, agent, etc.)
│  │     │  ├─ dialogs/                      Dialog components
│  │     │  └─ ui/                           shadcn/ui components
│  │     ├─ store/                           Zustand state management
│  │     ├─ hooks/                           Custom React hooks
│  │     ├─ lib/                             Utilities and helpers
│  │     ├─ config/                          App configuration files
│  │     ├─ contexts/                        React context providers
│  │     ├─ styles/                          CSS styles and theme definitions
│  │     ├─ types/                           TypeScript type definitions
│  │     ├─ utils/                           Utility functions
│  │     ├─ main.ts                          Electron main process entry
│  │     ├─ preload.ts                       Electron preload script
│  │     └─ renderer.tsx                     React renderer entry
│  │
│  └─ server/                                Backend (Express)
│     └─ src/
│        ├─ routes/                          API endpoints
│        ├─ services/                        Business logic (AutoModeService, etc.)
│        ├─ lib/                             Library utilities
│        ├─ middleware/                      Express middleware
│        ├─ providers/                        AI provider implementations
│        ├─ types/                           TypeScript type definitions
│        └─ index.ts                         Server entry point
│
├─ libs/                                     Shared packages (monorepo)
│  ├─ types/                                 TypeScript type definitions
│  ├─ utils/                                 Common utilities (logging, errors)
│  ├─ prompts/                               AI prompt templates
│  ├─ platform/                              Platform & path utilities
│  ├─ model-resolver/                        Claude model resolution
│  ├─ dependency-resolver/                   Feature dependency ordering
│  └─ git-utils/                             Git operations & parsing
│
├─ docs/                                     Documentation
└─ package.json                              Workspace root
`}
          </CodeBlock>
        </div>
      ),
    },
    {
      id: 'components',
      title: 'Key Components',
      icon: Component,
      content: (
        <div className="space-y-3">
          <p>The main UI components that make up Automaker:</p>
          <div className="grid gap-2 mt-4">
            {[
              {
                file: 'layout/sidebar.tsx',
                desc: 'Main navigation with project picker and view switching',
              },
              {
                file: 'views/board-view.tsx',
                desc: 'Kanban board with drag-and-drop cards',
              },
              {
                file: 'views/agent-view.tsx',
                desc: 'AI chat interface for conversational development',
              },
              {
                file: 'views/spec-view/',
                desc: 'Project specification editor with AI generation',
              },
              {
                file: 'views/context-view.tsx',
                desc: 'Context file manager for AI context',
              },
              {
                file: 'views/terminal-view/',
                desc: 'Integrated terminal with splits and tabs',
              },
              {
                file: 'store/app-store.ts',
                desc: 'Central Zustand state management',
              },
            ].map((item) => (
              <div
                key={item.file}
                className="flex items-center gap-3 p-2 rounded bg-muted/30 border border-border/50"
              >
                <code className="text-xs font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">
                  {item.file}
                </code>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'configuration',
      title: 'Configuration',
      icon: Settings,
      content: (
        <div className="space-y-3">
          <p>
            Automaker stores project configuration in the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">.automaker/</code> directory:
          </p>
          <div className="grid gap-2 mt-4">
            {[
              {
                file: 'app_spec.txt',
                desc: 'Project specification describing your app for AI context',
              },
              {
                file: 'context/',
                desc: 'Additional context files (docs, examples) for AI',
              },
              {
                file: 'features/',
                desc: 'Feature definitions with descriptions and steps',
              },
            ].map((item) => (
              <div
                key={item.file}
                className="flex items-center gap-3 p-2 rounded bg-muted/30 border border-border/50"
              >
                <code className="text-xs font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">
                  {item.file}
                </code>
                <span className="text-xs text-muted-foreground">{item.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground font-medium mb-2">Tip: App Spec Best Practices</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
              <li>Include your tech stack and key dependencies</li>
              <li>Describe the project structure and conventions</li>
              <li>List any important patterns or architectural decisions</li>
              <li>Note testing requirements and coding standards</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: PlayCircle,
      content: (
        <div className="space-y-3">
          <p>Follow these steps to start building with Automaker:</p>
          <ol className="list-decimal list-inside space-y-4 ml-2 mt-4">
            <li className="text-foreground">
              <strong>Create or Open a Project</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Use the sidebar to create a new project or open an existing folder
              </p>
            </li>
            <li className="text-foreground">
              <strong>Write an App Spec</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Go to Spec Editor and describe your project. This helps AI understand your codebase.
              </p>
            </li>
            <li className="text-foreground">
              <strong>Add Context (Optional)</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Add relevant documentation or examples to the Context view for better AI results
              </p>
            </li>
            <li className="text-foreground">
              <strong>Create Features</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Add feature cards to your Kanban board with clear descriptions and implementation
                steps
              </p>
            </li>
            <li className="text-foreground">
              <strong>Start Implementation</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Drag features to "In Progress" or enable auto mode to let AI work
              </p>
            </li>
            <li className="text-foreground">
              <strong>Review and Verify</strong>
              <p className="text-muted-foreground ml-5 mt-1">
                Check completed features, review changes, and mark as verified
              </p>
            </li>
          </ol>
          <div className="mt-6 p-4 rounded-lg bg-brand-500/10 border border-brand-500/20">
            <p className="text-brand-400 text-sm font-medium mb-2">Pro Tips:</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-brand-400/80">
              <li>
                Use keyboard shortcuts for faster navigation (press{' '}
                <code className="px-1 py-0.5 bg-brand-500/20 rounded">?</code> to see all)
              </li>
              <li>Enable git worktree isolation for parallel feature development</li>
              <li>Keep your app spec up to date as your project evolves</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/30 backdrop-blur-sm px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Wiki</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Learn how Automaker works and how to use it effectively
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
          {sections.map((section) => (
            <CollapsibleSection
              key={section.id}
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
