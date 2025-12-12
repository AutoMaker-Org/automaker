import { Button } from "@/components/ui/button";
import { Trash2, Folder } from "lucide-react";
import type { Project } from "../shared/types";

interface DangerZoneSectionProps {
  project: Project | null;
  onDeleteClick: () => void;
}

export function DangerZoneSection({
  project,
  onDeleteClick,
}: DangerZoneSectionProps) {
  if (!project) return null;

  return (
    <div
      id="danger"
      className="rounded-xl border border-destructive/30 bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-destructive/30">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 className="w-5 h-5 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Danger Zone</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanently remove this project from Automaker.
        </p>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-sidebar-accent/20 border border-sidebar-border flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5 text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">
                {project.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {project.path}
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={onDeleteClick}
            data-testid="delete-project-button"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Project
          </Button>
        </div>
      </div>
    </div>
  );
}
