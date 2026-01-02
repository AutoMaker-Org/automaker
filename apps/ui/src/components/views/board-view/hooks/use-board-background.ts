import { useMemo } from 'react';
import { useAppStore, defaultBackgroundSettings } from '@/store/app-store';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';

interface UseBoardBackgroundProps {
  currentProject: { path: string; id: string } | null;
}

/**
 * Selects the board background settings for the given project and produces a CSS style object for the project's background image when present.
 *
 * @param currentProject - The active project (contains `path` and `id`), or `null` if no project is selected
 * @returns An object with:
 *   - `backgroundSettings`: the resolved background settings for the current project or the default settings
 *   - `backgroundImageStyle`: a React CSS properties object with `backgroundImage`, `backgroundSize`, `backgroundPosition`, and `backgroundRepeat` when an image is available, or an empty object otherwise
 */
export function useBoardBackground({ currentProject }: UseBoardBackgroundProps) {
  const boardBackgroundByProject = useAppStore((state) => state.boardBackgroundByProject);

  // Get background settings for current project
  const backgroundSettings = useMemo(() => {
    return (
      (currentProject && boardBackgroundByProject[currentProject.path]) || defaultBackgroundSettings
    );
  }, [currentProject, boardBackgroundByProject]);

  // Build background image style if image exists
  const backgroundImageStyle = useMemo(() => {
    if (!backgroundSettings.imagePath || !currentProject) {
      return {};
    }

    const imageUrl = getAuthenticatedImageUrl(
      backgroundSettings.imagePath,
      currentProject.path,
      backgroundSettings.imageVersion
    );

    return {
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    } as React.CSSProperties;
  }, [backgroundSettings, currentProject]);

  return {
    backgroundSettings,
    backgroundImageStyle,
  };
}