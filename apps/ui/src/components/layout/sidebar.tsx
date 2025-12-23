import React from 'react';
import {
  Code2,
  PanelLeft,
  Plus,
  Folder,
  Bell,
  FolderOpen,
  MoreVertical,
  LayoutGrid,
  Bot,
  FileJson,
  BookOpen,
  UserCircle,
  TerminalSquare,
  Book,
  Activity,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link, useLocation } from '@tanstack/react-router';

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col glass-sidebar z-30 relative h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 gap-3 flex-shrink-0">
        <div className="text-brand-cyan relative flex items-center justify-center">
          <div className="absolute inset-0 bg-brand-cyan blur-md opacity-30"></div>
          <Code2 className="w-6 h-6 relative z-10" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight">automaker.</span>
        <button className="ml-auto text-slate-600 hover:text-white transition">
          <PanelLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Top Actions */}
      <div className="px-5 pb-6 space-y-4 flex-shrink-0">
        <div className="grid grid-cols-4 gap-2">
          <button className="col-span-2 bg-dark-850/60 hover:bg-dark-700 text-slate-200 py-2 px-3 rounded-lg border border-white/5 flex items-center justify-center gap-2 transition text-xs font-medium shadow-lg shadow-black/20 group">
            <Plus className="w-3.5 h-3.5 group-hover:text-brand-cyan transition-colors" /> New
          </button>
          <button className="col-span-1 bg-dark-850/60 hover:bg-dark-700 text-slate-400 hover:text-white py-2 rounded-lg border border-white/5 flex items-center justify-center transition">
            <Folder className="w-3.5 h-3.5" />
            <span className="ml-1 text-[10px]">0</span>
          </button>
          <button className="col-span-1 bg-dark-850/60 hover:bg-dark-700 text-slate-400 hover:text-white py-2 rounded-lg border border-white/5 flex items-center justify-center transition relative">
            <Bell className="w-3.5 h-3.5" />
            <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-brand-red rounded-full ring-2 ring-dark-850"></span>
          </button>
        </div>

        {/* Project Selector */}
        <div className="bg-dark-850/40 border border-white/5 rounded-xl p-1 flex items-center justify-between cursor-pointer hover:border-white/10 hover:bg-dark-850/60 transition group">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <FolderOpen className="w-4 h-4 text-brand-cyan group-hover:text-cyan-300 transition" />
            <span className="text-white font-medium text-sm">test case 1</span>
          </div>
          <div className="flex items-center gap-1 pr-1">
            <span className="w-5 h-5 rounded bg-dark-700 flex items-center justify-center text-[10px] text-slate-400 font-bold border border-white/5">
              P
            </span>
            <MoreVertical className="w-4 h-4 text-slate-500" />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-0 space-y-6 custom-scrollbar">
        {/* Project Section */}
        <div>
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-6 font-mono">
            Project
          </h3>
          <nav className="space-y-0.5">
            <NavItem
              to="/"
              icon={<LayoutGrid className="w-4 h-4" />}
              label="Kanban Board"
              shortcut="L"
              isActive={location.pathname === '/' || location.pathname === '/board'}
            />
            <NavItem
              to="/agents"
              icon={<Bot className="w-4 h-4" />}
              label="Agent Runner"
              shortcut="A"
              isActive={location.pathname.startsWith('/agents')}
            />
          </nav>
        </div>

        {/* Tools Section */}
        <div>
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-6 font-mono">
            Tools
          </h3>
          <nav className="space-y-0.5">
            <NavItem
              to="/spec"
              icon={<FileJson className="w-4 h-4" />}
              label="Spec Editor"
              shortcut="D"
              isActive={location.pathname.startsWith('/spec')}
            />
            <NavItem
              to="/context"
              icon={<BookOpen className="w-4 h-4" />}
              label="Context"
              shortcut="C"
              isActive={location.pathname.startsWith('/context')}
            />
            <NavItem
              to="/profiles"
              icon={<UserCircle className="w-4 h-4" />}
              label="AI Profiles"
              shortcut="H"
              isActive={location.pathname.startsWith('/profiles')}
            />
            <NavItem
              to="/terminal"
              icon={<TerminalSquare className="w-4 h-4" />}
              label="Terminal"
              shortcut="T"
              isActive={location.pathname.startsWith('/terminal')}
            />
          </nav>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 space-y-1 bg-dark-900/30 flex-shrink-0 backdrop-blur-sm">
        <Link
          to="/wiki"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
        >
          <Book className="w-4 h-4" />
          <span className="text-sm">Wiki</span>
        </Link>
        <Link
          to="/running-agents"
          className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
        >
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-brand-cyan" />
            <span className="text-sm">Running Agents</span>
          </div>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-cyan text-[10px] text-black font-bold shadow-glow-cyan">
            3
          </span>
        </Link>
        <Link
          to="/settings"
          className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4" />
            <span className="text-sm">Settings</span>
          </div>
          <span className="text-[10px] bg-dark-700 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-white/5">
            S
          </span>
        </Link>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  icon,
  label,
  shortcut,
  isActive,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center justify-between px-6 py-2.5 transition group border-l-[2px]',
        isActive
          ? 'nav-item-active bg-gradient-to-r from-brand-cyan/10 to-transparent border-brand-cyan text-brand-cyan-hover'
          : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'
      )}
    >
      <div className="flex items-center gap-3">
        <span className={cn(isActive ? 'text-brand-cyan' : 'group-hover:text-slate-300')}>
          {icon}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span
        className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-mono border',
          isActive
            ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20'
            : 'bg-dark-700 text-slate-500 border-white/5 group-hover:text-slate-300'
        )}
      >
        {shortcut}
      </span>
    </Link>
  );
}
