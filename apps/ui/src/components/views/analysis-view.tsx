import { useCallback, useState } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore, FileTreeNode, ProjectAnalysis } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Folder,
  FolderOpen,
  File,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  BarChart3,
  FileCode,
  FileText,
  CheckCircle,
  AlertCircle,
  ListChecks,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn, generateUUID } from '@/lib/utils';

const logger = createLogger('AnalysisView');

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.DS_Store',
  '*.log',
  '.cache',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  '.env',
];

const shouldIgnore = (name: string) => {
  return IGNORE_PATTERNS.some((pattern) => {
    if (pattern.startsWith('*')) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern;
  });
};

const getExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
};

export function AnalysisView() {
  const {
    currentProject,
    projectAnalysis,
    isAnalyzing,
    setProjectAnalysis,
    setIsAnalyzing,
    clearAnalysis,
  } = useAppStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);
  const [specGenerated, setSpecGenerated] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);
  const [isGeneratingFeatureList, setIsGeneratingFeatureList] = useState(false);
  const [featureListGenerated, setFeatureListGenerated] = useState(false);
  const [featureListError, setFeatureListError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Recursively scan directory
  const scanDirectory = useCallback(
    async (path: string, depth: number = 0): Promise<FileTreeNode[]> => {
      if (depth > 10) return []; // Prevent infinite recursion

      const api = getElectronAPI();
      try {
        const result = await api.readdir(path);
        if (!result.success || !result.entries) return [];

        const nodes: FileTreeNode[] = [];
        const entries = result.entries.filter((e) => !shouldIgnore(e.name));

        for (const entry of entries) {
          const fullPath = `${path}/${entry.name}`;
          const node: FileTreeNode = {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory,
            extension: entry.isFile ? getExtension(entry.name) : undefined,
          };

          if (entry.isDirectory) {
            // Recursively scan subdirectories
            node.children = await scanDirectory(fullPath, depth + 1);
          }

          nodes.push(node);
        }

        // Sort: directories first, then files alphabetically
        nodes.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

        return nodes;
      } catch (error) {
        logger.error('Failed to scan directory:', path, error);
        return [];
      }
    },
    []
  );

  // Count files and directories
  const countNodes = (
    nodes: FileTreeNode[]
  ): { files: number; dirs: number; byExt: Record<string, number> } => {
    let files = 0;
    let dirs = 0;
    const byExt: Record<string, number> = {};

    const traverse = (items: FileTreeNode[]) => {
      for (const item of items) {
        if (item.isDirectory) {
          dirs++;
          if (item.children) traverse(item.children);
        } else {
          files++;
          if (item.extension) {
            byExt[item.extension] = (byExt[item.extension] || 0) + 1;
          } else {
            byExt['(no extension)'] = (byExt['(no extension)'] || 0) + 1;
          }
        }
      }
    };

    traverse(nodes);
    return { files, dirs, byExt };
  };

  // Run the analysis
  const runAnalysis = useCallback(async () => {
    if (!currentProject) return;

    setIsAnalyzing(true);
    clearAnalysis();

    try {
      const fileTree = await scanDirectory(currentProject.path);
      const counts = countNodes(fileTree);

      const analysis: ProjectAnalysis = {
        fileTree,
        totalFiles: counts.files,
        totalDirectories: counts.dirs,
        filesByExtension: counts.byExt,
        analyzedAt: new Date().toISOString(),
      };

      setProjectAnalysis(analysis);
    } catch (error) {
      logger.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentProject, setIsAnalyzing, clearAnalysis, scanDirectory, setProjectAnalysis]);

  // Generate app_spec.txt from analysis
  const generateSpec = useCallback(async () => {
    if (!currentProject || !projectAnalysis) return;

    setIsGeneratingSpec(true);
    setSpecError(null);
    setSpecGenerated(false);

    try {
      const api = getElectronAPI();

      // Read key files to understand the project better
      const fileContents: Record<string, string> = {};
      const keyFiles = ['package.json', 'README.md', 'tsconfig.json'];

      // Collect file paths from analysis
      const collectFilePaths = (
        nodes: FileTreeNode[],
        maxDepth: number = 3,
        currentDepth: number = 0
      ): string[] => {
        const paths: string[] = [];
        for (const node of nodes) {
          if (!node.isDirectory) {
            paths.push(node.path);
          } else if (node.children && currentDepth < maxDepth) {
            paths.push(...collectFilePaths(node.children, maxDepth, currentDepth + 1));
          }
        }
        return paths;
      };

      collectFilePaths(projectAnalysis.fileTree);

      // Try to read key configuration files
      for (const keyFile of keyFiles) {
        const filePath = `${currentProject.path}/${keyFile}`;
        const exists = await api.exists(filePath);
        if (exists) {
          const result = await api.readFile(filePath);
          if (result.success && result.content) {
            fileContents[keyFile] = result.content;
          }
        }
      }

      // Detect project type and tech stack
      const detectTechStack = () => {
        const stack: string[] = [];
        const extensions = projectAnalysis.filesByExtension;

        // Check package.json for dependencies
        if (fileContents['package.json']) {
          try {
            const pkg = JSON.parse(fileContents['package.json']);
            if (pkg.dependencies?.react || pkg.dependencies?.['react-dom']) stack.push('React');
            if (pkg.dependencies?.next) stack.push('Next.js');
            if (pkg.dependencies?.vue) stack.push('Vue');
            if (pkg.dependencies?.angular) stack.push('Angular');
            if (pkg.dependencies?.express) stack.push('Express');
            if (pkg.dependencies?.electron) stack.push('Electron');
            if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript)
              stack.push('TypeScript');
            if (pkg.devDependencies?.tailwindcss || pkg.dependencies?.tailwindcss)
              stack.push('Tailwind CSS');
            if (pkg.devDependencies?.playwright || pkg.dependencies?.playwright)
              stack.push('Playwright');
            if (pkg.devDependencies?.jest || pkg.dependencies?.jest) stack.push('Jest');
          } catch {
            // Ignore JSON parse errors
          }
        }

        // Detect by file extensions
        if (extensions['ts'] || extensions['tsx']) stack.push('TypeScript');
        if (extensions['py']) stack.push('Python');
        if (extensions['go']) stack.push('Go');
        if (extensions['rs']) stack.push('Rust');
        if (extensions['java']) stack.push('Java');
        if (extensions['css'] || extensions['scss'] || extensions['sass']) stack.push('CSS/SCSS');

        // Remove duplicates
        return [...new Set(stack)];
      };

      // Get project name from package.json or folder name
      const getProjectName = () => {
        if (fileContents['package.json']) {
          try {
            const pkg = JSON.parse(fileContents['package.json']);
            if (pkg.name) return pkg.name;
          } catch {
            // Ignore JSON parse errors
          }
        }
        // Fall back to folder name
        return currentProject.name;
      };

      // Get project description from package.json or README
      const getProjectDescription = () => {
        if (fileContents['package.json']) {
          try {
            const pkg = JSON.parse(fileContents['package.json']);
            if (pkg.description) return pkg.description;
          } catch {
            // Ignore JSON parse errors
          }
        }
        if (fileContents['README.md']) {
          // Extract first paragraph from README
          const lines = fileContents['README.md'].split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (
              trimmed &&
              !trimmed.startsWith('#') &&
              !trimmed.startsWith('!') &&
              trimmed.length > 20
            ) {
              return trimmed.substring(0, 200);
            }
          }
        }
        return 'A software project';
      };

      // Group files by directory for structure analysis
      const analyzeStructure = () => {
        const structure: string[] = [];
        const topLevelDirs = projectAnalysis.fileTree
          .filter((n: FileTreeNode) => n.isDirectory)
          .map((n: FileTreeNode) => n.name);

        for (const dir of topLevelDirs) {
          structure.push(`      <directory name="${dir}" />`);
        }
        return structure.join('\n');
      };

      const projectName = getProjectName();
      const description = getProjectDescription();
      const techStack = detectTechStack();

      // Generate the spec content
      // Note: Must follow XML format as defined in apps/server/src/lib/app-spec-format.ts
      const specContent = `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    ${description}
  </overview>

  <technology_stack>
    <languages>
${Object.entries(projectAnalysis.filesByExtension)
  .filter(([ext]: [string, number]) =>
    ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'cpp', 'c'].includes(ext)
  )
  .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
  .slice(0, 5)
  .map(([ext, count]: [string, number]) => `      <language ext=".${ext}" count="${count}" />`)
  .join('\n')}
    </languages>
    <frameworks>
${techStack.map((tech) => `      <framework>${tech}</framework>`).join('\n')}
    </frameworks>
  </technology_stack>

  <project_structure>
    <total_files>${projectAnalysis.totalFiles}</total_files>
    <total_directories>${projectAnalysis.totalDirectories}</total_directories>
    <top_level_structure>
${analyzeStructure()}
    </top_level_structure>
  </project_structure>

  <file_breakdown>
${Object.entries(projectAnalysis.filesByExtension)
  .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
  .slice(0, 10)
  .map(
    ([ext, count]: [string, number]) =>
      `    <extension type="${ext.startsWith('(') ? ext : '.' + ext}" count="${count}" />`
  )
  .join('\n')}
  </file_breakdown>

  <analyzed_at>${projectAnalysis.analyzedAt}</analyzed_at>
</project_specification>
`;

      // Write the spec file
      const specPath = `${currentProject.path}/.automaker/app_spec.txt`;
      const writeResult = await api.writeFile(specPath, specContent);

      if (writeResult.success) {
        setSpecGenerated(true);
      } else {
        setSpecError(writeResult.error || 'Failed to write spec file');
      }
    } catch (error) {
      logger.error('Failed to generate spec:', error);
      setSpecError(error instanceof Error ? error.message : 'Failed to generate spec');
    } finally {
      setIsGeneratingSpec(false);
    }
  }, [currentProject, projectAnalysis]);

  // Generate features from analysis and save to .automaker/features folder
  const generateFeatureList = useCallback(async () => {
    if (!currentProject || !projectAnalysis) return;

    setIsGeneratingFeatureList(true);
    setFeatureListError(null);
    setFeatureListGenerated(false);

    try {
      const api = getElectronAPI();

      // Read key files to understand the project
      const fileContents: Record<string, string> = {};
      const keyFiles = ['package.json', 'README.md'];

      // Try to read key configuration files
      for (const keyFile of keyFiles) {
        const filePath = `${currentProject.path}/${keyFile}`;
        const exists = await api.exists(filePath);
        if (exists) {
          const result = await api.readFile(filePath);
          if (result.success && result.content) {
            fileContents[keyFile] = result.content;
          }
        }
      }

      // Collect file paths from analysis
      const collectFilePaths = (nodes: FileTreeNode[]): string[] => {
        const paths: string[] = [];
        for (const node of nodes) {
          if (!node.isDirectory) {
            paths.push(node.path);
          } else if (node.children) {
            paths.push(...collectFilePaths(node.children));
          }
        }
        return paths;
      };

      const allFilePaths = collectFilePaths(projectAnalysis.fileTree);

      // Analyze directories and files to detect features
      interface DetectedFeature {
        category: string;
        description: string;
        passes: boolean;
      }

      const detectedFeatures: DetectedFeature[] = [];

      // Detect features based on project structure and files
      const detectFeatures = () => {
        const extensions = projectAnalysis.filesByExtension;
        const topLevelDirs = projectAnalysis.fileTree
          .filter((n: FileTreeNode) => n.isDirectory)
          .map((n: FileTreeNode) => n.name.toLowerCase());
        const topLevelFiles = projectAnalysis.fileTree
          .filter((n: FileTreeNode) => !n.isDirectory)
          .map((n: FileTreeNode) => n.name.toLowerCase());

        // Check for test directories and files
        const hasTests =
          topLevelDirs.includes('tests') ||
          topLevelDirs.includes('test') ||
          topLevelDirs.includes('__tests__') ||
          allFilePaths.some((p) => p.includes('.spec.') || p.includes('.test.'));

        if (hasTests) {
          detectedFeatures.push({
            category: 'Testing',
            description: 'Automated test suite',
            passes: true,
          });
        }

        // Check for components directory (UI components)
        const hasComponents =
          topLevelDirs.includes('components') ||
          allFilePaths.some((p) => p.toLowerCase().includes('/components/'));

        if (hasComponents) {
          detectedFeatures.push({
            category: 'UI/Design',
            description: 'Component-based UI architecture',
            passes: true,
          });
        }

        // Check for src directory (organized source code)
        if (topLevelDirs.includes('src')) {
          detectedFeatures.push({
            category: 'Project Structure',
            description: 'Organized source code structure',
            passes: true,
          });
        }

        // Check package.json for dependencies and detect features
        if (fileContents['package.json']) {
          try {
            const pkg = JSON.parse(fileContents['package.json']);

            // React/Next.js app detection
            if (pkg.dependencies?.react || pkg.dependencies?.['react-dom']) {
              detectedFeatures.push({
                category: 'Frontend',
                description: 'React-based user interface',
                passes: true,
              });
            }

            if (pkg.dependencies?.next) {
              detectedFeatures.push({
                category: 'Framework',
                description: 'Next.js framework integration',
                passes: true,
              });
            }

            // TypeScript support
            if (
              pkg.devDependencies?.typescript ||
              pkg.dependencies?.typescript ||
              extensions['ts'] ||
              extensions['tsx']
            ) {
              detectedFeatures.push({
                category: 'Developer Experience',
                description: 'TypeScript type safety',
                passes: true,
              });
            }

            // Tailwind CSS
            if (pkg.devDependencies?.tailwindcss || pkg.dependencies?.tailwindcss) {
              detectedFeatures.push({
                category: 'UI/Design',
                description: 'Tailwind CSS styling',
                passes: true,
              });
            }

            // ESLint/Prettier (code quality)
            if (pkg.devDependencies?.eslint || pkg.devDependencies?.prettier) {
              detectedFeatures.push({
                category: 'Developer Experience',
                description: 'Code quality tools',
                passes: true,
              });
            }

            // Electron (desktop app)
            if (pkg.dependencies?.electron || pkg.devDependencies?.electron) {
              detectedFeatures.push({
                category: 'Platform',
                description: 'Electron desktop application',
                passes: true,
              });
            }

            // Playwright testing
            if (pkg.devDependencies?.playwright || pkg.devDependencies?.['@playwright/test']) {
              detectedFeatures.push({
                category: 'Testing',
                description: 'Playwright end-to-end testing',
                passes: true,
              });
            }
          } catch {
            // Ignore JSON parse errors
          }
        }

        // Check for documentation
        if (topLevelFiles.includes('readme.md') || topLevelDirs.includes('docs')) {
          detectedFeatures.push({
            category: 'Documentation',
            description: 'Project documentation',
            passes: true,
          });
        }

        // Check for CI/CD configuration
        const hasCICD =
          topLevelDirs.includes('.github') ||
          topLevelFiles.includes('.gitlab-ci.yml') ||
          topLevelFiles.includes('.travis.yml');

        if (hasCICD) {
          detectedFeatures.push({
            category: 'DevOps',
            description: 'CI/CD pipeline configuration',
            passes: true,
          });
        }

        // Check for API routes (Next.js API or Express)
        const hasAPIRoutes = allFilePaths.some(
          (p) => p.includes('/api/') || p.includes('/routes/') || p.includes('/endpoints/')
        );

        if (hasAPIRoutes) {
          detectedFeatures.push({
            category: 'Backend',
            description: 'API endpoints',
            passes: true,
          });
        }

        // Check for state management
        const hasStateManagement = allFilePaths.some(
          (p) =>
            p.includes('/store/') ||
            p.includes('/stores/') ||
            p.includes('/redux/') ||
            p.includes('/context/')
        );

        if (hasStateManagement) {
          detectedFeatures.push({
            category: 'Architecture',
            description: 'State management system',
            passes: true,
          });
        }

        // Check for configuration files
        if (topLevelFiles.includes('tsconfig.json') || topLevelFiles.includes('package.json')) {
          detectedFeatures.push({
            category: 'Configuration',
            description: 'Project configuration files',
            passes: true,
          });
        }
      };

      detectFeatures();

      // If no features were detected, add a default feature
      if (detectedFeatures.length === 0) {
        detectedFeatures.push({
          category: 'Core',
          description: 'Basic project structure',
          passes: true,
        });
      }

      // Create each feature using the features API
      if (!api.features) {
        throw new Error('Features API not available');
      }

      for (const detectedFeature of detectedFeatures) {
        await api.features.create(currentProject.path, {
          id: generateUUID(),
          category: detectedFeature.category,
          description: detectedFeature.description,
          status: 'backlog',
          // Initialize with empty steps so the object satisfies the Feature type
          steps: [],
        } as any);
      }

      // Invalidate React Query cache to sync UI
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.all(currentProject.path),
      });

      setFeatureListGenerated(true);
    } catch (error) {
      logger.error('Failed to generate feature list:', error);
      setFeatureListError(
        error instanceof Error ? error.message : 'Failed to generate feature list'
      );
    } finally {
      setIsGeneratingFeatureList(false);
    }
  }, [currentProject, projectAnalysis, queryClient]);

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (expandedFolders.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  // Render file tree node
  const renderNode = (node: FileTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);

    return (
      <div key={node.path} data-testid={`analysis-node-${node.name}`}>
        <div
          className={cn(
            'flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted/50 text-sm'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (node.isDirectory) {
              toggleFolder(node.path);
            }
          }}
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
          <span className="truncate">{node.name}</span>
          {node.extension && (
            <span className="text-xs text-muted-foreground ml-auto">.{node.extension}</span>
          )}
        </div>
        {node.isDirectory && isExpanded && node.children && (
          <div>{node.children.map((child: FileTreeNode) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="analysis-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="analysis-view">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Project Analysis</h1>
            <p className="text-sm text-muted-foreground">{currentProject.name}</p>
          </div>
        </div>
        <Button onClick={runAnalysis} disabled={isAnalyzing} data-testid="analyze-project-button">
          {isAnalyzing ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Analyze Project
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        {!projectAnalysis && !isAnalyzing ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Search className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Analysis Yet</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              Click &quot;Analyze Project&quot; to scan your codebase and get insights about its
              structure.
            </p>
            <Button onClick={runAnalysis} data-testid="analyze-project-button-empty">
              <Search className="w-4 h-4 mr-2" />
              Start Analysis
            </Button>
          </div>
        ) : isAnalyzing ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Spinner size="xl" className="mb-4" />
            <p className="text-muted-foreground">Scanning project files...</p>
          </div>
        ) : projectAnalysis ? (
          <div className="flex gap-4 h-full overflow-hidden">
            {/* Stats Panel */}
            <div className="w-80 shrink-0 overflow-y-auto space-y-4">
              <Card data-testid="analysis-stats">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Statistics
                  </CardTitle>
                  <CardDescription>
                    Analyzed {new Date(projectAnalysis.analyzedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Files</span>
                    <span className="font-medium" data-testid="total-files">
                      {projectAnalysis.totalFiles}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Directories</span>
                    <span className="font-medium" data-testid="total-directories">
                      {projectAnalysis.totalDirectories}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="files-by-extension">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileCode className="w-4 h-4" />
                    Files by Extension
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(projectAnalysis.filesByExtension)
                      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
                      .slice(0, 15)
                      .map(([ext, count]: [string, number]) => (
                        <div key={ext} className="flex justify-between text-sm">
                          <span className="text-muted-foreground font-mono">
                            {ext.startsWith('(') ? ext : `.${ext}`}
                          </span>
                          <span>{count}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {/* Generate Spec Card */}
              <Card data-testid="generate-spec-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Generate Specification
                  </CardTitle>
                  <CardDescription>Create app_spec.txt from analysis</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Generate a project specification file based on the analyzed codebase structure
                    and detected technologies.
                  </p>
                  <Button
                    onClick={generateSpec}
                    disabled={isGeneratingSpec}
                    className="w-full"
                    data-testid="generate-spec-button"
                  >
                    {isGeneratingSpec ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Spec
                      </>
                    )}
                  </Button>
                  {specGenerated && (
                    <div
                      className="flex items-center gap-2 text-sm text-green-500"
                      data-testid="spec-generated-success"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>app_spec.txt created successfully!</span>
                    </div>
                  )}
                  {specError && (
                    <div
                      className="flex items-center gap-2 text-sm text-red-500"
                      data-testid="spec-generated-error"
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span>{specError}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Generate Feature List Card */}
              <Card data-testid="generate-feature-list-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    Generate Feature List
                  </CardTitle>
                  <CardDescription>Create features from analysis</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Automatically detect and generate a feature list based on the analyzed codebase
                    structure, dependencies, and project configuration.
                  </p>
                  <Button
                    onClick={generateFeatureList}
                    disabled={isGeneratingFeatureList}
                    className="w-full"
                    data-testid="generate-feature-list-button"
                  >
                    {isGeneratingFeatureList ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <ListChecks className="w-4 h-4 mr-2" />
                        Generate Feature List
                      </>
                    )}
                  </Button>
                  {featureListGenerated && (
                    <div
                      className="flex items-center gap-2 text-sm text-green-500"
                      data-testid="feature-list-generated-success"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Features created successfully!</span>
                    </div>
                  )}
                  {featureListError && (
                    <div
                      className="flex items-center gap-2 text-sm text-red-500"
                      data-testid="feature-list-generated-error"
                    >
                      <AlertCircle className="w-4 h-4" />
                      <span>{featureListError}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* File Tree */}
            <Card className="flex-1 overflow-hidden">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Folder className="w-4 h-4" />
                  File Tree
                </CardTitle>
                <CardDescription>
                  {projectAnalysis.totalFiles} files in {projectAnalysis.totalDirectories}{' '}
                  directories
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-y-auto h-full" data-testid="analysis-file-tree">
                <div className="p-2">
                  {projectAnalysis.fileTree.map((node: FileTreeNode) => renderNode(node))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
