import { ImageDropZone } from '@/components/ui/image-drop-zone';
import type { ImageAttachment, TextFileAttachment } from '@/store/app-store';
import type { PhaseModelEntry } from '@automaker/types';
import { FilePreview } from './file-preview';
import { QueueDisplay } from './queue-display';
import { InputControls } from './input-controls';

interface QueueItem {
  id: string;
  message: string;
  imagePaths?: string[];
}

interface AgentInputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** Current model selection (model + optional thinking level) */
  modelSelection: PhaseModelEntry;
  /** Callback when model is selected */
  onModelSelect: (entry: PhaseModelEntry) => void;
  isProcessing: boolean;
  isConnected: boolean;
  // File attachments
  selectedImages: ImageAttachment[];
  selectedTextFiles: TextFileAttachment[];
  showImageDropZone: boolean;
  isDragOver: boolean;
  onImagesSelected: (images: ImageAttachment[]) => void;
  onToggleImageDropZone: () => void;
  onRemoveImage: (imageId: string) => void;
  onRemoveTextFile: (fileId: string) => void;
  onClearAllFiles: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
  onPaste: (e: React.ClipboardEvent) => Promise<void>;
  // Queue
  serverQueue: QueueItem[];
  onRemoveFromQueue: (id: string) => void;
  onClearQueue: () => void;
  // Refs
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function AgentInputArea({
  input,
  onInputChange,
  onSend,
  onStop,
  modelSelection,
  onModelSelect,
  isProcessing,
  isConnected,
  selectedImages,
  selectedTextFiles,
  showImageDropZone,
  isDragOver,
  onImagesSelected,
  onToggleImageDropZone,
  onRemoveImage,
  onRemoveTextFile,
  onClearAllFiles,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPaste,
  serverQueue,
  onRemoveFromQueue,
  onClearQueue,
  inputRef,
}: AgentInputAreaProps) {
  const hasFiles = selectedImages.length > 0 || selectedTextFiles.length > 0;

  return (
    <div className="border-t border-border p-4 bg-card/50 backdrop-blur-sm">
      {/* Image Drop Zone (when visible) */}
      {showImageDropZone && (
        <ImageDropZone
          onImagesSelected={onImagesSelected}
          images={selectedImages}
          maxFiles={5}
          className="mb-4"
          disabled={!isConnected}
        />
      )}

      {/* Queued Prompts List */}
      <QueueDisplay
        serverQueue={serverQueue}
        onRemoveFromQueue={onRemoveFromQueue}
        onClearQueue={onClearQueue}
      />

      {/* Selected Files Preview - only show when ImageDropZone is hidden */}
      {!showImageDropZone && (
        <FilePreview
          selectedImages={selectedImages}
          selectedTextFiles={selectedTextFiles}
          isProcessing={isProcessing}
          onRemoveImage={onRemoveImage}
          onRemoveTextFile={onRemoveTextFile}
          onClearAll={onClearAllFiles}
        />
      )}

      {/* Input Controls */}
      <InputControls
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        onStop={onStop}
        onToggleImageDropZone={onToggleImageDropZone}
        onPaste={onPaste}
        modelSelection={modelSelection}
        onModelSelect={onModelSelect}
        isProcessing={isProcessing}
        isConnected={isConnected}
        hasFiles={hasFiles}
        isDragOver={isDragOver}
        showImageDropZone={showImageDropZone}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        inputRef={inputRef}
      />
    </div>
  );
}
