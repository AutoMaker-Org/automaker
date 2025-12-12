"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Card } from "@/components/ui/card";
import {
  Plus,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Trash2,
  Save,
  Upload,
  File,
  X,
  BookOpen,
} from "lucide-react";
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ContextFile {
  name: string;
  type: "text" | "image";
  content?: string;
  path: string;
}

export function ContextView() {
  const { currentProject } = useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ContextFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileType, setNewFileType] = useState<"text" | "image">("text");
  const [uploadedImageData, setUploadedImageData] = useState<string | null>(
    null
  );
  const [newFileContent, setNewFileContent] = useState("");
  const [isDropHovering, setIsDropHovering] = useState(false);

  // Keyboard shortcuts for this view
  const contextShortcuts: KeyboardShortcut[] = useMemo(
    () => [
      {
        key: shortcuts.addContextFile,
        action: () => setIsAddDialogOpen(true),
        description: "Add new context file",
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

  // Determine if a file is an image based on extension
  const isImageFile = (filename: string): boolean => {
    const imageExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
    ];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
    return imageExtensions.includes(ext);
  };

  // Load context files
  const loadContextFiles = useCallback(async () => {
    const contextPath = getContextPath();
    if (!contextPath || !isBootstrapped()) return;

    setIsLoading(true);
    try {
      // Ensure context directory exists
      await services.fileSystem.mkdir(contextPath);

      // Read directory contents
      const result = await services.fileSystem.readdir(contextPath);
      if (result.success && result.data) {
        const files: ContextFile[] = result.data
          .filter((entry) => entry.isFile)
          .map((entry) => ({
            name: entry.name,
            type: isImageFile(entry.name) ? "image" : "text",
            path: `${contextPath}/${entry.name}`,
          }));
        setContextFiles(files);
      }
    } catch (error) {
      console.error("Failed to load context files:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getContextPath]);

  useEffect(() => {
    loadContextFiles();
  }, [loadContextFiles]);

  // Load selected file content
  const loadFileContent = useCallback(async (file: ContextFile) => {
    if (!isBootstrapped()) return;

    try {
      const result = await services.fileSystem.readFile(file.path);
      if (result.success && result.data !== undefined) {
        setEditedContent(result.data);
        setSelectedFile({ ...file, content: result.data });
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to load file content:", error);
    }
  }, []);

  // Select a file
  const handleSelectFile = (file: ContextFile) => {
    if (hasChanges) {
      // Could add a confirmation dialog here
    }
    loadFileContent(file);
  };

  // Save current file
  const saveFile = async () => {
    if (!selectedFile || !isBootstrapped()) return;

    setIsSaving(true);
    try {
      await services.fileSystem.writeFile(selectedFile.path, editedContent);
      setSelectedFile({ ...selectedFile, content: editedContent });
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save file:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle content change
  const handleContentChange = (value: string) => {
    setEditedContent(value);
    setHasChanges(true);
  };

  // Add new context file
  const handleAddFile = async () => {
    const contextPath = getContextPath();
    if (!contextPath || !newFileName.trim() || !isBootstrapped()) return;

    try {
      let filename = newFileName.trim();

      // Add default extension if not provided
      if (newFileType === "text" && !filename.includes(".")) {
        filename += ".md";
      }

      const filePath = `${contextPath}/${filename}`;

      if (newFileType === "image" && uploadedImageData) {
        // Write image data
        await services.fileSystem.writeFile(filePath, uploadedImageData);
      } else {
        // Write text file with content (or empty if no content)
        await services.fileSystem.writeFile(filePath, newFileContent);
      }

      setIsAddDialogOpen(false);
      setNewFileName("");
      setNewFileType("text");
      setUploadedImageData(null);
      setNewFileContent("");
      setIsDropHovering(false);
      await loadContextFiles();
    } catch (error) {
      console.error("Failed to add file:", error);
    }
  };

  // Delete selected file
  const handleDeleteFile = async () => {
    if (!selectedFile || !isBootstrapped()) return;

    try {
      await services.fileSystem.deleteFile(selectedFile.path);

      setIsDeleteDialogOpen(false);
      setSelectedFile(null);
      setEditedContent("");
      setHasChanges(false);
      await loadContextFiles();
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setUploadedImageData(base64);
      if (!newFileName) {
        setNewFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle drag and drop for file upload
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isBootstrapped()) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const contextPath = getContextPath();
    if (!contextPath) return;

    for (const file of files) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        const filePath = `${contextPath}/${file.name}`;
        await services.fileSystem.writeFile(filePath, content);
        await loadContextFiles();
      };

      if (isImageFile(file.name)) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Handle drag and drop for .txt and .md files in the add context dialog textarea
  const handleTextAreaDrop = async (
    e: React.DragEvent<HTMLTextAreaElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0]; // Only handle the first file
    const fileName = file.name.toLowerCase();

    // Only accept .txt and .md files
    if (!fileName.endsWith(".txt") && !fileName.endsWith(".md")) {
      console.warn("Only .txt and .md files are supported for drag and drop");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setNewFileContent(content);

      // Auto-fill filename if empty
      if (!newFileName) {
        setNewFileName(file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleTextAreaDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(true);
  };

  const handleTextAreaDragLeave = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropHovering(false);
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
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="context-view-loading"
      >
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="context-view"
    >
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
          <HotkeyButton
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            hotkey={shortcuts.addContextFile}
            hotkeyActive={false}
            data-testid="add-context-file"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add File
          </HotkeyButton>
        </div>
      </div>

      {/* Main content area with file list and editor */}
      <div
        className="flex-1 flex overflow-hidden"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {/* Left Panel - File List */}
        <div className="w-64 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Context Files ({contextFiles.length})
            </h2>
          </div>
          <div
            className="flex-1 overflow-y-auto p-2"
            data-testid="context-file-list"
          >
            {contextFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No context files yet.
                  <br />
                  Drop files here or click Add File.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {contextFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => handleSelectFile(file)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors",
                      selectedFile?.path === file.path
                        ? "bg-primary/20 text-foreground border border-primary/30"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    data-testid={`context-file-${file.name}`}
                  >
                    {file.type === "image" ? (
                      <ImageIcon className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="truncate text-sm">{file.name}</span>
                  </button>
                ))}
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
                <div className="flex items-center gap-2">
                  {selectedFile.type === "image" ? (
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {selectedFile.name}
                  </span>
                </div>
                <div className="flex gap-2">
                  {selectedFile.type === "text" && (
                    <Button
                      size="sm"
                      onClick={saveFile}
                      disabled={!hasChanges || isSaving}
                      data-testid="save-context-file"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? "Saving..." : hasChanges ? "Save" : "Saved"}
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

              {/* Content area */}
              <div className="flex-1 overflow-hidden p-4">
                {selectedFile.type === "image" ? (
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
                <p className="text-foreground-secondary">
                  Select a file to view or edit
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  Or drop files here to add them
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add File Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent
          data-testid="add-context-dialog"
          className="w-[60vw] max-w-[60vw] max-h-[80vh] flex flex-col"
        >
          <DialogHeader>
            <DialogTitle>Add Context File</DialogTitle>
            <DialogDescription>
              Add a new text or image file to the context.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button
                variant={newFileType === "text" ? "default" : "outline"}
                size="sm"
                onClick={() => setNewFileType("text")}
                data-testid="add-text-type"
              >
                <FileText className="w-4 h-4 mr-2" />
                Text
              </Button>
              <Button
                variant={newFileType === "image" ? "default" : "outline"}
                size="sm"
                onClick={() => setNewFileType("image")}
                data-testid="add-image-type"
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Image
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filename">File Name</Label>
              <Input
                id="filename"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder={
                  newFileType === "text" ? "context.md" : "image.png"
                }
                data-testid="new-file-name"
              />
            </div>

            {newFileType === "text" && (
              <div className="space-y-2">
                <Label htmlFor="context-content">Context Content</Label>
                <div
                  className={cn(
                    "relative rounded-lg transition-colors",
                    isDropHovering && "ring-2 ring-primary"
                  )}
                >
                  <textarea
                    id="context-content"
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    onDrop={handleTextAreaDrop}
                    onDragOver={handleTextAreaDragOver}
                    onDragLeave={handleTextAreaDragLeave}
                    placeholder="Enter context content here or drag & drop a .txt or .md file..."
                    className={cn(
                      "w-full h-40 p-3 font-mono text-sm bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
                      isDropHovering && "border-primary bg-primary/10"
                    )}
                    spellCheck={false}
                    data-testid="new-file-content"
                  />
                  {isDropHovering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/20 rounded-lg pointer-events-none">
                      <div className="flex flex-col items-center text-primary">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-sm font-medium">
                          Drop .txt or .md file here
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Drag & drop .txt or .md files to import their content
                </p>
              </div>
            )}

            {newFileType === "image" && (
              <div className="space-y-2">
                <Label>Upload Image</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                    data-testid="image-upload-input"
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    {uploadedImageData ? (
                      <img
                        src={uploadedImageData}
                        alt="Preview"
                        className="max-w-32 max-h-32 object-contain mb-2"
                      />
                    ) : (
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {uploadedImageData
                        ? "Click to change"
                        : "Click to upload"}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setNewFileName("");
                setUploadedImageData(null);
                setNewFileContent("");
                setIsDropHovering(false);
              }}
            >
              Cancel
            </Button>
            <HotkeyButton
              onClick={handleAddFile}
              disabled={
                !newFileName.trim() ||
                (newFileType === "image" && !uploadedImageData)
              }
              hotkey={{ key: "Enter", cmdCtrl: true }}
              hotkeyActive={isAddDialogOpen}
              data-testid="confirm-add-file"
            >
              Add File
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
              Are you sure you want to delete "{selectedFile?.name}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
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
    </div>
  );
}
