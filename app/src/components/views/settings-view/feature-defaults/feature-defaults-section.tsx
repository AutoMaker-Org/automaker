import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FlaskConical, Settings2, TestTube, GitBranch, Shield } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CodeReviewAgent, CodeReviewChecks } from "@/store/app-store";

interface FeatureDefaultsSectionProps {
  showProfilesOnly: boolean;
  defaultSkipTests: boolean;
  useWorktrees: boolean;
  codeReviewMode: "auto" | "manual";
  codeReviewChecks: CodeReviewChecks;
  codeReviewAgent: CodeReviewAgent;
  onShowProfilesOnlyChange: (value: boolean) => void;
  onDefaultSkipTestsChange: (value: boolean) => void;
  onUseWorktreesChange: (value: boolean) => void;
  onCodeReviewModeChange: (mode: "auto" | "manual") => void;
  onCodeReviewChecksChange: (checks: Partial<CodeReviewChecks>) => void;
  onCodeReviewAgentChange: (agent: CodeReviewAgent) => void;
}

export function FeatureDefaultsSection({
  showProfilesOnly,
  defaultSkipTests,
  useWorktrees,
  codeReviewMode,
  codeReviewChecks,
  codeReviewAgent,
  onShowProfilesOnlyChange,
  onDefaultSkipTestsChange,
  onUseWorktreesChange,
  onCodeReviewModeChange,
  onCodeReviewChecksChange,
  onCodeReviewAgentChange,
}: FeatureDefaultsSectionProps) {
  return (
    <div
      id="defaults"
      className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-5 h-5 text-brand-500" />
          <h2 className="text-lg font-semibold text-foreground">
            Feature Defaults
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure default settings for new features.
        </p>
      </div>
      <div className="p-6 space-y-4">
        {/* Profiles Only Setting */}
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="show-profiles-only"
              checked={showProfilesOnly}
              onCheckedChange={(checked) =>
                onShowProfilesOnlyChange(checked === true)
              }
              className="mt-0.5"
              data-testid="show-profiles-only-checkbox"
            />
            <div className="space-y-1">
              <Label
                htmlFor="show-profiles-only"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                <Settings2 className="w-4 h-4 text-brand-500" />
                Show profiles only by default
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, the Add Feature dialog will show only AI profiles
                and hide advanced model tweaking options (Claude SDK, thinking
                levels, and OpenAI Codex CLI). This creates a cleaner, less
                overwhelming UI. You can always disable this to access advanced
                settings.
              </p>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-border" />

        {/* Skip Tests Setting */}
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="default-skip-tests"
              checked={defaultSkipTests}
              onCheckedChange={(checked) =>
                onDefaultSkipTestsChange(checked === true)
              }
              className="mt-0.5"
              data-testid="default-skip-tests-checkbox"
            />
            <div className="space-y-1">
              <Label
                htmlFor="default-skip-tests"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                <TestTube className="w-4 h-4 text-brand-500" />
                Skip automated testing by default
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, new features will default to manual verification
                instead of TDD (test-driven development). You can still override
                this for individual features.
              </p>
            </div>
          </div>
        </div>

        {/* Worktree Isolation Setting */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="use-worktrees"
              checked={useWorktrees}
              onCheckedChange={(checked) =>
                onUseWorktreesChange(checked === true)
              }
              className="mt-0.5"
              data-testid="use-worktrees-checkbox"
            />
            <div className="space-y-1">
              <Label
                htmlFor="use-worktrees"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                <GitBranch className="w-4 h-4 text-brand-500" />
                Enable Git Worktree Isolation (experimental)
              </Label>
              <p className="text-xs text-muted-foreground">
                Creates isolated git branches for each feature. When disabled,
                agents work directly in the main project directory. This feature
                is experimental and may require additional setup like branch
                selection and merge configuration.
              </p>
            </div>
          </div>
        </div>

        {/* Code Review Settings */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="auto-code-review"
              checked={codeReviewMode === "auto"}
              onCheckedChange={(checked) =>
                onCodeReviewModeChange(checked ? "auto" : "manual")
              }
              className="mt-0.5"
              data-testid="auto-code-review-checkbox"
            />
            <div className="space-y-1">
              <Label
                htmlFor="auto-code-review"
                className="text-foreground cursor-pointer font-medium flex items-center gap-2"
              >
                <Shield className="w-4 h-4 text-brand-500" />
                Auto Code Review
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically review code quality when agents complete features.
                Checks for TypeScript errors, build issues, and code patterns.
                When enabled, review runs automatically; when disabled, use the
                Review button on cards.
              </p>
            </div>
          </div>

          {/* Review Check Options - indented under main checkbox */}
          <div className="ml-8 space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="review-typescript"
                checked={codeReviewChecks.typescript}
                onCheckedChange={(checked) =>
                  onCodeReviewChecksChange({ typescript: checked === true })
                }
                data-testid="review-typescript-checkbox"
              />
              <Label
                htmlFor="review-typescript"
                className="text-sm text-foreground cursor-pointer"
              >
                TypeScript Validation
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="review-build"
                checked={codeReviewChecks.build}
                onCheckedChange={(checked) =>
                  onCodeReviewChecksChange({ build: checked === true })
                }
                data-testid="review-build-checkbox"
              />
              <Label
                htmlFor="review-build"
                className="text-sm text-foreground cursor-pointer"
              >
                Build Verification
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="review-patterns"
                checked={codeReviewChecks.patterns}
                onCheckedChange={(checked) =>
                  onCodeReviewChecksChange({ patterns: checked === true })
                }
                data-testid="review-patterns-checkbox"
              />
              <Label
                htmlFor="review-patterns"
                className="text-sm text-foreground cursor-pointer"
              >
                Pattern Analysis
              </Label>
            </div>

            {/* Agent Selection */}
            <div className="flex items-center gap-3 pt-2">
              <Label htmlFor="review-agent" className="text-sm text-foreground whitespace-nowrap">
                Review Agent:
              </Label>
              <Select
                value={codeReviewAgent}
                onValueChange={(value) => onCodeReviewAgentChange(value as CodeReviewAgent)}
              >
                <SelectTrigger
                  id="review-agent"
                  className="w-40"
                  data-testid="review-agent-select"
                >
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opus">Claude Opus</SelectItem>
                  <SelectItem value="sonnet">Claude Sonnet</SelectItem>
                  <SelectItem value="codex">OpenAI Codex</SelectItem>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
