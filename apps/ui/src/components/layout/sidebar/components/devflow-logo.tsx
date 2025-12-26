import type { NavigateOptions } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

interface DevFlowLogoProps {
  sidebarOpen: boolean;
  navigate: (opts: NavigateOptions) => void;
}

export function DevFlowLogo({ sidebarOpen, navigate }: DevFlowLogoProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 titlebar-no-drag cursor-pointer group',
        !sidebarOpen && 'flex-col gap-1'
      )}
      onClick={() => navigate({ to: '/' })}
      data-testid="logo-button"
    >
      {!sidebarOpen ? (
        <div className="relative flex items-center justify-center rounded-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            role="img"
            aria-label="DevFlow Logo"
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
        </div>
      ) : (
        <div className={cn('flex items-center gap-1', 'hidden lg:flex')}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            role="img"
            aria-label="DevFlow"
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
            DevFlow<span className="text-brand-500">.</span><span className="font-outline">brnd</span>
          </span>
        </div>
      )}
    </div>
  );
}
