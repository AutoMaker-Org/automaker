import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronUp, ChevronDown, Upload, Pencil, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { PipelineConfig, PipelineStep } from '@automaker/types';
import { cn } from '@/lib/utils';

// Color options for pipeline columns
const COLOR_OPTIONS = [
  { value: 'bg-blue-500/20', label: 'Blue', preview: 'bg-blue-500' },
  { value: 'bg-purple-500/20', label: 'Purple', preview: 'bg-purple-500' },
  { value: 'bg-green-500/20', label: 'Green', preview: 'bg-green-500' },
  { value: 'bg-orange-500/20', label: 'Orange', preview: 'bg-orange-500' },
  { value: 'bg-red-500/20', label: 'Red', preview: 'bg-red-500' },
  { value: 'bg-pink-500/20', label: 'Pink', preview: 'bg-pink-500' },
  { value: 'bg-cyan-500/20', label: 'Cyan', preview: 'bg-cyan-500' },
  { value: 'bg-amber-500/20', label: 'Amber', preview: 'bg-amber-500' },
  { value: 'bg-indigo-500/20', label: 'Indigo', preview: 'bg-indigo-500' },
];

// Pre-built step templates with well-designed prompts
const STEP_TEMPLATES = [
  {
    id: 'code-review',
    name: 'Code Review',
    colorClass: 'bg-blue-500/20',
    instructions: `## Code Review

Please perform a thorough code review of the changes made in this feature. Focus on:

### Code Quality
- **Readability**: Is the code easy to understand? Are variable/function names descriptive?
- **Maintainability**: Will this code be easy to modify in the future?
- **DRY Principle**: Is there any duplicated code that should be abstracted?
- **Single Responsibility**: Do functions and classes have a single, clear purpose?

### Best Practices
- Follow established patterns and conventions used in the codebase
- Ensure proper error handling is in place
- Check for appropriate logging where needed
- Verify that magic numbers/strings are replaced with named constants

### Performance
- Identify any potential performance bottlenecks
- Check for unnecessary re-renders (React) or redundant computations
- Ensure efficient data structures are used

### Testing
- Verify that new code has appropriate test coverage
- Check that edge cases are handled

### Action Required
After reviewing, make any necessary improvements directly. If you find issues:
1. Fix them immediately if they are straightforward
2. For complex issues, document them clearly with suggested solutions

Provide a brief summary of changes made or issues found.`,
  },
  {
    id: 'security-review',
    name: 'Security Review',
    colorClass: 'bg-red-500/20',
    instructions: `## Security Review

Perform a comprehensive security audit of the changes made in this feature. Check for vulnerabilities in the following areas:

### Input Validation & Sanitization
- Verify all user inputs are properly validated and sanitized
- Check for SQL injection vulnerabilities
- Check for XSS (Cross-Site Scripting) vulnerabilities
- Ensure proper encoding of output data

### Authentication & Authorization
- Verify authentication checks are in place where needed
- Ensure authorization logic correctly restricts access
- Check for privilege escalation vulnerabilities
- Verify session management is secure

### Data Protection
- Ensure sensitive data is not logged or exposed
- Check that secrets/credentials are not hardcoded
- Verify proper encryption is used for sensitive data
- Check for secure transmission of data (HTTPS, etc.)

### Common Vulnerabilities (OWASP Top 10)
- Injection flaws
- Broken authentication
- Sensitive data exposure
- XML External Entities (XXE)
- Broken access control
- Security misconfiguration
- Cross-Site Scripting (XSS)
- Insecure deserialization
- Using components with known vulnerabilities
- Insufficient logging & monitoring

### Action Required
1. Fix any security vulnerabilities immediately
2. For complex security issues, document them with severity levels
3. Add security-related comments where appropriate

Provide a security assessment summary with any issues found and fixes applied.`,
  },
  {
    id: 'testing',
    name: 'Testing',
    colorClass: 'bg-green-500/20',
    instructions: `## Testing Step

Please ensure comprehensive test coverage for the changes made in this feature.

### Unit Tests
- Write unit tests for all new functions and methods
- Ensure edge cases are covered
- Test error handling paths
- Aim for high code coverage on new code

### Integration Tests
- Test interactions between components/modules
- Verify API endpoints work correctly
- Test database operations if applicable

### Test Quality
- Tests should be readable and well-documented
- Each test should have a clear purpose
- Use descriptive test names that explain the scenario
- Follow the Arrange-Act-Assert pattern

### Run Tests
After writing tests, run the full test suite and ensure:
1. All new tests pass
2. No existing tests are broken
3. Test coverage meets project standards

Provide a summary of tests added and any issues found during testing.`,
  },
  {
    id: 'documentation',
    name: 'Documentation',
    colorClass: 'bg-amber-500/20',
    instructions: `## Documentation Step

Please ensure all changes are properly documented.

### Code Documentation
- Add/update JSDoc or docstrings for new functions and classes
- Document complex algorithms or business logic
- Add inline comments for non-obvious code

### API Documentation
- Document any new or modified API endpoints
- Include request/response examples
- Document error responses

### README Updates
- Update README if new setup steps are required
- Document any new environment variables
- Update architecture diagrams if applicable

### Changelog
- Document notable changes for the changelog
- Include breaking changes if any

Provide a summary of documentation added or updated.`,
  },
  {
    id: 'optimization',
    name: 'Performance Optimization',
    colorClass: 'bg-cyan-500/20',
    instructions: `## Performance Optimization Step

Review and optimize the performance of the changes made in this feature.

### Code Performance
- Identify and optimize slow algorithms (O(n²) → O(n log n), etc.)
- Remove unnecessary computations or redundant operations
- Optimize loops and iterations
- Use appropriate data structures

### Memory Usage
- Check for memory leaks
- Optimize memory-intensive operations
- Ensure proper cleanup of resources

### Database/API
- Optimize database queries (add indexes, reduce N+1 queries)
- Implement caching where appropriate
- Batch API calls when possible

### Frontend (if applicable)
- Minimize bundle size
- Optimize render performance
- Implement lazy loading where appropriate
- Use memoization for expensive computations

### Action Required
1. Profile the code to identify bottlenecks
2. Apply optimizations
3. Measure improvements

Provide a summary of optimizations applied and performance improvements achieved.`,
  },
];

// Helper to get template color class
const getTemplateColorClass = (templateId: string): string => {
  const template = STEP_TEMPLATES.find((t) => t.id === templateId);
  return template?.colorClass || COLOR_OPTIONS[0].value;
};

interface PipelineSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  pipelineConfig: PipelineConfig | null;
  onSave: (config: PipelineConfig) => Promise<void>;
}

interface EditingStep {
  id?: string;
  name: string;
  instructions: string;
  colorClass: string;
  order: number;
}

export function PipelineSettingsDialog({
  open,
  onClose,
  projectPath,
  pipelineConfig,
  onSave,
}: PipelineSettingsDialogProps) {
  // Filter and validate steps to ensure all required properties exist
  const validateSteps = (steps: PipelineStep[] | undefined): PipelineStep[] => {
    if (!Array.isArray(steps)) return [];
    return steps.filter(
      (step): step is PipelineStep =>
        step != null &&
        typeof step.id === 'string' &&
        typeof step.name === 'string' &&
        typeof step.instructions === 'string'
    );
  };

  const [steps, setSteps] = useState<PipelineStep[]>(() => validateSteps(pipelineConfig?.steps));
  const [editingStep, setEditingStep] = useState<EditingStep | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync steps when dialog opens or pipelineConfig changes
  useEffect(() => {
    if (open) {
      setSteps(validateSteps(pipelineConfig?.steps));
    }
  }, [open, pipelineConfig]);

  const sortedSteps = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleAddStep = () => {
    setEditingStep({
      name: '',
      instructions: '',
      colorClass: COLOR_OPTIONS[steps.length % COLOR_OPTIONS.length].value,
      order: steps.length,
    });
  };

  const handleEditStep = (step: PipelineStep) => {
    setEditingStep({
      id: step.id,
      name: step.name,
      instructions: step.instructions,
      colorClass: step.colorClass,
      order: step.order,
    });
  };

  const handleDeleteStep = (stepId: string) => {
    const newSteps = steps.filter((s) => s.id !== stepId);
    // Reorder remaining steps
    newSteps.forEach((s, index) => {
      s.order = index;
    });
    setSteps(newSteps);
  };

  const handleMoveStep = (stepId: string, direction: 'up' | 'down') => {
    const stepIndex = sortedSteps.findIndex((s) => s.id === stepId);
    if (
      (direction === 'up' && stepIndex === 0) ||
      (direction === 'down' && stepIndex === sortedSteps.length - 1)
    ) {
      return;
    }

    const newSteps = [...sortedSteps];
    const targetIndex = direction === 'up' ? stepIndex - 1 : stepIndex + 1;

    // Swap orders
    const temp = newSteps[stepIndex].order;
    newSteps[stepIndex].order = newSteps[targetIndex].order;
    newSteps[targetIndex].order = temp;

    setSteps(newSteps);
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setEditingStep((prev) => (prev ? { ...prev, instructions: content } : null));
      toast.success('Instructions loaded from file');
    } catch (error) {
      toast.error('Failed to load file');
    }

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveStep = () => {
    if (!editingStep) return;

    if (!editingStep.name.trim()) {
      toast.error('Step name is required');
      return;
    }

    if (!editingStep.instructions.trim()) {
      toast.error('Step instructions are required');
      return;
    }

    const now = new Date().toISOString();

    if (editingStep.id) {
      // Update existing step
      setSteps((prev) =>
        prev.map((s) =>
          s.id === editingStep.id
            ? {
                ...s,
                name: editingStep.name,
                instructions: editingStep.instructions,
                colorClass: editingStep.colorClass,
                updatedAt: now,
              }
            : s
        )
      );
    } else {
      // Add new step
      const newStep: PipelineStep = {
        id: `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
        name: editingStep.name,
        instructions: editingStep.instructions,
        colorClass: editingStep.colorClass,
        order: steps.length,
        createdAt: now,
        updatedAt: now,
      };
      setSteps((prev) => [...prev, newStep]);
    }

    setEditingStep(null);
  };

  const handleSaveConfig = async () => {
    setIsSubmitting(true);
    try {
      // If the user is currently editing a step and clicks "Save Configuration",
      // include that step in the config (common expectation) instead of silently dropping it.
      let effectiveSteps = steps;
      if (editingStep) {
        if (!editingStep.name.trim()) {
          toast.error('Step name is required');
          return;
        }

        if (!editingStep.instructions.trim()) {
          toast.error('Step instructions are required');
          return;
        }

        const now = new Date().toISOString();
        if (editingStep.id) {
          // Update existing (or add if missing for some reason)
          const existingIdx = effectiveSteps.findIndex((s) => s.id === editingStep.id);
          if (existingIdx >= 0) {
            effectiveSteps = effectiveSteps.map((s) =>
              s.id === editingStep.id
                ? {
                    ...s,
                    name: editingStep.name,
                    instructions: editingStep.instructions,
                    colorClass: editingStep.colorClass,
                    updatedAt: now,
                  }
                : s
            );
          } else {
            effectiveSteps = [
              ...effectiveSteps,
              {
                id: editingStep.id,
                name: editingStep.name,
                instructions: editingStep.instructions,
                colorClass: editingStep.colorClass,
                order: effectiveSteps.length,
                createdAt: now,
                updatedAt: now,
              },
            ];
          }
        } else {
          // Add new step
          effectiveSteps = [
            ...effectiveSteps,
            {
              id: `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
              name: editingStep.name,
              instructions: editingStep.instructions,
              colorClass: editingStep.colorClass,
              order: effectiveSteps.length,
              createdAt: now,
              updatedAt: now,
            },
          ];
        }

        // Keep local UI state consistent with what we are saving.
        setSteps(effectiveSteps);
        setEditingStep(null);
      }

      const sortedEffectiveSteps = [...effectiveSteps].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      const config: PipelineConfig = {
        version: 1,
        steps: sortedEffectiveSteps.map((s, index) => ({ ...s, order: index })),
      };
      await onSave(config);
      toast.success('Pipeline configuration saved');
      onClose();
    } catch (error) {
      toast.error('Failed to save pipeline configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Hidden file input for loading instructions from .md files */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <DialogHeader>
          <DialogTitle>Pipeline Settings</DialogTitle>
          <DialogDescription>
            Configure custom pipeline steps that run after a feature completes "In Progress". Each
            step will automatically prompt the agent with its instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Steps List */}
          {sortedSteps.length > 0 ? (
            <div className="space-y-2">
              {sortedSteps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30"
                >
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveStep(step.id, 'up')}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveStep(step.id, 'down')}
                      disabled={index === sortedSteps.length - 1}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </div>

                  <div
                    className={cn(
                      'w-3 h-8 rounded',
                      (step.colorClass || 'bg-blue-500/20').replace('/20', '')
                    )}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{step.name || 'Unnamed Step'}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(step.instructions || '').substring(0, 100)}
                      {(step.instructions || '').length > 100 ? '...' : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEditStep(step)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteStep(step.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No pipeline steps configured.</p>
              <p className="text-sm">
                Add steps to create a custom workflow after features complete.
              </p>
            </div>
          )}

          {/* Add Step Button */}
          {!editingStep && (
            <Button variant="outline" className="w-full" onClick={handleAddStep}>
              <Plus className="h-4 w-4 mr-2" />
              Add Pipeline Step
            </Button>
          )}

          {/* Edit/Add Step Form */}
          {editingStep && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{editingStep.id ? 'Edit Step' : 'New Step'}</h4>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setEditingStep(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Template Selector - only show for new steps */}
              {!editingStep.id && (
                <div className="space-y-2">
                  <Label>Start from Template</Label>
                  <Select
                    onValueChange={(templateId) => {
                      const template = STEP_TEMPLATES.find((t) => t.id === templateId);
                      if (template) {
                        setEditingStep((prev) =>
                          prev
                            ? {
                                ...prev,
                                name: template.name,
                                instructions: template.instructions,
                                colorClass: template.colorClass,
                              }
                            : null
                        );
                        toast.success(`Loaded "${template.name}" template`);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a template (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {STEP_TEMPLATES.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'w-2 h-2 rounded-full',
                                template.colorClass.replace('/20', '')
                              )}
                            />
                            {template.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select a pre-built template to populate the form, or create your own from
                    scratch.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="step-name">Step Name</Label>
                <Input
                  id="step-name"
                  placeholder="e.g., Code Review, Testing, Documentation"
                  value={editingStep.name}
                  onChange={(e) =>
                    setEditingStep((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={cn(
                        'w-8 h-8 rounded-full transition-all',
                        color.preview,
                        editingStep.colorClass === color.value
                          ? 'ring-2 ring-offset-2 ring-primary'
                          : 'opacity-60 hover:opacity-100'
                      )}
                      onClick={() =>
                        setEditingStep((prev) =>
                          prev ? { ...prev, colorClass: color.value } : null
                        )
                      }
                      title={color.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="step-instructions">Agent Instructions</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleFileUpload}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Load from .md file
                  </Button>
                </div>
                <Textarea
                  id="step-instructions"
                  placeholder="Instructions for the agent to follow during this pipeline step..."
                  value={editingStep.instructions}
                  onChange={(e) =>
                    setEditingStep((prev) =>
                      prev ? { ...prev, instructions: e.target.value } : null
                    )
                  }
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingStep(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveStep}>
                  {editingStep.id ? 'Update Step' : 'Add Step'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSaveConfig} disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving...'
              : editingStep
                ? 'Save Step & Configuration'
                : 'Save Configuration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
