import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Card } from '@/components/ui/card';
import {
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Trash2,
  Save,
  Upload,
  File,
  BookOpen,
  Eye,
  Pencil,
  FilePlus,
  FileUp,
  Loader2,
  MoreVertical,
} from 'lucide-react';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { sanitizeFilename } from '@/lib/image-utils';
import { Markdown } from '../ui/markdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';

interface ContextFile {
  name: string;
  type: 'text' | 'image';
  content?: string;
  path: string;
  description?: string;
}

interface ContextMetadata {
  files: Record<string, { description: string }>;
}

export function ContextView() {
  const { currentProject } = useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameFileName, setRenameFileName] = useState('');
  const [isDropHovering, setIsDropHovering] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);

  // Create Markdown modal state
  const [isCreateMarkdownOpen, setIsCreateMarkdownOpen] = useState(false);
  const [newMarkdownName, setNewMarkdownName] = useState('');
  const [newMarkdownDescription, setNewMarkdownDescription] = useState('');
  const [newMarkdownContent, setNewMarkdownContent] = useState('');

  // Track files with generating descriptions (async)
  const [generatingDescriptions, setGeneratingDescriptions] = useState<Set<string>>(new Set());

  // Edit description modal state
  const [isEditDescriptionOpen, setIsEditDescriptionOpen] = useState(false);
  const [editDescriptionValue, setEditDescriptionValue] = useState('');
  const [editDescriptionFileName, setEditDescriptionFileName] = useState('');

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get images directory path
  const getImagesPath = useCallback(() => {
    if (!currentProject) return null;
    return `${currentProject.path}/.automaker/images`;
  }, [currentProject]);

  // Keyboard shortcuts for this view
  const contextShortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        key: shortcuts.addContextFile,
        action: () => setIsCreateMarkdownOpen(true),
        description: 'Create new markdown file',
      },
    ],
    [shortcuts]
  );
  useKeyboardShortcuts(contextShortcuts);

  // Get context directory path for user-added context files
  const getContextPath = useCallback(() => {
    if (!currentProject) return null;
    return `${currentProject.path}/.automaker/context`;
  }, [currentProject]);

  const isMarkdownFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return ext === '.md' || ext === '.markdown';
  };

  // Determine if a file is an image based on extension
  const isImageFile = (filename: string): boolean => {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return imageExtensions.includes(ext);
  };

  // Load context metadata
  const loadMetadata = useCallback(async (): Promise<ContextMetadata> => {
    const contextPath = getContextPath();
    if (!contextPath) return { files: {} };

    try {
      const api = getElectronAPI();
      const metadataPath = `${contextPath}/context-metadata.json`;
      const result = await api.readFile(metadataPath);
      if (result.success && result.content) {
        return JSON.parse(result.content);
      }
    } catch {
      // Metadata file doesn't exist yet
    }
    return { files: {} };
  }, [getContextPath]);

  // Save context metadata
  const saveMetadata = useCallback(
    async (metadata: ContextMetadata) => {
      const contextPath = getContextPath();
      if (!contextPath) return;

      try {
        const api = getElectronAPI();
        const metadataPath = `${contextPath}/context-metadata.json`;
        await api.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      } catch (error) {
        console.error('Failed to save metadata:', error);
      }
    },
    [getContextPath]
  );

  // Load context files
  const loadContextFiles = useCallback(async () => {
    const contextPath = getContextPath();
    if (!contextPath) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();

      // Ensure context directory exists
      await api.mkdir(contextPath);

      // Ensure metadata file exists (create empty one if not)
      const metadataPath = `${contextPath}/context-metadata.json`;
      const metadataExists = await api.exists(metadataPath);
      if (!metadataExists) {
        await api.writeFile(metadataPath, JSON.stringify({ files: {} }, null, 2));
      }

      // Load metadata for descriptions
      const metadata = await loadMetadata();

      // Read directory contents
      const result = await api.readdir(contextPath);
      if (result.success && result.entries) {
        const files: ContextFile[] = result.entries
          .filter((entry) => entry.isFile && entry.name !== 'context-metadata.json')
          .map((entry) => ({
            name: entry.name,
            type: isImageFile(entry.name) ? 'image' : 'text',
            path: `${contextPath}/${entry.name}`,
            description: metadata.files[entry.name]?.description,
          }));
        setContextFiles(files);
      }
    } catch (error) {
      console.error('Failed to load context files:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getContextPath, loadMetadata]);

  useEffect(() => {
    loadContextFiles();
  }, [loadContextFiles]);

  // Load selected file content
  const loadFileContent = useCallback(async (file: ContextFile) => {
    try {
      const api = getElectronAPI();
      const result = await api.readFile(file.path);
      if (result.success && result.content !== undefined) {
        setEditedContent(result.content);
        setSelectedFile({ ...file, content: result.content });
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
    }
  }, []);

  // Select a file
  const handleSelectFile = (file: ContextFile) => {
    if (hasChanges) {
      // Could add a confirmation dialog here
    }
    loadFileContent(file);
    setIsPreviewMode(isMarkdownFile(file.name));
  };

  // Save current file
  const saveFile = async () => {
    if (!selectedFile) return;

    setIsSaving(true);
    try {
      const api = getElectronAPI();
      await api.writeFile(selectedFile.path, editedContent);
      setSelectedFile({ ...selectedFile, content: editedContent });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle content change
  const handleContentChange = (value: string) => {
    setEditedContent(value);
    setHasChanges(true);
  };

  // Generate description for a file
  const generateDescription = async (
    filePath: string,
    fileName: string,
    isImage: boolean
  ): Promise<string | undefined> => {
    try {
      const httpClient = getHttpApiClient();
      const result = isImage
        ? await httpClient.context.describeImage(filePath)
        : await httpClient.context.describeFile(filePath);

      if (result.success && result.description) {
        return result.description;
      }

      const message =
        result.error || `Automaker couldn't generate a description for “${fileName}”.`;
      toast.error('Failed to generate description', { description: message });
    } catch (error) {
      console.error('Failed to generate description:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while generating the description.';
      toast.error('Failed to generate description', { description: message });
    }
    return undefined;
  };

  // Generate description in background and update metadata
  const generateDescriptionAsync = useCallback(
    async (filePath: string, fileName: string, isImage: boolean) => {
      // Add to generating set
      setGeneratingDescriptions((prev) => new Set(prev).add(fileName));

      try {
        const description = await generateDescription(filePath, fileName, isImage);

        if (description) {
          const metadata = await loadMetadata();
          metadata.files[fileName] = { description };
          await saveMetadata(metadata);

          // Reload files to update UI with new description
          await loadContextFiles();

          // Also update selectedFile if it's the one that just got described
          setSelectedFile((current) => {
            if (current?.name === fileName) {
              return { ...current, description };
            }
            return current;
          });
        }
      } catch (error) {
        console.error('Failed to generate description:', error);
      } finally {
        // Remove from generating set
        setGeneratingDescriptions((prev) => {
          const next = new Set(prev);
          next.delete(fileName);
          return next;
        });
      }
    },
    [loadMetadata, saveMetadata, loadContextFiles]
  );

  // Upload a file and generate description asynchronously
  const uploadFile = async (file: globalThis.File) => {
    const contextPath = getContextPath();
    if (!contextPath) return;

    setIsUploading(true);
    setUploadingFileName(file.name);

    try {
      const api = getElectronAPI();
      const isImage = isImageFile(file.name);

      let filePath: string;
      let fileName: string;
      let imagePathForDescription: string | undefined;

      if (isImage) {
        // For images: sanitize filename, store in .automaker/images
        fileName = sanitizeFilename(file.name);

        // Read file as base64
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        // Extract base64 data without the data URL prefix
        const base64Data = dataUrl.split(',')[1] || dataUrl;

        // Determine mime type from original file
        const mimeType = file.type || 'image/png';

        // Use saveImageToTemp to properly save as binary file in .automaker/images
        const saveResult = await api.saveImageToTemp?.(
          base64Data,
          fileName,
          mimeType,
          currentProject!.path
        );

        if (!saveResult?.success || !saveResult.path) {
          throw new Error(saveResult?.error || 'Failed to save image');
        }

        // The saved image path is used for description
        imagePathForDescription = saveResult.path;

        // Also save to context directory for display in the UI
        // (as a data URL for inline display)
        filePath = `${contextPath}/${fileName}`;
        await api.writeFile(filePath, dataUrl);
      } else {
        // For non-images: keep original behavior
        fileName = file.name;
        filePath = `${contextPath}/${fileName}`;

        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsText(file);
        });

        await api.writeFile(filePath, content);
      }

      // Reload files immediately (file appears in list without description)
      await loadContextFiles();

      // Start description generation in background (don't await)
      // For images, use the path in the images directory
      generateDescriptionAsync(imagePathForDescription || filePath, fileName, isImage);
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.error('Failed to upload file', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsUploading(false);
      setUploadingFileName(null);
    }
  };

  // Handle file drop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Process files sequentially
    for (const file of files) {
      await uploadFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);
  };

  // Handle file import via button
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await uploadFile(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle create markdown
  const handleCreateMarkdown = async () => {
    const contextPath = getContextPath();
    if (!contextPath || !newMarkdownName.trim()) return;

    try {
      const api = getElectronAPI();
      let filename = newMarkdownName.trim();

      // Add .md extension if not provided
      if (!filename.includes('.')) {
        filename += '.md';
      }

      const filePath = `${contextPath}/${filename}`;

      // Write markdown file
      await api.writeFile(filePath, newMarkdownContent);

      // Save description if provided
      if (newMarkdownDescription.trim()) {
        const metadata = await loadMetadata();
        metadata.files[filename] = { description: newMarkdownDescription.trim() };
        await saveMetadata(metadata);
      }

      // Reload files
      await loadContextFiles();

      // Reset and close modal
      setIsCreateMarkdownOpen(false);
      setNewMarkdownName('');
      setNewMarkdownDescription('');
      setNewMarkdownContent('');
    } catch (error) {
      console.error('Failed to create markdown:', error);
    }
  };

  // Delete selected file
  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    try {
      const api = getElectronAPI();
      await api.deleteFile(selectedFile.path);

      // Remove from metadata
      const metadata = await loadMetadata();
      delete metadata.files[selectedFile.name];
      await saveMetadata(metadata);

      setIsDeleteDialogOpen(false);
      setSelectedFile(null);
      setEditedContent('');
      setHasChanges(false);
      await loadContextFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  // Rename selected file
  const handleRenameFile = async () => {
    const contextPath = getContextPath();
    if (!selectedFile || !contextPath || !renameFileName.trim()) return;

    const newName = renameFileName.trim();
    if (newName === selectedFile.name) {
      setIsRenameDialogOpen(false);
      return;
    }

    try {
      const api = getElectronAPI();
      const newPath = `${contextPath}/${newName}`;

      // Check if file with new name already exists
      const exists = await api.exists(newPath);
      if (exists) {
        console.error('A file with this name already exists');
        return;
      }

      // Read current file content
      const result = await api.readFile(selectedFile.path);
      if (!result.success || result.content === undefined) {
        console.error('Failed to read file for rename');
        return;
      }

      // Write to new path
      await api.writeFile(newPath, result.content);

      // Delete old file
      await api.deleteFile(selectedFile.path);

      // Update metadata
      const metadata = await loadMetadata();
      if (metadata.files[selectedFile.name]) {
        metadata.files[newName] = metadata.files[selectedFile.name];
        delete metadata.files[selectedFile.name];
        await saveMetadata(metadata);
      }

      setIsRenameDialogOpen(false);
      setRenameFileName('');

      // Reload files and select the renamed file
      await loadContextFiles();

      // Update selected file with new name and path
      const renamedFile: ContextFile = {
        name: newName,
        type: isImageFile(newName) ? 'image' : 'text',
        path: newPath,
        content: result.content,
        description: metadata.files[newName]?.description,
      };
      setSelectedFile(renamedFile);
    } catch (error) {
      console.error('Failed to rename file:', error);
    }
  };

  // Save edited description
  const handleSaveDescription = async () => {
    if (!editDescriptionFileName) return;

    try {
      const metadata = await loadMetadata();
      metadata.files[editDescriptionFileName] = { description: editDescriptionValue.trim() };
      await saveMetadata(metadata);

      // Update selected file if it's the one being edited
      if (selectedFile?.name === editDescriptionFileName) {
        setSelectedFile({ ...selectedFile, description: editDescriptionValue.trim() });
      }

      // Reload files to update list
      await loadContextFiles();

      setIsEditDescriptionOpen(false);
      setEditDescriptionValue('');
      setEditDescriptionFileName('');
    } catch (error) {
      console.error('Failed to save description:', error);
    }
  };

  // Open edit description dialog
  const handleEditDescription = (file: ContextFile) => {
    setEditDescriptionFileName(file.name);
    setEditDescriptionValue(file.description || '');
    setIsEditDescriptionOpen(true);
  };

  // Delete file from list (used by dropdown)
  const handleDeleteFromList = async (file: ContextFile) => {
    try {
      const api = getElectronAPI();
      await api.deleteFile(file.path);

      // Remove from metadata
      const metadata = await loadMetadata();
      delete metadata.files[file.name];
      await saveMetadata(metadata);

      // Clear selection if this was the selected file
      if (selectedFile?.path === file.path) {
        setSelectedFile(null);
        setEditedContent('');
        setHasChanges(false);
      }

      await loadContextFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="context-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="context-view-loading">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="context-view">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        data-testid="file-import-input"
      />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Context Files</h1>
            <p className="text-sm text-muted-foreground">
              Add context files to include in AI prompts
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            disabled={isUploading}
            data-testid="import-file-button"
          >
            <FileUp className="w-4 h-4 mr-2" />
            Import File
          </Button>
          <HotkeyButton
            size="sm"
            onClick={() => setIsCreateMarkdownOpen(true)}
            hotkey={shortcuts.addContextFile}
            hotkeyActive={false}
            data-testid="create-markdown-button"
          >
            <FilePlus className="w-4 h-4 mr-2" />
            Create Markdown
          </HotkeyButton>
        </div>
      </div>

      {/* Main content area with file list and editor */}
      <div
        className={cn(
          'flex-1 flex overflow-hidden relative',
          isDropHovering && 'ring-2 ring-primary ring-inset'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="context-drop-zone"
      >
        {/* Drop overlay */}
        {isDropHovering && (
          <div className="absolute inset-0 bg-primary/10 z-50 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center text-primary">
              <Upload className="w-12 h-12 mb-2" />
              <span className="text-lg font-medium">Drop files to upload</span>
              <span className="text-sm text-muted-foreground">
                Files will be analyzed automatically
              </span>
            </div>
          </div>
        )}

        {/* Uploading overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-background/80 z-50 flex items-center justify-center">
            <div className="flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
              <span className="text-sm font-medium">Uploading {uploadingFileName}...</span>
            </div>
          </div>
        )}

        {/* Left Panel - File List */}
        <div className="w-64 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Context Files ({contextFiles.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2" data-testid="context-file-list">
            {contextFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No context files yet.
                  <br />
                  Drop files here or use the buttons above.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {contextFiles.map((file) => {
                  const isGenerating = generatingDescriptions.has(file.name);
                  return (
                    <div
                      key={file.path}
                      onClick={() => handleSelectFile(file)}
                      className={cn(
                        'group w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer',
                        selectedFile?.path === file.path
                          ? 'bg-primary/20 text-foreground border border-primary/30'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                      data-testid={`context-file-${file.name}`}
                    >
                      {file.type === 'image' ? (
                        <ImageIcon className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm block">{file.name}</span>
                        {isGenerating ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Generating description...
                          </span>
                        ) : file.description ? (
                          <span className="truncate text-xs text-muted-foreground block">
                            {file.description}
                          </span>
                        ) : null}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity"
                            data-testid={`context-file-menu-${file.name}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameFileName(file.name);
                              setSelectedFile(file);
                              setIsRenameDialogOpen(true);
                            }}
                            data-testid={`rename-context-file-${file.name}`}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteFromList(file)}
                            className="text-red-500 focus:text-red-500"
                            data-testid={`delete-context-file-${file.name}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Editor/Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile ? (
            <>
              {/* File toolbar */}
              <div className="flex items-center justify-between p-3 border-b border-border bg-card">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedFile.type === 'image' ? (
                    <ImageIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                </div>
                <div className="flex gap-2">
                  {selectedFile.type === 'text' && isMarkdownFile(selectedFile.name) && (
                    <Button
                      variant={'outline'}
                      size="sm"
                      onClick={() => setIsPreviewMode(!isPreviewMode)}
                      data-testid="toggle-preview-mode"
                    >
                      {isPreviewMode ? (
                        <>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </>
                      )}
                    </Button>
                  )}
                  {selectedFile.type === 'text' && (
                    <Button
                      size="sm"
                      onClick={saveFile}
                      disabled={!hasChanges || isSaving}
                      data-testid="save-context-file"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? 'Saving...' : hasChanges ? 'Save' : 'Saved'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="text-red-500 hover:text-red-400 hover:border-red-500/50"
                    data-testid="delete-context-file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Description section */}
              <div className="px-4 pt-4 pb-2">
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Description
                      </span>
                      {generatingDescriptions.has(selectedFile.name) ? (
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generating description with AI...</span>
                        </div>
                      ) : selectedFile.description ? (
                        <p className="text-sm mt-1">{selectedFile.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1 italic">
                          No description. Click edit to add one.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditDescription(selectedFile)}
                      className="flex-shrink-0"
                      data-testid="edit-description-button"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-hidden px-4 pb-4">
                {selectedFile.type === 'image' ? (
                  <div
                    className="h-full flex items-center justify-center bg-card rounded-lg"
                    data-testid="image-preview"
                  >
                    <img
                      src={editedContent}
                      alt={selectedFile.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : isPreviewMode ? (
                  <Card className="h-full overflow-auto p-4" data-testid="markdown-preview">
                    <Markdown>{editedContent}</Markdown>
                  </Card>
                ) : (
                  <Card className="h-full overflow-hidden">
                    <textarea
                      className="w-full h-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none"
                      value={editedContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      placeholder="Enter context content here..."
                      spellCheck={false}
                      data-testid="context-editor"
                    />
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <File className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground-secondary">Select a file to view or edit</p>
                <p className="text-muted-foreground text-sm mt-1">Or drop files here to add them</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Markdown Dialog */}
      <Dialog open={isCreateMarkdownOpen} onOpenChange={setIsCreateMarkdownOpen}>
        <DialogContent
          data-testid="create-markdown-dialog"
          className="w-[60vw] max-w-[60vw] max-h-[80vh] flex flex-col"
        >
          <DialogHeader>
            <DialogTitle>Create Markdown Context</DialogTitle>
            <DialogDescription>
              Create a new markdown file to add context for AI prompts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-auto">
            <div className="space-y-2">
              <Label htmlFor="markdown-filename">File Name</Label>
              <Input
                id="markdown-filename"
                value={newMarkdownName}
                onChange={(e) => setNewMarkdownName(e.target.value)}
                placeholder="context-file.md"
                data-testid="new-markdown-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="markdown-description">
                Description (for AI to understand the context)
              </Label>
              <Input
                id="markdown-description"
                value={newMarkdownDescription}
                onChange={(e) => setNewMarkdownDescription(e.target.value)}
                placeholder="e.g., Coding style guidelines for this project"
                data-testid="new-markdown-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="markdown-content">Content</Label>
              <textarea
                id="markdown-content"
                value={newMarkdownContent}
                onChange={(e) => setNewMarkdownContent(e.target.value)}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  // Try files first, then items for better compatibility
                  let files = Array.from(e.dataTransfer.files);
                  if (files.length === 0 && e.dataTransfer.items) {
                    const items = Array.from(e.dataTransfer.items);
                    files = items
                      .filter((item) => item.kind === 'file')
                      .map((item) => item.getAsFile())
                      .filter((f): f is globalThis.File => f !== null);
                  }

                  const mdFile = files.find((f) => isMarkdownFile(f.name));
                  if (mdFile) {
                    const content = await mdFile.text();
                    setNewMarkdownContent(content);
                    if (!newMarkdownName.trim()) {
                      setNewMarkdownName(mdFile.name);
                    }
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                placeholder="Enter your markdown content here..."
                className="w-full h-60 p-3 font-mono text-sm bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                spellCheck={false}
                data-testid="new-markdown-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateMarkdownOpen(false);
                setNewMarkdownName('');
                setNewMarkdownDescription('');
                setNewMarkdownContent('');
              }}
            >
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleCreateMarkdown}
              disabled={!newMarkdownName.trim()}
              hotkey={{ key: 'Enter', cmdCtrl: true }}
              hotkeyActive={isCreateMarkdownOpen}
              data-testid="confirm-create-markdown"
            >
              Create
            </HotkeyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent data-testid="delete-context-dialog">
          <DialogHeader>
            <DialogTitle>Delete Context File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedFile?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFile}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-file"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent data-testid="rename-context-dialog">
          <DialogHeader>
            <DialogTitle>Rename Context File</DialogTitle>
            <DialogDescription>Enter a new name for "{selectedFile?.name}".</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-filename">File Name</Label>
              <Input
                id="rename-filename"
                value={renameFileName}
                onChange={(e) => setRenameFileName(e.target.value)}
                placeholder="Enter new filename"
                data-testid="rename-file-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameFileName.trim()) {
                    handleRenameFile();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRenameDialogOpen(false);
                setRenameFileName('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameFile}
              disabled={!renameFileName.trim() || renameFileName === selectedFile?.name}
              data-testid="confirm-rename-file"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Description Dialog */}
      <Dialog open={isEditDescriptionOpen} onOpenChange={setIsEditDescriptionOpen}>
        <DialogContent data-testid="edit-description-dialog">
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
            <DialogDescription>
              Update the description for "{editDescriptionFileName}". This helps AI understand the
              context.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescriptionValue}
                onChange={(e) => setEditDescriptionValue(e.target.value)}
                placeholder="e.g., API documentation for authentication endpoints..."
                className="min-h-[100px]"
                data-testid="edit-description-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDescriptionOpen(false);
                setEditDescriptionValue('');
                setEditDescriptionFileName('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveDescription} data-testid="confirm-save-description">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
