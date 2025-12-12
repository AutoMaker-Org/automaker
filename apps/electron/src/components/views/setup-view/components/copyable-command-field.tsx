import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface CopyableCommandFieldProps {
  command: string;
  label?: string;
}

export function CopyableCommandField({
  command,
  label,
}: CopyableCommandFieldProps) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  return (
    <div className="space-y-2">
      {label && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono text-foreground">
          {command}
        </code>
        <Button variant="ghost" size="icon" onClick={copyToClipboard}>
          <Copy className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
