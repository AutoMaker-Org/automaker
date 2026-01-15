import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  /** Optional custom message to display below the spinner. If not provided, uses default translation */
  message?: string;
  /** Optional custom size class for the spinner (default: h-8 w-8) */
  size?: string;
  /** Whether to show the default loading message when no message is provided */
  showDefaultMessage?: boolean;
}

export function LoadingState({
  message,
  size = 'h-8 w-8',
  showDefaultMessage = false,
}: LoadingStateProps) {
  const { t } = useTranslation('common');
  const displayMessage = message ?? (showDefaultMessage ? t('status.loading') : undefined);
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <Loader2 className={`${size} animate-spin text-muted-foreground`} />
      {displayMessage && <p className="mt-4 text-sm text-muted-foreground">{displayMessage}</p>}
    </div>
  );
}
