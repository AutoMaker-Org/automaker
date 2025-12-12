import { StatusBadge } from "./status-badge";

interface StatusRowProps {
  label: string;
  status:
    | "checking"
    | "installed"
    | "not_installed"
    | "authenticated"
    | "not_authenticated";
  statusLabel: string;
  metadata?: string; // e.g., "(Subscription Token)"
}

export function StatusRow({
  label,
  status,
  statusLabel,
  metadata,
}: StatusRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <StatusBadge status={status} label={statusLabel} />
        {metadata && (
          <span className="text-xs text-muted-foreground">{metadata}</span>
        )}
      </div>
    </div>
  );
}
