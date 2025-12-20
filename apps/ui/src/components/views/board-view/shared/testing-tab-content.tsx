
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FlaskConical, Plus } from "lucide-react";

interface TestingTabContentProps {
  skipTests: boolean;
  onSkipTestsChange: (skipTests: boolean) => void;
  steps: string[];
  onStepsChange: (steps: string[]) => void;
  testIdPrefix?: string;
}

export function TestingTabContent({
  skipTests,
  onSkipTestsChange,
  steps,
  onStepsChange,
  testIdPrefix = "",
}: TestingTabContentProps) {
  const checkboxId = testIdPrefix ? `${testIdPrefix}-skip-tests` : "skip-tests";

  const handleStepChange = (index: number, value: string) => {
    const newSteps = [...(steps || [])];
    newSteps[index] = value;
    onStepsChange(newSteps);
  };

  const handleAddStep = () => {
    onStepsChange([...(steps || []), ""]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox
          id={checkboxId}
          checked={!skipTests}
          onCheckedChange={(checked) => onSkipTestsChange(checked !== true)}
          data-testid={`${testIdPrefix ? testIdPrefix + "-" : ""}skip-tests-checkbox`}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor={checkboxId} className="text-sm cursor-pointer">
            Enable automated testing
          </Label>
          <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        When enabled, this feature will use automated TDD. When disabled, it
        will require manual verification.
      </p>

      {/* Verification Steps - Only shown when skipTests is enabled */}
      {skipTests && (
        <div className="space-y-2 pt-2 border-t border-border">
          <Label>Verification Steps</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Add manual steps to verify this feature works correctly.
          </p>
          {Array.isArray(steps) && steps.map((step, index) => (
            <Input
              key={index}
              value={step}
              placeholder={`Verification step ${index + 1}`}
              onChange={(e) => handleStepChange(index, e.target.value)}
              data-testid={`${testIdPrefix ? testIdPrefix + "-" : ""}feature-step-${index}${testIdPrefix ? "" : "-input"}`}
            />
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddStep}
            data-testid={`${testIdPrefix ? testIdPrefix + "-" : ""}add-step-button`}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Verification Step
          </Button>
        </div>
      )}
    </div>
  );
}
