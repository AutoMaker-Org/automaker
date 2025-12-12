import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { CopyableCommandField } from "./copyable-command-field";
import { TerminalOutput } from "./terminal-output";

interface CommandInfo {
  label: string; // e.g., "macOS / Linux"
  command: string;
}

interface CliInstallationCardProps {
  cliName: string;
  description: string;
  commands: CommandInfo[];
  isInstalling: boolean;
  installProgress: { output: string[] };
  onInstall: () => void;
  warningMessage?: string;
  color?: "brand" | "green"; // For different CLI themes
}

export function CliInstallationCard({
  cliName,
  description,
  commands,
  isInstalling,
  installProgress,
  onInstall,
  warningMessage,
  color = "brand",
}: CliInstallationCardProps) {
  const colorClasses = {
    brand: "bg-brand-500 hover:bg-brand-600",
    green: "bg-green-500 hover:bg-green-600",
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="w-5 h-5" />
          Install {cliName}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {commands.map((cmd, index) => (
          <CopyableCommandField
            key={index}
            label={cmd.label}
            command={cmd.command}
          />
        ))}

        {isInstalling && (
          <TerminalOutput lines={installProgress.output} />
        )}

        <Button
          onClick={onInstall}
          disabled={isInstalling}
          className={`w-full ${colorClasses[color]} text-white`}
          data-testid={`install-${cliName.toLowerCase()}-button`}
        >
          {isInstalling ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Auto Install
            </>
          )}
        </Button>

        {warningMessage && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                {warningMessage}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
