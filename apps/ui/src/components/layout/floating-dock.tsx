import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useNavigate, useLocation } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Bot,
  FileText,
  Database,
  Terminal,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

export function FloatingDock() {
  const mouseX = useMotionValue(Infinity);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProject } = useAppStore();

  const navItems = [
    { id: 'board', icon: LayoutDashboard, label: 'Board', path: '/board' },
    { id: 'agent', icon: Bot, label: 'Agent', path: '/agent' },
    { id: 'spec', icon: FileText, label: 'Spec', path: '/spec' },
    { id: 'context', icon: Database, label: 'Context', path: '/context' },
    { id: 'profiles', icon: Users, label: 'Profiles', path: '/profiles' },
    { id: 'terminal', icon: Terminal, label: 'Terminal', path: '/terminal' },
    { id: 'settings', icon: Settings, label: 'Settings', path: '/settings' },
  ];

  if (!currentProject) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <motion.div
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className={cn(
          'flex h-16 items-end gap-4 rounded-2xl px-4 pb-3',
          'bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl'
        )}
      >
        {navItems.map((item) => (
          <DockIcon
            key={item.id}
            mouseX={mouseX}
            icon={item.icon}
            path={item.path}
            label={item.label}
            isActive={location.pathname.startsWith(item.path)}
            onClick={() => navigate({ to: item.path })}
          />
        ))}
      </motion.div>
    </div>
  );
}

function DockIcon({
  mouseX,
  icon: Icon,
  path,
  label,
  isActive,
  onClick,
}: {
  mouseX: any;
  icon: LucideIcon;
  path: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthSync = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  const width = useSpring(widthSync, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <motion.div
      ref={ref}
      style={{ width }}
      className="aspect-square cursor-pointer group relative"
      onClick={onClick}
    >
      {/* Tooltip */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-mono bg-black/80 text-white px-2 py-1 rounded backdrop-blur-md border border-white/10 pointer-events-none whitespace-nowrap">
        {label}
      </div>

      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-full transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(34,211,238,0.3)]'
            : 'bg-white/5 text-muted-foreground hover:bg-white/10'
        )}
      >
        <Icon className="h-[40%] w-[40%]" />
      </div>

      {/* Active Dot */}
      {isActive && (
        <motion.div
          layoutId="activeDockDot"
          className="absolute -bottom-2 left-1/2 w-1 h-1 bg-primary rounded-full -translate-x-1/2"
        />
      )}
    </motion.div>
  );
}
