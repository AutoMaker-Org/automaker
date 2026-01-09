import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GripVertical, Lock, Pencil, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AIProfile } from '@automaker/types';
import { CURSOR_MODEL_MAP, profileHasThinking, getCodexModelLabel } from '@automaker/types';
import { PROFILE_ICONS } from '../constants';
import { AnthropicIcon, CursorIcon, OpenAIIcon } from '@/components/ui/provider-icon';

interface SortableProfileCardProps {
  profile: AIProfile;
  onEdit: () => void;
  onDelete: () => void;
}

export function SortableProfileCard({ profile, onEdit, onDelete }: SortableProfileCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getDefaultIcon = () => {
    if (profile.provider === 'cursor') return CursorIcon;
    if (profile.provider === 'codex') return OpenAIIcon;
    return AnthropicIcon;
  };

  const IconComponent = profile.icon ? PROFILE_ICONS[profile.icon] : getDefaultIcon();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-start gap-4 p-4 rounded-xl border bg-card transition-all',
        isDragging && 'shadow-lg',
        profile.isBuiltIn
          ? 'border-border/50'
          : 'border-border hover:border-primary/50 hover:shadow-sm'
      )}
      data-testid={`profile-card-${profile.id}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded hover:bg-accent cursor-grab active:cursor-grabbing flex-shrink-0 mt-1"
        data-testid={`profile-drag-handle-${profile.id}`}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Reorder ${profile.name} profile`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
        {IconComponent && <IconComponent className="w-5 h-5 text-primary" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{profile.name}</h3>
          {profile.isBuiltIn && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Lock className="w-2.5 h-2.5" />
              Built-in
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{profile.description}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Provider badge */}
          <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/50 flex items-center gap-1">
            {profile.provider === 'cursor' ? (
              <CursorIcon className="w-3 h-3" />
            ) : profile.provider === 'codex' ? (
              <OpenAIIcon className="w-3 h-3" />
            ) : (
              <AnthropicIcon className="w-3 h-3" />
            )}
            {profile.provider === 'cursor'
              ? 'Cursor'
              : profile.provider === 'codex'
                ? 'Codex'
                : 'Claude'}
          </span>

          {/* Model badge */}
          <span className="text-xs px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/10">
            {profile.provider === 'cursor'
              ? CURSOR_MODEL_MAP[profile.cursorModel || 'auto']?.label ||
                profile.cursorModel ||
                'auto'
              : profile.provider === 'codex'
                ? getCodexModelLabel(profile.codexModel || 'codex-gpt-5.2-codex')
                : profile.model || 'sonnet'}
          </span>

          {/* Thinking badge - works for both providers */}
          {profileHasThinking(profile) && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10">
              {profile.provider === 'cursor' ? 'Thinking' : profile.thinkingLevel}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!profile.isBuiltIn && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 w-8 p-0"
            data-testid={`edit-profile-${profile.id}`}
            aria-label={`Edit ${profile.name} profile`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            data-testid={`delete-profile-${profile.id}`}
            aria-label={`Delete ${profile.name} profile`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
