"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Save, RefreshCw, FileText } from "lucide-react";
import { safeJoin } from "@/lib/path-utils";

export function SpecView() {
  const { currentProject, appSpec, setAppSpec } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load spec from file
  const loadSpec = useCallback(async () => {
    if (!currentProject) return;

    setIsLoading(true);
    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      const result = await api.readFile(
        safeJoin(currentProject.path, '.automaker', 'app_spec.txt')
      );

      if (result.success && result.content) {
        setAppSpec(result.content);
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to load spec:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, setAppSpec]);

  useEffect(() => {
    loadSpec();
  }, [loadSpec]);

  // Save spec to file
  const saveSpec = async () => {
    if (!currentProject) return;

    setIsSaving(true);
    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      await api.writeFile(
        safeJoin(currentProject.path, '.automaker', 'app_spec.txt'),
        appSpec
      );
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save spec:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (value: string) => {
    setAppSpec(value);
    setHasChanges(true);
  };

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="spec-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="spec-view-loading"
      >
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="spec-view"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">App Specification</h1>
            <p className="text-sm text-muted-foreground">
              {currentProject.path}/.automaker/app_spec.txt
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={saveSpec}
            disabled={!hasChanges || isSaving}
            data-testid="save-spec"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : hasChanges ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-4 overflow-hidden">
        <Card className="h-full overflow-hidden">
          <textarea
            className="w-full h-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none"
            value={appSpec}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Write your app specification here..."
            spellCheck={false}
            data-testid="spec-editor"
          />
        </Card>
      </div>
    </div>
  );
}
