import { ReactNode } from 'react';
import { Sidebar } from './sidebar';
// TopHeader removed from layout to be view-specific

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-full relative selection:bg-brand-cyan selection:text-black font-sans bg-dark-950 overflow-hidden">
      {/* Ambient Background */}
      <div
        className="fixed bottom-[-25%] left-[-15%] w-[1000px] h-[1000px] opacity-80 pointer-events-none z-0 blob-rainbow"
        style={{
          background:
            'radial-gradient(circle at center, rgba(6, 182, 212, 0.15) 0%, rgba(59, 130, 246, 0.12) 30%, rgba(249, 115, 22, 0.08) 60%, transparent 80%)',
          filter: 'blur(100px)',
        }}
      ></div>
      <div
        className="fixed top-[-20%] right-[-10%] w-[700px] h-[700px] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.05) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }}
      ></div>

      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 relative z-10 h-full">
        <div className="flex-1 overflow-hidden relative">{children}</div>
      </main>
    </div>
  );
}
