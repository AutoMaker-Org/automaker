// Type definitions for Electron IPC API

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileStats {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  mtime: Date;
}

export interface DialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface FileResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface WriteResult {
  success: boolean;
  error?: string;
}

export interface ReaddirResult {
  success: boolean;
  entries?: FileEntry[];
  error?: string;
}

export interface StatResult {
  success: boolean;
  stats?: FileStats;
  error?: string;
}

// Auto Mode types
export type AutoModePhase = "planning" | "action" | "verification";

export interface AutoModeEvent {
  type: "auto_mode_feature_start" | "auto_mode_progress" | "auto_mode_tool" | "auto_mode_feature_complete" | "auto_mode_error" | "auto_mode_complete" | "auto_mode_phase";
  featureId?: string;
  feature?: object;
  content?: string;
  tool?: string;
  input?: unknown;
  passes?: boolean;
  message?: string;
  error?: string;
  phase?: AutoModePhase;
}

export interface AutoModeAPI {
  start: (projectPath: string, maxConcurrency?: number) => Promise<{ success: boolean; error?: string }>;
  stop: () => Promise<{ success: boolean; error?: string }>;
  stopFeature: (featureId: string) => Promise<{ success: boolean; error?: string }>;
  status: () => Promise<{ success: boolean; isRunning?: boolean; currentFeatureId?: string | null; runningFeatures?: string[]; error?: string }>;
  runFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  verifyFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  resumeFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  contextExists: (projectPath: string, featureId: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
  analyzeProject: (projectPath: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  followUpFeature: (projectPath: string, featureId: string, prompt: string, imagePaths?: string[]) => Promise<{ success: boolean; passes?: boolean; error?: string }>;
  commitFeature: (projectPath: string, featureId: string) => Promise<{ success: boolean; error?: string }>;
  onEvent: (callback: (event: AutoModeEvent) => void) => () => void;
}

export interface SaveImageResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  openDirectory: () => Promise<DialogResult>;
  openFile: (options?: object) => Promise<DialogResult>;
  readFile: (filePath: string) => Promise<FileResult>;
  writeFile: (filePath: string, content: string) => Promise<WriteResult>;
  mkdir: (dirPath: string) => Promise<WriteResult>;
  readdir: (dirPath: string) => Promise<ReaddirResult>;
  exists: (filePath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<StatResult>;
  deleteFile: (filePath: string) => Promise<WriteResult>;
  trashItem?: (filePath: string) => Promise<WriteResult>;
  getPath: (name: string) => Promise<string>;
  saveImageToTemp?: (data: string, filename: string, mimeType: string) => Promise<SaveImageResult>;
  autoMode?: AutoModeAPI;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    isElectron?: boolean;
  }
}

// Mock data for web development
const mockFeatures = [
  {
    category: "Core",
    description: "Sample Feature",
    steps: ["Step 1", "Step 2"],
    passes: false,
  },
];

// Local storage keys
const STORAGE_KEYS = {
  PROJECTS: "automaker_projects",
  CURRENT_PROJECT: "automaker_current_project",
  TRASHED_PROJECTS: "automaker_trashed_projects",
} as const;

// Mock file system using localStorage
const mockFileSystem: Record<string, string> = {};

// Check if we're in Electron
export const isElectron = (): boolean => {
  return typeof window !== "undefined" && window.isElectron === true;
};

// Get the Electron API or a mock for web development
export const getElectronAPI = (): ElectronAPI => {
  if (isElectron() && window.electronAPI) {
    return window.electronAPI;
  }

  // Return mock API for web development
  return {
    ping: async () => "pong (mock)",

    openDirectory: async () => {
      // In web mode, we'll use a prompt to simulate directory selection
      const path = prompt("Enter project directory path:", "/Users/demo/project");
      return {
        canceled: !path,
        filePaths: path ? [path] : [],
      };
    },

    openFile: async () => {
      const path = prompt("Enter file path:");
      return {
        canceled: !path,
        filePaths: path ? [path] : [],
      };
    },

    readFile: async (filePath: string) => {
      // Check mock file system first
      if (mockFileSystem[filePath] !== undefined) {
        return { success: true, content: mockFileSystem[filePath] };
      }
      // Return mock data based on file type
      if (filePath.endsWith("feature_list.json")) {
        // Check if test has set mock features via global variable
        const testFeatures = (window as any).__mockFeatures;
        if (testFeatures !== undefined) {
          return { success: true, content: JSON.stringify(testFeatures, null, 2) };
        }
        return { success: true, content: JSON.stringify(mockFeatures, null, 2) };
      }
      if (filePath.endsWith("categories.json")) {
        // Return empty array for categories when file doesn't exist yet
        return { success: true, content: "[]" };
      }
      if (filePath.endsWith("app_spec.txt")) {
        return {
          success: true,
          content: "<project_specification>\n  <project_name>Demo Project</project_name>\n</project_specification>",
        };
      }
      // For any file in mock agents-context directory, return empty string (file exists but is empty)
      if (filePath.includes(".automaker/agents-context/")) {
        return { success: true, content: "" };
      }
      return { success: false, error: "File not found (mock)" };
    },

    writeFile: async (filePath: string, content: string) => {
      mockFileSystem[filePath] = content;
      return { success: true };
    },

    mkdir: async () => {
      return { success: true };
    },

    readdir: async (dirPath: string) => {
      // Return mock directory structure based on path
      if (dirPath) {
        // Check if this is the context or agents-context directory - return files from mock file system
        if (dirPath.includes(".automaker/context") || dirPath.includes(".automaker/agents-context")) {
          const contextFiles = Object.keys(mockFileSystem)
            .filter(path => path.startsWith(dirPath) && path !== dirPath)
            .map(path => {
              const name = path.substring(dirPath.length + 1); // +1 for the trailing slash
              return {
                name,
                isDirectory: false,
                isFile: true,
              };
            })
            .filter(entry => !entry.name.includes("/")); // Only direct children
          return { success: true, entries: contextFiles };
        }
        // Root level
        if (!dirPath.includes("/src") && !dirPath.includes("/tests") && !dirPath.includes("/public") && !dirPath.includes(".automaker")) {
          return {
            success: true,
            entries: [
              { name: "src", isDirectory: true, isFile: false },
              { name: "tests", isDirectory: true, isFile: false },
              { name: "public", isDirectory: true, isFile: false },
              { name: ".automaker", isDirectory: true, isFile: false },
              { name: "package.json", isDirectory: false, isFile: true },
              { name: "tsconfig.json", isDirectory: false, isFile: true },
              { name: "app_spec.txt", isDirectory: false, isFile: true },
              { name: "feature_list.json", isDirectory: false, isFile: true },
              { name: "README.md", isDirectory: false, isFile: true },
            ],
          };
        }
        // src directory
        if (dirPath.endsWith("/src")) {
          return {
            success: true,
            entries: [
              { name: "components", isDirectory: true, isFile: false },
              { name: "lib", isDirectory: true, isFile: false },
              { name: "app", isDirectory: true, isFile: false },
              { name: "index.ts", isDirectory: false, isFile: true },
              { name: "utils.ts", isDirectory: false, isFile: true },
            ],
          };
        }
        // src/components directory
        if (dirPath.endsWith("/components")) {
          return {
            success: true,
            entries: [
              { name: "Button.tsx", isDirectory: false, isFile: true },
              { name: "Card.tsx", isDirectory: false, isFile: true },
              { name: "Header.tsx", isDirectory: false, isFile: true },
              { name: "Footer.tsx", isDirectory: false, isFile: true },
            ],
          };
        }
        // src/lib directory
        if (dirPath.endsWith("/lib")) {
          return {
            success: true,
            entries: [
              { name: "api.ts", isDirectory: false, isFile: true },
              { name: "helpers.ts", isDirectory: false, isFile: true },
            ],
          };
        }
        // src/app directory
        if (dirPath.endsWith("/app")) {
          return {
            success: true,
            entries: [
              { name: "page.tsx", isDirectory: false, isFile: true },
              { name: "layout.tsx", isDirectory: false, isFile: true },
              { name: "globals.css", isDirectory: false, isFile: true },
            ],
          };
        }
        // tests directory
        if (dirPath.endsWith("/tests")) {
          return {
            success: true,
            entries: [
              { name: "unit.test.ts", isDirectory: false, isFile: true },
              { name: "e2e.spec.ts", isDirectory: false, isFile: true },
            ],
          };
        }
        // public directory
        if (dirPath.endsWith("/public")) {
          return {
            success: true,
            entries: [
              { name: "favicon.ico", isDirectory: false, isFile: true },
              { name: "logo.svg", isDirectory: false, isFile: true },
            ],
          };
        }
        // Default empty for other paths
        return { success: true, entries: [] };
      }
      return { success: true, entries: [] };
    },

    exists: async (filePath: string) => {
      // Check if file exists in mock file system (including newly created files)
      if (mockFileSystem[filePath] !== undefined) {
        return true;
      }
      // Check if test has set mock features via global variable
      if (filePath.endsWith("feature_list.json") && (window as any).__mockFeatures !== undefined) {
        return true;
      }
      // Legacy mock files for backwards compatibility
      if (filePath.endsWith("feature_list.json") && !filePath.includes(".automaker")) {
        return true;
      }
      if (filePath.endsWith("app_spec.txt") && !filePath.includes(".automaker")) {
        return true;
      }
      return false;
    },

    stat: async () => {
      return {
        success: true,
        stats: {
          isDirectory: false,
          isFile: true,
          size: 1024,
          mtime: new Date(),
        },
      };
    },

    deleteFile: async (filePath: string) => {
      delete mockFileSystem[filePath];
      return { success: true };
    },

    trashItem: async () => {
      return { success: true };
    },

    getPath: async (name: string) => {
      if (name === "userData") {
        return "/mock/userData";
      }
      return `/mock/${name}`;
    },

    // Save image to temp directory
    saveImageToTemp: async (data: string, filename: string, mimeType: string) => {
      // Generate a mock temp file path
      const timestamp = Date.now();
      const ext = mimeType.split("/")[1] || "png";
      const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const tempFilePath = `/tmp/automaker-images/${timestamp}_${safeName}`;

      // Store the image data in mock file system for testing
      mockFileSystem[tempFilePath] = data;

      console.log("[Mock] Saved image to temp:", tempFilePath);
      return { success: true, path: tempFilePath };
    },

    // Mock Auto Mode API
    autoMode: createMockAutoModeAPI(),
  };
};

// Mock Auto Mode state and implementation
let mockAutoModeRunning = false;
let mockRunningFeatures = new Set<string>(); // Track multiple concurrent feature verifications
let mockAutoModeCallbacks: ((event: AutoModeEvent) => void)[] = [];
let mockAutoModeTimeouts = new Map<string, NodeJS.Timeout>(); // Track timeouts per feature

function createMockAutoModeAPI(): AutoModeAPI {
  return {
    start: async (projectPath: string, maxConcurrency?: number) => {
      if (mockAutoModeRunning) {
        return { success: false, error: "Auto mode is already running" };
      }

      mockAutoModeRunning = true;
      console.log(`[Mock] Auto mode started with maxConcurrency: ${maxConcurrency || 3}`);
      const featureId = "auto-mode-0";
      mockRunningFeatures.add(featureId);

      // Simulate auto mode with Plan-Act-Verify phases
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true };
    },

    stop: async () => {
      mockAutoModeRunning = false;
      mockRunningFeatures.clear();
      // Clear all timeouts
      mockAutoModeTimeouts.forEach(timeout => clearTimeout(timeout));
      mockAutoModeTimeouts.clear();
      return { success: true };
    },

    stopFeature: async (featureId: string) => {
      if (!mockRunningFeatures.has(featureId)) {
        return { success: false, error: `Feature ${featureId} is not running` };
      }

      // Clear the timeout for this specific feature
      const timeout = mockAutoModeTimeouts.get(featureId);
      if (timeout) {
        clearTimeout(timeout);
        mockAutoModeTimeouts.delete(featureId);
      }

      // Remove from running features
      mockRunningFeatures.delete(featureId);

      // Emit a stopped event
      emitAutoModeEvent({
        type: "auto_mode_feature_complete",
        featureId,
        passes: false,
        message: "Feature stopped by user",
      });

      return { success: true };
    },

    status: async () => {
      return {
        success: true,
        isRunning: mockAutoModeRunning,
        currentFeatureId: mockAutoModeRunning ? "feature-0" : null,
        runningFeatures: Array.from(mockRunningFeatures),
      };
    },

    runFeature: async (projectPath: string, featureId: string) => {
      if (mockRunningFeatures.has(featureId)) {
        return { success: false, error: `Feature ${featureId} is already running` };
      }

      mockRunningFeatures.add(featureId);
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true, passes: true };
    },

    verifyFeature: async (projectPath: string, featureId: string) => {
      if (mockRunningFeatures.has(featureId)) {
        return { success: false, error: `Feature ${featureId} is already running` };
      }

      mockRunningFeatures.add(featureId);
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true, passes: true };
    },

    resumeFeature: async (projectPath: string, featureId: string) => {
      if (mockRunningFeatures.has(featureId)) {
        return { success: false, error: `Feature ${featureId} is already running` };
      }

      mockRunningFeatures.add(featureId);
      simulateAutoModeLoop(projectPath, featureId);

      return { success: true, passes: true };
    },

    contextExists: async (projectPath: string, featureId: string) => {
      // Mock implementation - simulate that context exists for some features
      const exists = mockFileSystem[`${projectPath}/.automaker/agents-context/${featureId}.md`] !== undefined;
      return { success: true, exists };
    },

    analyzeProject: async (projectPath: string) => {
      // Simulate project analysis
      const analysisId = `project-analysis-${Date.now()}`;
      mockRunningFeatures.add(analysisId);

      // Emit start event
      emitAutoModeEvent({
        type: "auto_mode_feature_start",
        featureId: analysisId,
        feature: {
          id: analysisId,
          category: "Project Analysis",
          description: "Analyzing project structure and tech stack",
        },
      });

      // Simulate analysis phases
      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId)) return { success: false, message: "Analysis aborted" };

      emitAutoModeEvent({
        type: "auto_mode_phase",
        featureId: analysisId,
        phase: "planning",
        message: "Scanning project structure...",
      });

      emitAutoModeEvent({
        type: "auto_mode_progress",
        featureId: analysisId,
        content: "Starting project analysis...\n",
      });

      await delay(500, analysisId);
      if (!mockRunningFeatures.has(analysisId)) return { success: false, message: "Analysis aborted" };

      emitAutoModeEvent({
        type: "auto_mode_tool",
        featureId: analysisId,
        tool: "Glob",
        input: { pattern: "**/*" },
      });

      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId)) return { success: false, message: "Analysis aborted" };

      emitAutoModeEvent({
        type: "auto_mode_progress",
        featureId: analysisId,
        content: "Detected tech stack: Next.js, TypeScript, Tailwind CSS\n",
      });

      await delay(300, analysisId);
      if (!mockRunningFeatures.has(analysisId)) return { success: false, message: "Analysis aborted" };

      // Write mock app_spec.txt
      mockFileSystem[`${projectPath}/.automaker/app_spec.txt`] = `<project_specification>
  <project_name>Demo Project</project_name>

  <overview>
    A demo project analyzed by the Automaker AI agent.
  </overview>

  <technology_stack>
    <frontend>
      <framework>Next.js</framework>
      <language>TypeScript</language>
      <styling>Tailwind CSS</styling>
    </frontend>
  </technology_stack>

  <core_capabilities>
    - Web application
    - Component-based architecture
  </core_capabilities>

  <implemented_features>
    - Basic page structure
    - Component library
  </implemented_features>
</project_specification>`;

      // Ensure feature_list.json exists
      if (!mockFileSystem[`${projectPath}/.automaker/feature_list.json`]) {
        mockFileSystem[`${projectPath}/.automaker/feature_list.json`] = "[]";
      }

      emitAutoModeEvent({
        type: "auto_mode_phase",
        featureId: analysisId,
        phase: "verification",
        message: "Project analysis complete",
      });

      emitAutoModeEvent({
        type: "auto_mode_feature_complete",
        featureId: analysisId,
        passes: true,
        message: "Project analyzed successfully",
      });

      mockRunningFeatures.delete(analysisId);
      mockAutoModeTimeouts.delete(analysisId);

      return { success: true, message: "Project analyzed successfully" };
    },

    followUpFeature: async (projectPath: string, featureId: string, prompt: string, imagePaths?: string[]) => {
      if (mockRunningFeatures.has(featureId)) {
        return { success: false, error: `Feature ${featureId} is already running` };
      }

      console.log("[Mock] Follow-up feature:", { featureId, prompt, imagePaths });

      mockRunningFeatures.add(featureId);

      // Simulate follow-up work (similar to run but with additional context)
      // Note: We don't await this - it runs in the background like the real implementation
      simulateAutoModeLoop(projectPath, featureId);

      // Return immediately so the modal can close (matches real implementation)
      return { success: true };
    },

    commitFeature: async (projectPath: string, featureId: string) => {
      console.log("[Mock] Committing feature:", { projectPath, featureId });

      // Simulate commit operation
      emitAutoModeEvent({
        type: "auto_mode_feature_start",
        featureId,
        feature: {
          id: featureId,
          category: "Commit",
          description: "Committing changes",
        },
      });

      await delay(300, featureId);

      emitAutoModeEvent({
        type: "auto_mode_phase",
        featureId,
        phase: "action",
        message: "Committing changes to git...",
      });

      await delay(500, featureId);

      emitAutoModeEvent({
        type: "auto_mode_feature_complete",
        featureId,
        passes: true,
        message: "Changes committed successfully",
      });

      return { success: true };
    },

    onEvent: (callback: (event: AutoModeEvent) => void) => {
      mockAutoModeCallbacks.push(callback);
      return () => {
        mockAutoModeCallbacks = mockAutoModeCallbacks.filter(cb => cb !== callback);
      };
    },
  };
}

function emitAutoModeEvent(event: AutoModeEvent) {
  mockAutoModeCallbacks.forEach(cb => cb(event));
}

async function simulateAutoModeLoop(projectPath: string, featureId: string) {
  const mockFeature = {
    id: featureId,
    category: "Core",
    description: "Sample Feature",
    steps: ["Step 1", "Step 2"],
    passes: false,
  };

  // Start feature
  emitAutoModeEvent({
    type: "auto_mode_feature_start",
    featureId,
    feature: mockFeature,
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 1: PLANNING
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "planning",
    message: `Planning implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "Analyzing codebase structure and creating implementation plan...",
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 2: ACTION
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "action",
    message: `Executing implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "Starting code implementation...",
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Simulate tool use
  emitAutoModeEvent({
    type: "auto_mode_tool",
    featureId,
    tool: "Read",
    input: { file: "package.json" },
  });

  await delay(300, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  emitAutoModeEvent({
    type: "auto_mode_tool",
    featureId,
    tool: "Write",
    input: { file: "src/feature.ts", content: "// Feature code" },
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  // Phase 3: VERIFICATION
  emitAutoModeEvent({
    type: "auto_mode_phase",
    featureId,
    phase: "verification",
    message: `Verifying implementation for: ${mockFeature.description}`,
  });

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "Verifying implementation and checking test results...",
  });

  await delay(500, featureId);
  if (!mockRunningFeatures.has(featureId)) return;

  emitAutoModeEvent({
    type: "auto_mode_progress",
    featureId,
    content: "✓ Verification successful: All tests passed",
  });

  // Feature complete
  emitAutoModeEvent({
    type: "auto_mode_feature_complete",
    featureId,
    passes: true,
    message: "Feature implemented successfully",
  });

  // Delete context file when feature is verified (matches real auto-mode-service behavior)
  const contextFilePath = `${projectPath}/.automaker/agents-context/${featureId}.md`;
  delete mockFileSystem[contextFilePath];

  // Clean up this feature from running set
  mockRunningFeatures.delete(featureId);
  mockAutoModeTimeouts.delete(featureId);
}

function delay(ms: number, featureId: string): Promise<void> {
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, ms);
    mockAutoModeTimeouts.set(featureId, timeout);
  });
}

// Utility functions for project management

export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened?: string;
}

export interface TrashedProject extends Project {
  trashedAt: string;
  deletedFromDisk?: boolean;
}

export const getStoredProjects = (): Project[] => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEYS.PROJECTS);
  return stored ? JSON.parse(stored) : [];
};

export const saveProjects = (projects: Project[]): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
};

export const getCurrentProject = (): Project | null => {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_PROJECT);
  return stored ? JSON.parse(stored) : null;
};

export const setCurrentProject = (project: Project | null): void => {
  if (typeof window === "undefined") return;
  if (project) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_PROJECT, JSON.stringify(project));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT);
  }
};

export const addProject = (project: Project): void => {
  const projects = getStoredProjects();
  const existing = projects.findIndex((p) => p.path === project.path);
  if (existing >= 0) {
    projects[existing] = { ...project, lastOpened: new Date().toISOString() };
  } else {
    projects.push({ ...project, lastOpened: new Date().toISOString() });
  }
  saveProjects(projects);
};

export const removeProject = (projectId: string): void => {
  const projects = getStoredProjects().filter((p) => p.id !== projectId);
  saveProjects(projects);
};

export const getStoredTrashedProjects = (): TrashedProject[] => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEYS.TRASHED_PROJECTS);
  return stored ? JSON.parse(stored) : [];
};

export const saveTrashedProjects = (projects: TrashedProject[]): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.TRASHED_PROJECTS, JSON.stringify(projects));
};
