/**
 * Beads View Component
 *
 * Main entry point for the Beads issue tracking system.
 * Displays issues, epics, and kanban boards.
 */

import { useAppStore } from '@/store/app-store';

export function BeadsView() {
  const { currentProject } = useAppStore();

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select a project to use Beads</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Beads Issue Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Track tasks, bugs, and dependencies for {currentProject.name}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Beads Integration</h2>
          <p className="text-muted-foreground mb-4">
            The Beads issue tracking system has been integrated into DevFlow. Full UI implementation
            is coming soon.
          </p>
          <div className="text-sm bg-muted p-4 rounded-lg">
            <p className="font-medium mb-2">Available Features:</p>
            <ul className="text-left space-y-1 text-sm">
              <li>✅ Backend API endpoints for all Beads operations</li>
              <li>✅ State management with Zustand</li>
              <li>✅ Navigation integration in sidebar</li>
              <li>✅ Agent workflow documentation (AGENTS.md)</li>
              <li>✅ TypeScript type definitions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
