import { useEffect, useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  RefreshCw,
  FileText,
  Trash2,
  Save,
  Brain,
  Eye,
  Pencil,
  FilePlus,
  MoreVertical,
} from 'lucide-react';
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
import { Markdown } from '../ui/markdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const logger = createLogger('MemoryView');

interface MemoryFile {
  name: string;
  content?: string;
  path: string;
}

export function MemoryView() {
  const { currentProject } = useAppStore();
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameFileName, setRenameFileName] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(true);

  // Create Memory file modal state
  const [isCreateMemoryOpen, setIsCreateMemoryOpen] = useState(false);
  const [newMemoryName, setNewMemoryName] = useState('');
  const [newMemoryContent, setNewMemoryContent] = useState('');

  // Get memory directory path
  const getMemoryPath = useCallback(() => {
    if (!currentProject) return null;
    return `${currentProject.path}/.automaker/memory`;
  }, [currentProject]);

  const isMarkdownFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return ext === '.md' || ext === '.markdown';
  };

  // Load memory files
  const loadMemoryFiles = useCallback(async () => {
    const memoryPath = getMemoryPath();
    if (!memoryPath) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();

      // Ensure memory directory exists
      await api.mkdir(memoryPath);

      // Read directory contents
      const result = await api.readdir(memoryPath);
      if (result.success && result.entries) {
        const files: MemoryFile[] = result.entries
          .filter((entry) => entry.isFile && isMarkdownFile(entry.name))
          .map((entry) => ({
            name: entry.name,
            path: `${memoryPath}/${entry.name}`,
          }));
        setMemoryFiles(files);
      }
    } catch (error) {
      logger.error('Failed to load memory files:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getMemoryPath]);

  useEffect(() => {
    loadMemoryFiles();
  }, [loadMemoryFiles]);

  // Load selected file content
  const loadFileContent = useCallback(async (file: MemoryFile) => {
    try {
      const api = getElectronAPI();
      const result = await api.readFile(file.path);
      if (result.success && result.content !== undefined) {
        setEditedContent(result.content);
        setSelectedFile({ ...file, content: result.content });
        setHasChanges(false);
      }
    } catch (error) {
      logger.error('Failed to load file content:', error);
    }
  }, []);

  // Select a file
  const handleSelectFile = (file: MemoryFile) => {
    if (hasChanges) {
      // Could add a confirmation dialog here
    }
    loadFileContent(file);
    setIsPreviewMode(true);
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
      logger.error('Failed to save file:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle content change
  const handleContentChange = (value: string) => {
    setEditedContent(value);
    setHasChanges(true);
  };

  // Handle create memory file
  const handleCreateMemory = async () => {
    const memoryPath = getMemoryPath();
    if (!memoryPath || !newMemoryName.trim()) return;

    try {
      const api = getElectronAPI();
      let filename = newMemoryName.trim();

      // Add .md extension if not provided
      if (!filename.includes('.')) {
        filename += '.md';
      }

      const filePath = `${memoryPath}/${filename}`;

      // Write memory file
      await api.writeFile(filePath, newMemoryContent);

      // Reload files
      await loadMemoryFiles();

      // Reset and close modal
      setIsCreateMemoryOpen(false);
      setNewMemoryName('');
      setNewMemoryContent('');
    } catch (error) {
      logger.error('Failed to create memory file:', error);
      setIsCreateMemoryOpen(false);
      setNewMemoryName('');
      setNewMemoryContent('');
    }
  };

  // Delete selected file
  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    try {
      const api = getElectronAPI();
      await api.deleteFile(selectedFile.path);

      setIsDeleteDialogOpen(false);
      setSelectedFile(null);
      setEditedContent('');
      setHasChanges(false);
      await loadMemoryFiles();
    } catch (error) {
      logger.error('Failed to delete file:', error);
    }
  };

  // Rename selected file
  const handleRenameFile = async () => {
    const memoryPath = getMemoryPath();
    if (!selectedFile || !memoryPath || !renameFileName.trim()) return;

    let newName = renameFileName.trim();
    // Add .md extension if not provided
    if (!newName.includes('.')) {
      newName += '.md';
    }

    if (newName === selectedFile.name) {
      setIsRenameDialogOpen(false);
      return;
    }

    try {
      const api = getElectronAPI();
      const newPath = `${memoryPath}/${newName}`;

      // Check if file with new name already exists
      const exists = await api.exists(newPath);
      if (exists) {
        logger.error('A file with this name already exists');
        return;
      }

      // Read current file content
      const result = await api.readFile(selectedFile.path);
      if (!result.success || result.content === undefined) {
        logger.error('Failed to read file for rename');
        return;
      }

      // Write to new path
      await api.writeFile(newPath, result.content);

      // Delete old file
      await api.deleteFile(selectedFile.path);

      setIsRenameDialogOpen(false);
      setRenameFileName('');

      // Reload files and select the renamed file
      await loadMemoryFiles();

      // Update selected file with new name and path
      const renamedFile: MemoryFile = {
        name: newName,
        path: newPath,
        content: result.content,
      };
      setSelectedFile(renamedFile);
    } catch (error) {
      logger.error('Failed to rename file:', error);
    }
  };

  // Delete file from list (used by dropdown)
  const handleDeleteFromList = async (file: MemoryFile) => {
    try {
      const api = getElectronAPI();
      await api.deleteFile(file.path);

      // Clear selection if this was the selected file
      if (selectedFile?.path === file.path) {
        setSelectedFile(null);
        setEditedContent('');
        setHasChanges(false);
      }

      await loadMemoryFiles();
    } catch (error) {
      logger.error('Failed to delete file:', error);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="memory-view-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="memory-view-loading">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="memory-view">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Memory Layer</h1>
            <p className="text-sm text-muted-foreground">
              View and edit AI memory files for this project
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMemoryFiles}
            data-testid="refresh-memory-button"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCreateMemoryOpen(true)}
            data-testid="create-memory-button"
          >
            <FilePlus className="w-4 h-4 mr-2" />
            Create Memory File
          </Button>
        </div>
      </div>

      {/* Main content area with file list and editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - File List */}
        <div className="w-64 border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Memory Files ({memoryFiles.length})
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2" data-testid="memory-file-list">
            {memoryFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <Brain className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No memory files yet.
                  <br />
                  Create a memory file to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {memoryFiles.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => handleSelectFile(file)}
                    className={cn(
                      'group w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer',
                      selectedFile?.path === file.path
                        ? 'bg-primary/20 text-foreground border border-primary/30'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                    data-testid={`memory-file-${file.name}`}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm block">{file.name}</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-opacity"
                          data-testid={`memory-file-menu-${file.name}`}
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
                          data-testid={`rename-memory-file-${file.name}`}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteFromList(file)}
                          className="text-red-500 focus:text-red-500"
                          data-testid={`delete-memory-file-${file.name}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
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
                  <Button
                    size="sm"
                    onClick={saveFile}
                    disabled={!hasChanges || isSaving}
                    data-testid="save-memory-file"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? 'Saving...' : hasChanges ? 'Save' : 'Saved'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="text-red-500 hover:text-red-400 hover:border-red-500/50"
                    data-testid="delete-memory-file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-hidden p-4">
                {isPreviewMode ? (
                  <Card className="h-full overflow-auto p-4" data-testid="markdown-preview">
                    <Markdown>{editedContent}</Markdown>
                  </Card>
                ) : (
                  <Card className="h-full overflow-hidden">
                    <textarea
                      className="w-full h-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none"
                      value={editedContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      placeholder="Enter memory content here..."
                      spellCheck={false}
                      data-testid="memory-editor"
                    />
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground-secondary">Select a file to view or edit</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Memory files help AI agents learn from past interactions
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Memory Dialog */}
      <Dialog open={isCreateMemoryOpen} onOpenChange={setIsCreateMemoryOpen}>
        <DialogContent
          data-testid="create-memory-dialog"
          className="w-[60vw] max-w-[60vw] max-h-[80vh] flex flex-col"
        >
          <DialogHeader>
            <DialogTitle>Create Memory File</DialogTitle>
            <DialogDescription>
              Create a new memory file to store learnings and patterns for AI agents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 flex-1 overflow-auto">
            <div className="space-y-2">
              <Label htmlFor="memory-filename">File Name</Label>
              <Input
                id="memory-filename"
                value={newMemoryName}
                onChange={(e) => setNewMemoryName(e.target.value)}
                placeholder="my-learnings.md"
                data-testid="new-memory-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memory-content">Content</Label>
              <textarea
                id="memory-content"
                value={newMemoryContent}
                onChange={(e) => setNewMemoryContent(e.target.value)}
                placeholder="Enter your memory content here..."
                className="w-full h-60 p-3 font-mono text-sm bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                spellCheck={false}
                data-testid="new-memory-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateMemoryOpen(false);
                setNewMemoryName('');
                setNewMemoryContent('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateMemory}
              disabled={!newMemoryName.trim()}
              data-testid="confirm-create-memory"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent data-testid="delete-memory-dialog">
          <DialogHeader>
            <DialogTitle>Delete Memory File</DialogTitle>
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
        <DialogContent data-testid="rename-memory-dialog">
          <DialogHeader>
            <DialogTitle>Rename Memory File</DialogTitle>
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
    </div>
  );
}
