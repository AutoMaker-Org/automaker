import { useMemo } from 'react';
import { useAppStore, defaultBackgroundSettings } from '@/store/app-store';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';

interface UseBoardBackgroundProps {
  currentProject: { path: string; id: string } | null;
}

export function useBoardBackground({ currentProject }: UseBoardBackgroundProps) {
  const boardBackgroundByProject = useAppStore((state) => state.boardBackgroundByProject);
  const defaultSortNewestCardOnTop = useAppStore((state) => state.defaultSortNewestCardOnTop);

  // Get background settings for current project
  // sortNewestCardOnTop always comes from the global defaultSortNewestCardOnTop setting;
  // per-project settings control visual appearance (background image, opacity, etc.) only.
  const backgroundSettings = useMemo(() => {
    const perProjectSettings = currentProject
      ? boardBackgroundByProject[currentProject.path]
      : null;
    const base = perProjectSettings || defaultBackgroundSettings;
    return { ...base, sortNewestCardOnTop: defaultSortNewestCardOnTop };
  }, [currentProject, boardBackgroundByProject, defaultSortNewestCardOnTop]);

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
