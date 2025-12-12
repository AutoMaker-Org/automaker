import { ReactNode } from "react";

interface AuthMethodOption {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  badge: string;
  badgeColor: string; // e.g., "brand-500", "green-500"
}

interface AuthMethodSelectorProps {
  options: AuthMethodOption[];
  onSelect: (methodId: string) => void;
}

// Map badge colors to complete Tailwind class names
const getBadgeClasses = (badgeColor: string) => {
  const colorMap: Record<string, { border: string; bg: string; text: string }> = {
    "brand-500": {
      border: "hover:border-brand-500/50",
      bg: "hover:bg-brand-500/5",
      text: "text-brand-500",
    },
    "green-500": {
      border: "hover:border-green-500/50",
      bg: "hover:bg-green-500/5",
      text: "text-green-500",
    },
    "blue-500": {
      border: "hover:border-blue-500/50",
      bg: "hover:bg-blue-500/5",
      text: "text-blue-500",
    },
    "purple-500": {
      border: "hover:border-purple-500/50",
      bg: "hover:bg-purple-500/5",
      text: "text-purple-500",
    },
  };

  return colorMap[badgeColor] || {
    border: "hover:border-brand-500/50",
    bg: "hover:bg-brand-500/5",
    text: "text-brand-500",
  };
};

export function AuthMethodSelector({
  options,
  onSelect,
}: AuthMethodSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {options.map((option) => {
        const badgeClasses = getBadgeClasses(option.badgeColor);
        return (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={`p-4 rounded-lg border border-border ${badgeClasses.border} bg-card ${badgeClasses.bg} transition-all text-left`}
            data-testid={`select-${option.id}-auth`}
          >
            <div className="flex items-start gap-3">
              {option.icon}
              <div>
                <p className="font-medium text-foreground">{option.title}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                </p>
                <p className={`text-xs ${badgeClasses.text} mt-2`}>
                  {option.badge}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
