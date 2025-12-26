import { useEffect, useState, useMemo } from 'react';

const TOTAL_DURATION = 2300; // Total animation duration in ms (tightened from 4000)
const LOGO_ENTER_DURATION = 500; // Tightened from 1200
const PARTICLES_ENTER_DELAY = 100; // Tightened from 400
const EXIT_START = 1800; // Adjusted for shorter duration

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  angle: number;
  distance: number;
  opacity: number;
  floatDuration: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + Math.random() * 30;
    const distance = 60 + Math.random() * 80; // Increased spread
    return {
      id: i,
      x: Math.cos((angle * Math.PI) / 180) * distance,
      y: Math.sin((angle * Math.PI) / 180) * distance,
      size: 3 + Math.random() * 6, // Slightly smaller range for more subtle look
      delay: Math.random() * 400,
      angle,
      distance: 300 + Math.random() * 200,
      opacity: 0.4 + Math.random() * 0.6,
      floatDuration: 3000 + Math.random() * 4000,
    };
  });
}

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit' | 'done'>('enter');

  const particles = useMemo(() => generateParticles(50), []);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Phase transitions
    timers.push(setTimeout(() => setPhase('hold'), LOGO_ENTER_DURATION));
    timers.push(setTimeout(() => setPhase('exit'), EXIT_START));
    timers.push(
      setTimeout(() => {
        setPhase('done');
        onComplete();
      }, TOTAL_DURATION)
    );

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (phase === 'done') return null;

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex items-center justify-center
        bg-background
        transition-opacity duration-500 ease-out
        ${phase === 'exit' ? 'opacity-0' : 'opacity-100'}
      `}
      style={{
        pointerEvents: phase === 'exit' ? 'none' : 'auto',
      }}
    >
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-slow-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(6px, -6px); }
        }
      `}</style>

      {/* Subtle gradient background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(circle at center, var(--brand-500) 0%, transparent 70%)',
        }}
      />

      {/* Particle container 1 - Clockwise */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ animation: 'spin-slow 60s linear infinite' }}
      >
        {particles.slice(0, 25).map((particle) => (
          <div
            key={particle.id}
            className="absolute"
            style={{
              transform:
                phase === 'exit'
                  ? `translate(${Math.cos((particle.angle * Math.PI) / 180) * particle.distance}px, ${Math.sin((particle.angle * Math.PI) / 180) * particle.distance}px)`
                  : `translate(${particle.x}px, ${particle.y}px)`,
              transition:
                phase === 'enter'
                  ? `all 600ms ease-out ${PARTICLES_ENTER_DELAY + particle.delay}ms`
                  : phase === 'exit'
                    ? `all 800ms cubic-bezier(0.4, 0, 1, 1) ${particle.delay * 0.3}ms`
                    : 'all 300ms ease-out',
            }}
          >
            <div
              className="rounded-full"
              style={{
                width: particle.size,
                height: particle.size,
                background: `linear-gradient(135deg, var(--brand-400), var(--brand-600))`,
                boxShadow: `0 0 ${particle.size * 2}px var(--brand-500)`,
                opacity: phase === 'enter' ? 0 : phase === 'hold' ? particle.opacity : 0,
                transform: phase === 'exit' ? 'scale(0)' : 'scale(1)',
                animation: `float ${particle.floatDuration}ms ease-in-out infinite`,
                transition: 'opacity 300ms ease-out, transform 300ms ease-out',
              }}
            />
          </div>
        ))}
      </div>

      {/* Particle container 2 - Counter-Clockwise */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ animation: 'spin-slow-reverse 75s linear infinite' }}
      >
        {particles.slice(25).map((particle) => (
          <div
            key={particle.id}
            className="absolute"
            style={{
              transform:
                phase === 'exit'
                  ? `translate(${Math.cos((particle.angle * Math.PI) / 180) * particle.distance}px, ${Math.sin((particle.angle * Math.PI) / 180) * particle.distance}px)`
                  : `translate(${particle.x}px, ${particle.y}px)`,
              transition:
                phase === 'enter'
                  ? `all 600ms ease-out ${PARTICLES_ENTER_DELAY + particle.delay}ms`
                  : phase === 'exit'
                    ? `all 800ms cubic-bezier(0.4, 0, 1, 1) ${particle.delay * 0.3}ms`
                    : 'all 300ms ease-out',
            }}
          >
            <div
              className="rounded-full"
              style={{
                width: particle.size,
                height: particle.size,
                background: `linear-gradient(135deg, var(--brand-400), var(--brand-600))`,
                boxShadow: `0 0 ${particle.size * 2}px var(--brand-500)`,
                opacity: phase === 'enter' ? 0 : phase === 'hold' ? particle.opacity : 0,
                transform: phase === 'exit' ? 'scale(0)' : 'scale(1)',
                animation: `float ${particle.floatDuration}ms ease-in-out infinite`,
                animationDelay: `${particle.delay}ms`,
                transition: 'opacity 300ms ease-out, transform 300ms ease-out',
              }}
            />
          </div>
        ))}
      </div>

      {/* Logo container */}
      <div
        className="relative z-10"
        style={{
          opacity: phase === 'enter' ? 0 : phase === 'exit' ? 0 : 1,
          transform:
            phase === 'enter'
              ? 'scale(0.3) rotate(-20deg)'
              : phase === 'exit'
                ? 'scale(2.5) translateY(-100px)'
                : 'scale(1) rotate(0deg)',
          transition:
            phase === 'enter'
              ? `all ${LOGO_ENTER_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1)`
              : phase === 'exit'
                ? 'all 600ms cubic-bezier(0.4, 0, 1, 1)'
                : 'all 300ms ease-out',
        }}
      >
        {/* Glow effect behind logo */}
        <div
          className="absolute inset-0 blur-3xl"
          style={{
            background: 'radial-gradient(circle, var(--brand-500) 0%, transparent 70%)',
            transform: 'scale(2.5)',
            opacity: phase === 'hold' ? 0.6 : 0,
            transition: 'opacity 500ms ease-out',
          }}
        />

        {/* The logo */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 256 256"
          role="img"
          aria-label="DevFlow Logo"
          className="relative z-10"
          style={{
            width: 120,
            height: 120,
            filter: 'drop-shadow(0 0 30px var(--brand-500))',
          }}
        >
          <defs>
            <linearGradient
              id="splash-bg"
              x1="0"
              y1="0"
              x2="256"
              y2="256"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
            </linearGradient>
            <filter id="splash-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                floodColor="#000000"
                floodOpacity="0.25"
              />
            </filter>
          </defs>
          <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#splash-bg)" />
          <g
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#splash-shadow)"
          >
            <path d="M92 92 L52 128 L92 164" />
            <path d="M144 72 L116 184" />
            <path d="M164 92 L204 128 L164 164" />
          </g>
        </svg>
      </div>

      {/* DevFlow text that fades in below the logo */}
      <div
        className="absolute flex items-center gap-1"
        style={{
          top: 'calc(50% + 80px)',
          opacity: phase === 'enter' ? 0 : phase === 'exit' ? 0 : 1,
          transform:
            phase === 'enter'
              ? 'translateY(20px)'
              : phase === 'exit'
                ? 'translateY(-30px) scale(1.2)'
                : 'translateY(0)',
          transition:
            phase === 'enter'
              ? `all 600ms ease-out ${LOGO_ENTER_DURATION - 200}ms`
              : phase === 'exit'
                ? 'all 500ms cubic-bezier(0.4, 0, 1, 1)'
                : 'all 300ms ease-out',
        }}
      >
        <span className="font-bold text-foreground text-4xl tracking-tight leading-none">
          DevFlow<span className="text-brand-500">.</span><span className="font-outline">brnd</span>
        </span>
      </div>
    </div>
  );
}
