import { useEffect, useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Code } from 'lucide-react';
import { cn } from '@/lib/utils';

const logger = createLogger('CodeView');

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeNode[];
  isExpanded?: boolean;
}

const IGNORE_PATTERNS = ['node_modules', '.git', '.next', 'dist', 'build', '.DS_Store', '*.log'];

const shouldIgnore = (name: string) => {
  return IGNORE_PATTERNS.some((pattern) => {
    if (pattern.startsWith('*')) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
};

export function CodeView() {
  const { currentProject } = useAppStore();
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Load directory tree
  const loadTree = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = getElectronAPI();
      const result = await api.readdir(currentProject.path);

      if (result.success && result.entries) {
        const entries = result.entries
          .filter((e) => !shouldIgnore(e.name))
          .sort((a, b) => {
            // Directories first
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          })
          .map((e) => ({
            name: e.name,
            path: `${currentProject.path}/${e.name}`,
            isDirectory: e.isDirectory,
          }));

        setFileTree(entries);
      }
    } catch (error) {
      logger.error('Failed to load file tree:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Load subdirectory
  const loadSubdirectory = async (path: string): Promise<FileTreeNode[]> => {
    try {
      const api = getElectronAPI();
      const result = await api.readdir(path);

      if (result.success && result.entries) {
        return result.entries
          .filter((e) => !shouldIgnore(e.name))
          .sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          })
          .map((e) => ({
            name: e.name,
            path: `${path}/${e.name}`,
            isDirectory: e.isDirectory,
          }));
      }
    } catch (error) {
      logger.error('Failed to load subdirectory:', error);
    }
    return [];
  };

  // Load file content
  const loadFileContent = async (path: string) => {
    try {
      const api = getElectronAPI();
      const result = await api.readFile(path);

      if (result.success && result.content) {
        setFileContent(result.content);
        setSelectedFile(path);
      }
    } catch (error) {
      logger.error('Failed to load file:', error);
    }
  };

  // Toggle folder expansion
  const toggleFolder = async (node: FileTreeNode) => {
    const newExpanded = new Set(expandedFolders);

    if (expandedFolders.has(node.path)) {
      newExpanded.delete(node.path);
    } else {
      newExpanded.add(node.path);

      // Load children if not already loaded
      if (!node.children) {
        const children = await loadSubdirectory(node.path);
        // Update the tree with children
        const updateTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map((n) => {
            if (n.path === node.path) {
              return { ...n, children };
            }
            if (n.children) {
              return { ...n, children: updateTree(n.children) };
            }
            return n;
          });
        };
        setFileTree(updateTree(fileTree));
      }
    }

    setExpandedFolders(newExpanded);
  };

  // Render file tree node
  const renderNode = (node: FileTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;

    return (
      <div key={node.path}>
        <div
          className={cn(
            'flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted/50',
            isSelected && 'bg-muted'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (node.isDirectory) {
              toggleFolder(node);
            } else {
              loadFileContent(node.path);
            }
          }}
          data-testid={`file-tree-item-${node.name}`}
        >
          {node.isDirectory ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-primary shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-4" />
              <File className="w-4 h-4 text-muted-foreground shrink-0" />
            </>
          )}
          <span className="text-sm truncate">{node.name}</span>
        </div>
        {node.isDirectory && isExpanded && node.children && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="code-view-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="code-view-loading">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="code-view">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Code className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Code Explorer</h1>
            <p className="text-sm text-muted-foreground">{currentProject.name}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadTree} data-testid="refresh-tree">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Tree */}
        <div className="w-64 border-r overflow-y-auto" data-testid="file-tree">
          <div className="p-2">{fileTree.map((node) => renderNode(node))}</div>
        </div>

        {/* Code Preview */}
        <div className="flex-1 overflow-hidden">
          {selectedFile ? (
            <div className="h-full flex flex-col">
              <div className="px-4 py-2 border-b bg-muted/30">
                <p className="text-sm font-mono text-muted-foreground truncate">
                  {selectedFile.replace(currentProject.path, '')}
                </p>
              </div>
              <Card className="flex-1 m-4 overflow-hidden">
                <CardContent className="p-0 h-full">
                  <pre className="p-4 h-full overflow-auto text-sm font-mono whitespace-pre-wrap">
                    <code data-testid="code-content">{fileContent}</code>
                  </pre>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">Select a file to view its contents</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
