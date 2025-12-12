"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface CountUpTimerProps {
  startedAt: string; // ISO timestamp string
  className?: string;
}

/**
 * Formats elapsed time in MM:SS format
 * @param seconds - Total elapsed seconds
 * @returns Formatted string like "00:00", "01:30", "59:59", etc.
 */
function formatElapsedTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const paddedMinutes = minutes.toString().padStart(2, "0");
  const paddedSeconds = remainingSeconds.toString().padStart(2, "0");

  return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * CountUpTimer component that displays elapsed time since a given start time
 * Updates every second to show the current elapsed time in MM:SS format
 */
export function CountUpTimer({ startedAt, className = "" }: CountUpTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    // Calculate initial elapsed time
    const startTime = new Date(startedAt).getTime();

    const calculateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      return Math.max(0, elapsed); // Ensure non-negative
    };

    // Set initial value
    setElapsedSeconds(calculateElapsed());

    // Update every second
    const interval = setInterval(() => {
      setElapsedSeconds(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div
      className={`flex items-center gap-1 text-xs text-muted-foreground ${className}`}
      data-testid="count-up-timer"
    >
      <Clock className="w-3 h-3" />
      <span data-testid="timer-display">{formatElapsedTime(elapsedSeconds)}</span>
    </div>
  );
}
