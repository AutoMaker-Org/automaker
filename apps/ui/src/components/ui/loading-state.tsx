import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  /** Optional custom message to display below the spinner */
  message?: string;
  /** Optional custom size class for the spinner (default: h-8 w-8) */
  size?: string;
}

export function LoadingState({ message, size = 'h-8 w-8' }: LoadingStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <Loader2 className={`${size} animate-spin text-muted-foreground`} />
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
