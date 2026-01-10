import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, FolderOpen, Sparkles, Rocket } from 'lucide-react';

interface EmptyStateProps {
  onNewProject: () => void;
  onOpenFolder: () => void;
}

export function EmptyState({ onNewProject, onOpenFolder }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Welcome Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
            <Rocket className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold mb-2">Welcome to Automaker</h1>
          <p className="text-lg text-muted-foreground">
            Your AI-powered development studio. Let's get started.
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* New Project */}
          <Card
            className={cn(
              'cursor-pointer transition-all duration-200',
              'hover:bg-accent/50 hover:border-primary/50',
              'group'
            )}
            onClick={onNewProject}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex items-center justify-center h-12 w-12 rounded-xl',
                    'bg-green-500/10 text-green-500',
                    'group-hover:bg-green-500/20 transition-colors'
                  )}
                >
                  <Plus className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">New Project</h3>
                  <p className="text-sm text-muted-foreground">
                    Start fresh with a new project. We'll help you set up your app spec and generate
                    initial features.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Includes AI-powered feature ideation</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Open Existing */}
          <Card
            className={cn(
              'cursor-pointer transition-all duration-200',
              'hover:bg-accent/50 hover:border-primary/50',
              'group'
            )}
            onClick={onOpenFolder}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex items-center justify-center h-12 w-12 rounded-xl',
                    'bg-blue-500/10 text-blue-500',
                    'group-hover:bg-blue-500/20 transition-colors'
                  )}
                >
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Open Existing Project</h3>
                  <p className="text-sm text-muted-foreground">
                    Already have a codebase? Open it and let AI help you build new features.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto-detects your tech stack</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started Steps */}
        <div className="mt-10 text-center">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">How it works</h2>
          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                1
              </span>
              <span>Add your project</span>
            </div>
            <div className="h-px w-8 bg-border" />
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                2
              </span>
              <span>Create features</span>
            </div>
            <div className="h-px w-8 bg-border" />
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-medium">
                3
              </span>
              <span>Let AI build</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
