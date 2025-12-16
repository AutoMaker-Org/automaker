"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Loader2 } from "lucide-react";
import { getElectronAPI } from "@/lib/electron";
import { toast } from "sonner";

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  onCreated: (worktreePath: string) => void;
}

export function CreateWorktreeDialog({
  open,
  onOpenChange,
  projectPath,
  onCreated,
}: CreateWorktreeDialogProps) {
  const [branchName, setBranchName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    // Validate branch name (git-compatible)
    const validBranchRegex = /^[a-zA-Z0-9._/-]+$/;
    if (!validBranchRegex.test(branchName)) {
      setError(
        "Invalid branch name. Use only letters, numbers, dots, underscores, hyphens, and slashes."
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const api = getElectronAPI();
      if (!api?.worktree?.create) {
        setError("Worktree API not available");
        return;
      }
      const result = await api.worktree.create(projectPath, branchName);

      if (result.success && result.worktree) {
        toast.success(
          `Worktree created for branch "${result.worktree.branch}"`,
          {
            description: result.worktree.isNew
              ? "New branch created"
              : "Using existing branch",
          }
        );
        onCreated(result.worktree.path);
        onOpenChange(false);
        setBranchName("");
      } else {
        setError(result.error || "Failed to create worktree");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create worktree");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading && branchName.trim()) {
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Create New Worktree
          </DialogTitle>
          <DialogDescription>
            Create a new git worktree with its own branch. This allows you to
            work on multiple features in parallel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              placeholder="feature/my-new-feature"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="font-mono text-sm"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Examples:</p>
            <ul className="list-disc list-inside pl-2 space-y-0.5">
              <li>
                <code className="bg-muted px-1 rounded">feature/user-auth</code>
              </li>
              <li>
                <code className="bg-muted px-1 rounded">fix/login-bug</code>
              </li>
              <li>
                <code className="bg-muted px-1 rounded">hotfix/security-patch</code>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isLoading || !branchName.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <GitBranch className="w-4 h-4 mr-2" />
                Create Worktree
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
