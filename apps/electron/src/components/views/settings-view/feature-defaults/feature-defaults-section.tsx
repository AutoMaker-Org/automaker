import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FlaskConical, Settings2, TestTube, GitBranch } from "lucide-react";

interface FeatureDefaultsSectionProps {
  showProfilesOnly: boolean;
  defaultSkipTests: boolean;
  useWorktrees: boolean;
  onShowProfilesOnlyChange: (value: boolean) => void;
  onDefaultSkipTestsChange: (value: boolean) => void;
  onUseWorktreesChange: (value: boolean) => void;
}

export function FeatureDefaultsSection({
  showProfilesOnly,
  defaultSkipTests,
  useWorktrees,
  onShowProfilesOnlyChange,
  onDefaultSkipTestsChange,
  onUseWorktreesChange,
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

        {/* Automated Testing Setting */}
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="default-skip-tests"
              checked={!defaultSkipTests}
              onCheckedChange={(checked) =>
                onDefaultSkipTestsChange(checked !== true)
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
                Enable automated testing by default
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, new features will use TDD (test-driven
                development) with automated tests. When disabled, features will
                require manual verification. You can still override this for
                individual features.
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
      </div>
    </div>
  );
}
