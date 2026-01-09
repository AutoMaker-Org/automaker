import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileCode, Globe, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OpenAIIcon } from '@/components/ui/provider-icon';

interface CodexSettingsProps {
  autoLoadCodexAgents: boolean;
  codexEnableWebSearch: boolean;
  codexEnableImages: boolean;
  onAutoLoadCodexAgentsChange: (enabled: boolean) => void;
  onCodexEnableWebSearchChange: (enabled: boolean) => void;
  onCodexEnableImagesChange: (enabled: boolean) => void;
}

const CARD_TITLE = 'Codex CLI Settings';
const CARD_SUBTITLE = 'Configure Codex instructions and capabilities.';
const AGENTS_TITLE = 'Auto-load AGENTS.md Instructions';
const AGENTS_DESCRIPTION = 'Automatically inject project instructions from';
const AGENTS_PATH = '.codex/AGENTS.md';
const AGENTS_SUFFIX = 'on each Codex run.';
const WEB_SEARCH_TITLE = 'Enable Web Search';
const WEB_SEARCH_DESCRIPTION = 'Allow Codex to search the web for current information.';
const IMAGES_TITLE = 'Enable Image Support';
const IMAGES_DESCRIPTION = 'Allow Codex to process images attached to prompts.';

export function CodexSettings({
  autoLoadCodexAgents,
  codexEnableWebSearch,
  codexEnableImages,
  onAutoLoadCodexAgentsChange,
  onCodexEnableWebSearchChange,
  onCodexEnableImagesChange,
}: CodexSettingsProps) {
  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <OpenAIIcon className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">{CARD_TITLE}</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">{CARD_SUBTITLE}</p>
      </div>
      <div className="p-6 space-y-5">
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="auto-load-codex-agents"
            checked={autoLoadCodexAgents}
            onCheckedChange={(checked) => onAutoLoadCodexAgentsChange(checked === true)}
            className="mt-1"
            data-testid="auto-load-codex-agents-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-load-codex-agents"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <FileCode className="w-4 h-4 text-brand-500" />
              {AGENTS_TITLE}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {AGENTS_DESCRIPTION}{' '}
              <code className="text-[10px] px-1 py-0.5 rounded bg-accent/50">{AGENTS_PATH}</code>{' '}
              {AGENTS_SUFFIX}
            </p>
          </div>
        </div>

        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="codex-enable-web-search"
            checked={codexEnableWebSearch}
            onCheckedChange={(checked) => onCodexEnableWebSearchChange(checked === true)}
            className="mt-1"
            data-testid="codex-enable-web-search-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="codex-enable-web-search"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Globe className="w-4 h-4 text-brand-500" />
              {WEB_SEARCH_TITLE}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {WEB_SEARCH_DESCRIPTION}
            </p>
          </div>
        </div>

        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="codex-enable-images"
            checked={codexEnableImages}
            onCheckedChange={(checked) => onCodexEnableImagesChange(checked === true)}
            className="mt-1"
            data-testid="codex-enable-images-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="codex-enable-images"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <ImageIcon className="w-4 h-4 text-brand-500" />
              {IMAGES_TITLE}
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">{IMAGES_DESCRIPTION}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
