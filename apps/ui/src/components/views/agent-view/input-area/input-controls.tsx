import { useRef, useCallback, useEffect } from 'react';
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
          'flex gap-2 transition-all duration-200 rounded-xl p-1',
          isDragOver && 'bg-primary/5 ring-2 ring-primary/30'
        )}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="flex-1 relative">
          <Textarea
            ref={inputRef}
            placeholder={
              isDragOver
                ? 'Drop your files here...'
                : isProcessing
                  ? 'Type to queue another prompt...'
                  : 'Describe what you want to build...'
            }
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            disabled={!isConnected}
            data-testid="agent-input"
            rows={1}
            className={cn(
              'min-h-11 bg-background border-border rounded-xl pl-4 pr-20 text-sm transition-all resize-none max-h-36 overflow-y-auto py-2.5',
              'focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
              hasFiles && 'border-primary/30',
              isDragOver && 'border-primary bg-primary/5'
            )}
          />
          {hasFiles && !isDragOver && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">
              files attached
            </div>
          )}
          {isDragOver && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-primary font-medium">
              <Paperclip className="w-3 h-3" />
              Drop here
            </div>
          )}
        </div>

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
            'h-11 w-11 rounded-xl border-border',
            showImageDropZone && 'bg-primary/10 text-primary border-primary/30',
            hasFiles && 'border-primary/30 text-primary'
          )}
          title="Attach files (images, .txt, .md)"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        {/* Stop Button (only when processing) */}
        {isProcessing && (
          <Button
            onClick={onStop}
            disabled={!isConnected}
            className="h-11 px-4 rounded-xl"
            variant="destructive"
            data-testid="stop-agent"
            title="Stop generation"
          >
            <Square className="w-4 h-4 fill-current" />
          </Button>
        )}

        {/* Send / Queue Button */}
        <Button
          onClick={onSend}
          disabled={!canSend}
          className="h-11 px-4 rounded-xl"
          variant={isProcessing ? 'outline' : 'default'}
          data-testid="send-message"
          title={isProcessing ? 'Add to queue' : 'Send message'}
        >
          {isProcessing ? <ListOrdered className="w-4 h-4" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* Keyboard hint */}
      <p className="text-[11px] text-muted-foreground mt-2 text-center">
        Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">Enter</kbd> to
        send,{' '}
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium">Shift+Enter</kbd>{' '}
        for new line
      </p>
    </>
  );
}
