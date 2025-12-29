import { User } from 'lucide-react';
import { Markdown } from '@/components/ui/markdown';
import type { GitHubComment } from '@/lib/electron';
import { formatDate } from '../utils';

interface CommentItemProps {
  comment: GitHubComment;
}

export function CommentItem({ comment }: CommentItemProps) {
  return (
    <div className="p-3 rounded-lg bg-background border border-border">
      {/* Comment Header */}
      <div className="flex items-center gap-2 mb-2">
        {comment.author.avatarUrl ? (
          <img
            src={comment.author.avatarUrl}
            alt={comment.author.login}
            className="h-6 w-6 rounded-full"
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
        )}
        <span className="text-sm font-medium">{comment.author.login}</span>
        <span className="text-xs text-muted-foreground">
          commented {formatDate(comment.createdAt)}
        </span>
      </div>

      {/* Comment Body */}
      {comment.body ? (
        <Markdown className="text-sm">{comment.body}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground italic">No content</p>
      )}
    </div>
  );
}
