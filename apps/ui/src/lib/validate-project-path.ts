import type { Project } from '@/lib/electron';
import { getElectronAPI } from './electron';

export const validateProjectPath = async (project: Project): Promise<boolean> => {
  try {
    if (!project?.path) {
      console.error('[Validation] No project path provided for project:', project?.name);
      return false;
    }

    const api = getElectronAPI();
    // Check if path exists
    const exists = await api.exists(project.path);

    if (exists !== true) {
      console.error('[Validation] Path does not exist:', project.path);
      return false;
    }

    // Verify it's a directory
    const statResult = await api.stat(project.path);

    if (!statResult.success || !statResult.stats?.isDirectory) {
      console.error('[Validation] Path is not a directory or stat failed:', project.path);
      return false;
    }

    return true;
  } catch (error) {
    // Treat errors as invalid (permissions, network issues, etc.)
    console.error('[Validation] Exception during validation for path:', project.path, error);
    return false;
  }
};
