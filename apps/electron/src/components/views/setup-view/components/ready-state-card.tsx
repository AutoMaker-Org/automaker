import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

interface ReadyStateCardProps {
  title: string;
  description: string;
  variant?: "success" | "info";
}

export function ReadyStateCard({
  title,
  description,
  variant = "success",
}: ReadyStateCardProps) {
  const variantClasses = {
    success: "bg-green-500/5 border-green-500/20",
    info: "bg-blue-500/5 border-blue-500/20",
  };

  const iconColorClasses = {
    success: "bg-green-500/10 text-green-500",
    info: "bg-blue-500/10 text-blue-500",
  };

  return (
    <Card className={variantClasses[variant]}>
      <CardContent className="py-6">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-full ${iconColorClasses[variant]} flex items-center justify-center`}
          >
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="font-medium text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
