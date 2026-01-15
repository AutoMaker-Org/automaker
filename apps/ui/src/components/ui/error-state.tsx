import { useTranslation } from 'react-i18next';
import { CircleDot, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface ErrorStateProps {
  /** Error message to display */
  error: string;
  /** Title for the error state. Uses translation key if not provided */
  title?: string;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Text for the retry button. Uses translation key if not provided */
  retryText?: string;
}

export function ErrorState({ error, title, onRetry, retryText }: ErrorStateProps) {
  const { t } = useTranslation('common');
  const displayTitle = title ?? t('components.errorState.title');
  const displayRetryText = retryText ?? t('buttons.retry');
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="p-4 rounded-full bg-destructive/10 mb-4">
        <CircleDot className="h-12 w-12 text-destructive" />
      </div>
      <h2 className="text-lg font-medium mb-2">{displayTitle}</h2>
      <p className="text-muted-foreground max-w-md mb-4">{error}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {displayRetryText}
        </Button>
      )}
    </div>
  );
}
