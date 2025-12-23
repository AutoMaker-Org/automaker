import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface PageShellProps {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export function PageShell({ children, className, fullWidth = false }: PageShellProps) {
  return (
    <div className="relative w-full h-full pt-16 pb-24 px-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        className={cn(
          'w-full h-full rounded-3xl overflow-hidden',
          'bg-black/20 backdrop-blur-2xl border border-white/5 shadow-2xl',
          'flex flex-col',
          !fullWidth && 'max-w-7xl mx-auto',
          className
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}
