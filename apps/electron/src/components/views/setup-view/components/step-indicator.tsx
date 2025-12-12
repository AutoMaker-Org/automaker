interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({
  currentStep,
  totalSteps,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={`h-2 rounded-full transition-all duration-300 ${
            index <= currentStep
              ? "w-8 bg-brand-500"
              : "w-2 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}
