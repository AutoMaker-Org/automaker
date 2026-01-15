import { useTranslation } from 'react-i18next';
import { Sparkles, Bot, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NoProjectState() {
  const { t } = useTranslation('agent');

  return (
    <div
      className="flex-1 flex items-center justify-center bg-background"
      data-testid="agent-view-no-project"
    >
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-3 text-foreground">{t('noProject.title')}</h2>
        <p className="text-muted-foreground leading-relaxed">{t('noProject.description')}</p>
      </div>
    </div>
  );
}

interface NoSessionStateProps {
  showSessionManager: boolean;
  onShowSessionManager: () => void;
}

export function NoSessionState({ showSessionManager, onShowSessionManager }: NoSessionStateProps) {
  const { t } = useTranslation('agent');

  return (
    <div
      className="flex-1 flex items-center justify-center bg-background"
      data-testid="no-session-placeholder"
    >
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
          <Bot className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-3 text-foreground">
          {t('session.noSessionSelected')}
        </h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          {t('session.noSessionDescription')}
        </p>
        <Button onClick={onShowSessionManager} variant="outline" className="gap-2">
          <PanelLeft className="w-4 h-4" />
          {showSessionManager ? t('session.viewSessions') : t('session.showSessions')}
        </Button>
      </div>
    </div>
  );
}
