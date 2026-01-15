import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Paperclip, Square, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AgentModelSelector } from '../shared/agent-model-selector';
import type { PhaseModelEntry } from '@automaker/types';

interface InputControlsProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onToggleImageDropZone: () => void;
  onPaste: (e: React.ClipboardEvent) => Promise<void>;
  /** Current model selection (model + optional thinking level) */
  modelSelection: PhaseModelEntry;
  /** Callback when model is selected */
  onModelSelect: (entry: PhaseModelEntry) => void;
  isProcessing: boolean;
  isConnected: boolean;
  hasFiles: boolean;
  isDragOver: boolean;
  showImageDropZone: boolean;
  // Drag handlers
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
  // Refs
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function InputControls({
  input,
  onInputChange,
  onSend,
  onStop,
  onToggleImageDropZone,
  onPaste,
  modelSelection,
  onModelSelect,
  isProcessing,
  isConnected,
  hasFiles,
  isDragOver,
  showImageDropZone,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  inputRef: externalInputRef,
}: InputControlsProps) {
  const { t } = useTranslation('agent');
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = externalInputRef || internalInputRef;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [inputRef]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const canSend = (input.trim() || hasFiles) && isConnected;

  return (
    <>
      {/* Text Input and Controls */}
      <div
        className={cn(
          'flex flex-col gap-2 transition-all duration-200 rounded-xl p-1',
          isDragOver && 'bg-primary/5 ring-2 ring-primary/30'
        )}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Textarea - full width on mobile */}
        <div className="relative w-full">
          <Textarea
            ref={inputRef}
            placeholder={
              isDragOver
                ? t('input.placeholderDropFiles')
                : isProcessing
                  ? t('input.placeholderProcessing')
                  : t('input.placeholder')
            }
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            disabled={!isConnected}
            data-testid="agent-input"
            rows={1}
            className={cn(
              'min-h-11 w-full bg-background border-border rounded-xl pl-4 pr-4 sm:pr-20 text-sm transition-all resize-none max-h-36 overflow-y-auto py-2.5',
              'focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
              hasFiles && 'border-primary/30',
              isDragOver && 'border-primary bg-primary/5'
            )}
          />
          {hasFiles && !isDragOver && (
            <div className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
              {t('input.filesAttached')}
            </div>
          )}
          {isDragOver && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-primary font-medium">
              <Paperclip className="w-3 h-3" />
              {t('input.dropHere')}
            </div>
          )}
        </div>

        {/* Controls row - responsive layout */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Model Selector */}
          <AgentModelSelector
            value={modelSelection}
            onChange={onModelSelect}
            disabled={!isConnected}
          />

          {/* File Attachment Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={onToggleImageDropZone}
            disabled={!isConnected}
            className={cn(
              'h-11 w-11 rounded-xl border-border shrink-0',
              showImageDropZone && 'bg-primary/10 text-primary border-primary/30',
              hasFiles && 'border-primary/30 text-primary'
            )}
            title={t('input.attachFiles')}
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          {/* Spacer to push action buttons to the right */}
          <div className="flex-1" />

          {/* Stop Button (only when processing) */}
          {isProcessing && (
            <Button
              onClick={onStop}
              disabled={!isConnected}
              className="h-11 px-4 rounded-xl shrink-0"
              variant="destructive"
              data-testid="stop-agent"
              title={t('input.stopGeneration')}
            >
              <Square className="w-4 h-4 fill-current" />
            </Button>
          )}

          {/* Send / Queue Button */}
          <Button
            onClick={onSend}
            disabled={!canSend}
            className="h-11 px-4 rounded-xl shrink-0"
            variant={isProcessing ? 'outline' : 'default'}
            data-testid="send-message"
            title={isProcessing ? t('input.addToQueue') : t('input.sendMessage')}
          >
            {isProcessing ? <ListOrdered className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Keyboard hint */}
      <p className="text-[11px] text-muted-foreground mt-2 text-center hidden sm:block">
        {t('input.keyboardHint')
          .split('<kbd>')
          .map((part, i) => {
            if (i === 0) return part;
            const [kbdContent, rest] = part.split('</kbd>');
            return (
              <span key={i}>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">
                  {kbdContent}
                </kbd>
                {rest}
              </span>
            );
          })}
      </p>
    </>
  );
}
