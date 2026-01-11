import type { NavigateOptions } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useOSDetection } from '@/hooks/use-os-detection';

interface AutomakerLogoProps {
  sidebarOpen: boolean;
  navigate: (opts: NavigateOptions) => void;
}

function getOSAbbreviation(os: string): string {
  switch (os) {
    case 'mac':
      return 'M';
    case 'windows':
      return 'W';
    case 'linux':
      return 'L';
    default:
      return '?';
  }
}

export function AutomakerLogo({ sidebarOpen, navigate }: AutomakerLogoProps) {
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const { os } = useOSDetection();
  const appMode = import.meta.env.VITE_APP_MODE || '?';
  const versionSuffix = `${getOSAbbreviation(os)}${appMode}`;

  return (
    <div
      className={cn(
        'flex items-center gap-3 titlebar-no-drag cursor-pointer group',
        !sidebarOpen && 'flex-col gap-1'
      )}
      onClick={() => navigate({ to: '/dashboard' })}
      data-testid="logo-button"
    >
      {/* Collapsed logo - shown when sidebar is closed OR on small screens when sidebar is open */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg gap-0.5',
          sidebarOpen ? 'flex lg:hidden' : 'flex'
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 256 256"
          role="img"
          aria-label="Automaker Logo"
          className="size-8 group-hover:rotate-12 transition-transform duration-300 ease-out"
        >
          <defs>
            <linearGradient
              id="bg-collapsed"
              x1="0"
              y1="0"
              x2="256"
              y2="256"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
            </linearGradient>
            <filter id="iconShadow-collapsed" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                floodColor="#000000"
                floodOpacity="0.25"
              />
            </filter>
          </defs>
          <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-collapsed)" />
          <g
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#iconShadow-collapsed)"
          >
            <path d="M92 92 L52 128 L92 164" />
            <path d="M144 72 L116 184" />
            <path d="M164 92 L204 128 L164 164" />
          </g>
        </svg>
        <span className="text-[0.625rem] text-muted-foreground leading-none font-medium">
          v{appVersion} {versionSuffix}
        </span>
      </div>

      {/* Expanded logo - only shown when sidebar is open on large screens */}
      {sidebarOpen && (
        <div className="hidden lg:flex flex-col">
          <div className="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              role="img"
              aria-label="automaker"
              className="h-[36.8px] w-[36.8px] group-hover:rotate-12 transition-transform duration-300 ease-out"
            >
              <defs>
                <linearGradient
                  id="bg-expanded"
                  x1="0"
                  y1="0"
                  x2="256"
                  y2="256"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
                </linearGradient>
                <filter id="iconShadow-expanded" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow
                    dx="0"
                    dy="4"
                    stdDeviation="4"
                    floodColor="#000000"
                    floodOpacity="0.25"
                  />
                </filter>
              </defs>
              <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-expanded)" />
              <g
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#iconShadow-expanded)"
              >
                <path d="M92 92 L52 128 L92 164" />
                <path d="M144 72 L116 184" />
                <path d="M164 92 L204 128 L164 164" />
              </g>
            </svg>
            <span className="font-bold text-foreground text-[1.7rem] tracking-tight leading-none translate-y-[-2px]">
              automaker<span className="text-brand-500">.</span>
            </span>
          </div>
          <span className="text-[0.625rem] text-muted-foreground leading-none font-medium ml-[38.8px]">
            v{appVersion} {versionSuffix}
          </span>
        </div>
      )}
    </div>
  );
}
