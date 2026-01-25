import { Spinner } from '@/components/ui/spinner';

interface LoadingStateProps {
  /** Optional custom message to display below the spinner */
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <Spinner size="xl" />
      {message && <p className="mt-4 text-sm font-medium text-primary">{message}</p>}
    </div>
  );
}
