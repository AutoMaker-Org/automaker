import { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, FileText, Image, Loader2, Upload, FilePlus } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { sanitizeFilename } from '@/lib/image-utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ContextFile {
  name: string;
  type: 'text' | 'image';
  path: string;
  description?: string;
}

interface ContextMetadata {
  files: Record<string, { description: string }>;
}

export function ContextPanel() {
  const { currentProject } = useAppStore();
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDropHovering, setIsDropHovering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [generatingDescriptions, setGeneratingDescriptions] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper functions
  const isImageFile = (filename: string): boolean => {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return imageExtensions.includes(ext);
  };

  const getContextPath = useCallback(() => {
    if (!currentProject) return null;
    return `${currentProject.path}/.automaker/context`;
  }, [currentProject]);

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

  const loadContextFiles = useCallback(async () => {
    const contextPath = getContextPath();
    if (!contextPath) return;

    setLoading(true);
    try {
      const api = getElectronAPI();

      // Ensure context directory exists
      await api.mkdir(contextPath);

      // Load metadata for descriptions
      const metadata = await loadMetadata();

      // Read directory contents
      const result = await api.readdir(contextPath);
      if (result.success && result.entries) {
        const contextFiles: ContextFile[] = result.entries
          .filter((entry) => entry.isFile && entry.name !== 'context-metadata.json')
          .map((entry) => ({
            name: entry.name,
            type: isImageFile(entry.name) ? 'image' : 'text',
            path: `${contextPath}/${entry.name}`,
            description: metadata.files[entry.name]?.description,
          }));
        setFiles(contextFiles);
      }
    } catch (error) {
      console.error('Error loading context files:', error);
    } finally {
      setLoading(false);
    }
  }, [getContextPath, loadMetadata]);

  useEffect(() => {
    loadContextFiles();
  }, [loadContextFiles]);

  const handleSelectFile = useCallback(async (file: ContextFile) => {
    if (file.type === 'image') {
      setSelectedFile(file);
      setFileContent('');
      return;
    }

    try {
      const api = getElectronAPI();
      const result = await api.readFile(file.path);
      if (result.success && result.content) {
        setSelectedFile(file);
        setFileContent(result.content);
      }
    } catch (error) {
      console.error('Error reading file:', error);
    }
  }, []);

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
    } catch (error) {
      console.error('Failed to generate description:', error);
    }
    return undefined;
  };

  // Generate description in background and update metadata
  const generateDescriptionAsync = useCallback(
    async (filePath: string, fileName: string, isImage: boolean) => {
      setGeneratingDescriptions((prev) => new Set(prev).add(fileName));

      try {
        const description = await generateDescription(filePath, fileName, isImage);

        if (description) {
          const metadata = await loadMetadata();
          metadata.files[fileName] = { description };
          await saveMetadata(metadata);
          await loadContextFiles();

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
        setGeneratingDescriptions((prev) => {
          const next = new Set(prev);
          next.delete(fileName);
          return next;
        });
      }
    },
    [loadMetadata, saveMetadata, loadContextFiles]
  );

  // Upload a file
  const uploadFile = async (file: globalThis.File) => {
    const contextPath = getContextPath();
    if (!contextPath) return;

    setIsUploading(true);

    try {
      const api = getElectronAPI();
      const isImage = isImageFile(file.name);

      let filePath: string;
      let fileName: string;
      let imagePathForDescription: string | undefined;

      if (isImage) {
        fileName = sanitizeFilename(file.name);

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        const base64Data = dataUrl.split(',')[1] || dataUrl;
        const mimeType = file.type || 'image/png';

        const saveResult = await api.saveImageToTemp?.(
          base64Data,
          fileName,
          mimeType,
          currentProject!.path
        );

        if (!saveResult?.success || !saveResult.path) {
          throw new Error(saveResult?.error || 'Failed to save image');
        }

        imagePathForDescription = saveResult.path;
        filePath = `${contextPath}/${fileName}`;
        await api.writeFile(filePath, dataUrl);
      } else {
        fileName = file.name;
        filePath = `${contextPath}/${fileName}`;

        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsText(file);
        });

        await api.writeFile(filePath, content);
      }

      await loadContextFiles();
      generateDescriptionAsync(imagePathForDescription || filePath, fileName, isImage);
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.error('Failed to upload file', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file drop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    for (const file of droppedFiles) {
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
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;

    for (const file of Array.from(inputFiles)) {
      await uploadFile(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn('h-full flex relative', isDropHovering && 'ring-2 ring-primary ring-inset')}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Drop overlay */}
      {isDropHovering && (
        <div className="absolute inset-0 bg-primary/10 z-50 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center text-primary">
            <Upload className="w-8 h-8 mb-1" />
            <span className="text-sm font-medium">Drop files to upload</span>
          </div>
        </div>
      )}

      {/* Uploading overlay */}
      {isUploading && (
        <div className="absolute inset-0 bg-background/80 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-1" />
            <span className="text-xs font-medium">Uploading...</span>
          </div>
        </div>
      )}

      {/* File List */}
      <div className="w-48 border-r border-border/50 flex flex-col">
        <div className="flex items-center justify-between px-2 py-2 border-b border-border/50">
          <span className="text-xs font-medium">Files</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={handleImportClick}
            disabled={isUploading}
            title="Import file"
          >
            <FilePlus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-1 space-y-0.5">
            {files.length === 0 ? (
              <div className="text-center py-4 px-2">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1" />
                <p className="text-[10px] text-muted-foreground">
                  No context files.
                  <br />
                  Drop files here or click +
                </p>
              </div>
            ) : (
              files.map((file) => {
                const isGenerating = generatingDescriptions.has(file.name);
                return (
                  <button
                    key={file.name}
                    onClick={() => handleSelectFile(file)}
                    className={cn(
                      'w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left',
                      'text-xs transition-colors',
                      selectedFile?.name === file.name
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    )}
                  >
                    {file.type === 'image' ? (
                      <Image className="h-3 w-3 shrink-0" />
                    ) : (
                      <FileText className="h-3 w-3 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{file.name}</span>
                      {isGenerating && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Loader2 className="h-2 w-2 animate-spin" />
                          Generating...
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Content Preview */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <span className="text-xs font-medium">{selectedFile?.name || 'Select a file'}</span>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-3">
            {selectedFile ? (
              selectedFile.type === 'image' ? (
                <div className="text-center">
                  <Image className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Image preview not available in panel
                  </p>
                </div>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {fileContent || 'No content'}
                </pre>
              )
            ) : (
              <div className="text-center py-8">
                <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">Select a file to preview</p>
                <p className="text-[10px] text-muted-foreground mt-1">Or drop files to add them</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
