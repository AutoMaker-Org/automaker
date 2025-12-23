import { Users, Play, Plus } from 'lucide-react';

export function TopHeader() {
  return (
    <header className="h-16 glass-header flex items-center justify-between px-8 flex-shrink-0 z-20">
      <div>
        <h1 className="text-white font-bold text-lg tracking-tight">Kanban Board</h1>
        <p className="text-xs text-slate-500 font-medium font-mono mt-0.5">test case 1</p>
      </div>

      <div className="flex items-center gap-4">
        {/* User Toggle */}
        <div className="flex items-center bg-dark-850/60 rounded-lg p-1 border border-white/5 h-9 shadow-inner-light">
          <div className="flex items-center gap-3 px-2 border-r border-white/5 h-full mr-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            {/* Toggle Switch */}
            <div className="w-[28px] h-[16px] bg-[#2d3546] rounded-full relative cursor-pointer border border-white/10 transition-colors">
              <div className="absolute top-[2px] right-[2px] w-[10px] h-[10px] bg-brand-cyan rounded-full shadow-[0_0_6px_rgba(6,182,212,0.6)]"></div>
            </div>
          </div>
          <span className="text-xs text-slate-400 px-1 font-mono">3</span>
        </div>

        {/* Auto Mode */}
        <button className="flex items-center gap-2 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 bg-dark-850/60 hover:bg-dark-700 transition text-xs font-medium h-9">
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Auto Mode</span>
        </button>

        {/* Add Feature */}
        <button className="flex items-center gap-2 bg-brand-cyan hover:bg-cyan-400 text-dark-950 font-bold px-4 py-1.5 rounded-lg transition shadow-glow-cyan text-xs h-9 btn-hover-effect">
          <Plus className="w-4 h-4" />
          <span>Add Feature</span>
        </button>
      </div>
    </header>
  );
}
