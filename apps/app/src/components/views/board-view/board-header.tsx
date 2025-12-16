"use client";

import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Slider } from "@/components/ui/slider";
import { Play, StopCircle, Plus, Users } from "lucide-react";
import { KeyboardShortcut } from "@/hooks/use-keyboard-shortcuts";

interface BoardHeaderProps {
  projectName: string;
  maxConcurrency: number;
  onConcurrencyChange: (value: number) => void;
  isAutoModeRunning: boolean;
  onStartAutoMode: () => void;
  onStopAutoMode: () => void;
  onAddFeature: () => void;
  addFeatureShortcut: KeyboardShortcut;
  isMounted: boolean;
}

export function BoardHeader({
  projectName,
  maxConcurrency,
  onConcurrencyChange,
  isAutoModeRunning,
  onStartAutoMode,
  onStopAutoMode,
  onAddFeature,
  addFeatureShortcut,
  isMounted,
}: BoardHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
      <div>
        <h1 className="text-xl font-bold">Kanban Board</h1>
        <p className="text-sm text-muted-foreground">{projectName}</p>
      </div>
      <div className="flex gap-2 items-center">
        {/* Concurrency Slider - only show after mount to prevent hydration issues */}
        {isMounted && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border"
            data-testid="concurrency-slider-container"
          >
            <Users className="w-4 h-4 text-muted-foreground" />
            <Slider
              value={[maxConcurrency]}
              onValueChange={(value) => onConcurrencyChange(value[0])}
              min={1}
              max={10}
              step={1}
              className="w-20"
              data-testid="concurrency-slider"
            />
            <span
              className="text-sm text-muted-foreground min-w-[2ch] text-center"
              data-testid="concurrency-value"
            >
              {maxConcurrency}
            </span>
          </div>
        )}

        {/* Auto Mode Toggle - only show after mount to prevent hydration issues */}
        {isMounted && (
          <>
            {isAutoModeRunning ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onStopAutoMode}
                data-testid="stop-auto-mode"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Stop Auto Plus
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={onStartAutoMode}
                data-testid="start-auto-mode"
              >
                <Play className="w-4 h-4 mr-2" />
                Auto Plus
              </Button>
            )}
          </>
        )}

        <HotkeyButton
          size="sm"
          onClick={onAddFeature}
          hotkey={addFeatureShortcut}
          hotkeyActive={false}
          data-testid="add-feature-button"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Feature
        </HotkeyButton>
      </div>
    </div>
  );
}
