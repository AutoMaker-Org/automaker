/**
 * Mock implementation of IFileSystemService
 * For web development and testing without Electron
 */

import type {
  IFileSystemService,
  FileEntry,
  FileStats,
} from "../../interfaces/IFileSystemService";
import type { ServiceResult } from "../../types";

// Mock file system using in-memory storage
const mockFileSystem: Record<string, string> = {};

export class MockFileSystemService implements IFileSystemService {
  async readFile(filePath: string): Promise<ServiceResult<string>> {
    // Check mock file system first
    if (mockFileSystem[filePath] !== undefined) {
      return { success: true, data: mockFileSystem[filePath] };
    }

    // Return mock data based on file type
    if (filePath.endsWith("categories.json")) {
      return { success: true, data: "[]" };
    }
    if (filePath.endsWith("app_spec.txt")) {
      return {
        success: true,
        data: "<project_specification>\n  <project_name>Demo Project</project_name>\n</project_specification>",
      };
    }
    // For any file in mock features directory
    if (filePath.includes(".automaker/features/")) {
      if (mockFileSystem[filePath] !== undefined) {
        return { success: true, data: mockFileSystem[filePath] };
      }
      if (filePath.endsWith("/agent-output.md")) {
        return { success: true, data: "" };
      }
    }
    return { success: false, error: "File not found (mock)" };
  }

  async writeFile(filePath: string, content: string): Promise<ServiceResult> {
    mockFileSystem[filePath] = content;
    return { success: true };
  }

  async mkdir(_dirPath: string): Promise<ServiceResult> {
    return { success: true };
  }

  async readdir(dirPath: string): Promise<ServiceResult<FileEntry[]>> {
    if (dirPath) {
      // Check context directory
      if (dirPath.includes(".automaker/context")) {
        const contextFiles = Object.keys(mockFileSystem)
          .filter((path) => path.startsWith(dirPath) && path !== dirPath)
          .map((path) => {
            const name = path.substring(dirPath.length + 1);
            return { name, isDirectory: false, isFile: true };
          })
          .filter((entry) => !entry.name.includes("/"));
        return { success: true, data: contextFiles };
      }

      // Root level
      if (
        !dirPath.includes("/src") &&
        !dirPath.includes("/tests") &&
        !dirPath.includes("/public") &&
        !dirPath.includes(".automaker")
      ) {
        return {
          success: true,
          data: [
            { name: "src", isDirectory: true, isFile: false },
            { name: "tests", isDirectory: true, isFile: false },
            { name: "public", isDirectory: true, isFile: false },
            { name: ".automaker", isDirectory: true, isFile: false },
            { name: "package.json", isDirectory: false, isFile: true },
            { name: "tsconfig.json", isDirectory: false, isFile: true },
            { name: "app_spec.txt", isDirectory: false, isFile: true },
            { name: "features", isDirectory: true, isFile: false },
            { name: "README.md", isDirectory: false, isFile: true },
          ],
        };
      }

      // src directory
      if (dirPath.endsWith("/src")) {
        return {
          success: true,
          data: [
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
          data: [
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
          data: [
            { name: "api.ts", isDirectory: false, isFile: true },
            { name: "helpers.ts", isDirectory: false, isFile: true },
          ],
        };
      }

      // src/app directory
      if (dirPath.endsWith("/app")) {
        return {
          success: true,
          data: [
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
          data: [
            { name: "unit.test.ts", isDirectory: false, isFile: true },
            { name: "e2e.spec.ts", isDirectory: false, isFile: true },
          ],
        };
      }

      // public directory
      if (dirPath.endsWith("/public")) {
        return {
          success: true,
          data: [
            { name: "favicon.ico", isDirectory: false, isFile: true },
            { name: "logo.svg", isDirectory: false, isFile: true },
          ],
        };
      }

      return { success: true, data: [] };
    }
    return { success: true, data: [] };
  }

  async exists(filePath: string): Promise<boolean> {
    if (mockFileSystem[filePath] !== undefined) {
      return true;
    }
    if (filePath.endsWith("app_spec.txt") && !filePath.includes(".automaker")) {
      return true;
    }
    return false;
  }

  async stat(_filePath: string): Promise<ServiceResult<FileStats>> {
    return {
      success: true,
      data: {
        isDirectory: false,
        isFile: true,
        size: 1024,
        mtime: new Date(),
      },
    };
  }

  async deleteFile(filePath: string): Promise<ServiceResult> {
    delete mockFileSystem[filePath];
    return { success: true };
  }

  async trashItem(_filePath: string): Promise<ServiceResult> {
    return { success: true };
  }
}

// Export the mock file system for use in other mock services
export { mockFileSystem };
