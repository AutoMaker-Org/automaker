import { useMemo } from 'react';
import { useAppStore, defaultBackgroundSettings } from '@/store/app-store';
import { getServerUrlSync } from '@/lib/http-api-client';

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

    return {
      backgroundImage: `url(${
        import.meta.env.VITE_SERVER_URL || getServerUrlSync()
      }/api/fs/image?path=${encodeURIComponent(
        backgroundSettings.imagePath
      )}&projectPath=${encodeURIComponent(currentProject.path)}${
        backgroundSettings.imageVersion ? `&v=${backgroundSettings.imageVersion}` : ''
      })`,
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
