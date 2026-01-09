import { useMemo } from 'react';
import { useAppStore, defaultBackgroundSettings } from '@/store/app-store';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';

interface UseBoardBackgroundProps {
  currentProject: { path: string; id: string } | null;
}

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
