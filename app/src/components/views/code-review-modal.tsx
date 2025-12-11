"use client";

import { Feature, ReviewIssue } from "@/store/app-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  Shield,
  Clock,
  FileText,
} from "lucide-react";

interface CodeReviewModalProps {
  feature: Feature;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRerunReview?: () => void;
}

export function CodeReviewModal({
  feature,
  open,
  onOpenChange,
  onRerunReview,
}: CodeReviewModalProps) {
  const results = feature.reviewResults;

  if (!results) return null;

  const getSeverityIcon = (severity: ReviewIssue["severity"]) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "info":
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityBadgeClass = (severity: ReviewIssue["severity"]) => {
    switch (severity) {
      case "error":
        return "bg-red-500/20 border-red-500/50 text-red-400";
      case "warning":
        return "bg-yellow-500/20 border-yellow-500/50 text-yellow-400";
      case "info":
        return "bg-blue-500/20 border-blue-500/50 text-blue-400";
    }
  };

  const totalErrors = results.checks.reduce(
    (sum, check) =>
      sum + check.issues.filter((i) => i.severity === "error").length,
    0
  );
  const totalWarnings = results.checks.reduce(
    (sum, check) =>
      sum + check.issues.filter((i) => i.severity === "warning").length,
    0
  );
  const totalInfo = results.checks.reduce(
    (sum, check) =>
      sum + check.issues.filter((i) => i.severity === "info").length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
        data-testid={`code-review-modal-${feature.id}`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Code Review Results
            {results.overallPass ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500 ml-2" />
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {feature.description.length > 100
              ? feature.description.slice(0, 100) + "..."
              : feature.description}
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="flex items-center gap-4 px-1 py-2 border-b border-border">
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              {new Date(results.timestamp).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {totalErrors > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {totalErrors} error{totalErrors !== 1 ? "s" : ""}
              </span>
            )}
            {totalWarnings > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                {totalWarnings} warning{totalWarnings !== 1 ? "s" : ""}
              </span>
            )}
            {totalInfo > 0 && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Info className="w-3.5 h-3.5" />
                {totalInfo} info
              </span>
            )}
            {totalErrors === 0 && totalWarnings === 0 && totalInfo === 0 && (
              <span className="text-xs text-green-400">No issues found</span>
            )}
          </div>
        </div>

        {/* Checks List */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {results.checks.map((check) => (
            <div
              key={check.name}
              className="rounded-lg border border-border overflow-hidden"
            >
              <div
                className={cn(
                  "flex items-center justify-between px-4 py-2",
                  check.passed
                    ? "bg-green-500/10 border-b border-green-500/20"
                    : "bg-red-500/10 border-b border-red-500/20"
                )}
              >
                <h3 className="font-medium capitalize flex items-center gap-2">
                  {check.name === "typescript" && (
                    <FileText className="w-4 h-4" />
                  )}
                  {check.name === "build" && (
                    <span className="text-base">🏗️</span>
                  )}
                  {check.name === "patterns" && (
                    <span className="text-base">🔍</span>
                  )}
                  {check.name} Check
                </h3>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    check.passed
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  )}
                >
                  {check.passed ? "Passed" : "Failed"}
                </span>
              </div>

              {check.issues.length > 0 ? (
                <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                  {check.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "p-2.5 rounded border text-sm",
                        getSeverityBadgeClass(issue.severity).replace(
                          "text-",
                          "text-foreground "
                        )
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {getSeverityIcon(issue.severity)}
                        <div className="flex-1 min-w-0">
                          <p className="break-words">{issue.message}</p>
                          {issue.file && (
                            <p className="text-xs text-muted-foreground mt-1 font-mono">
                              {issue.file}
                              {issue.line && `:${issue.line}`}
                              {issue.column && `:${issue.column}`}
                              {issue.code && (
                                <span className="ml-2 opacity-70">
                                  ({issue.code})
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground text-center">
                  No issues found
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-2">
          {onRerunReview && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onRerunReview();
              }}
              data-testid="rerun-review-button"
            >
              <Shield className="w-4 h-4 mr-2" />
              Re-run Review
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="close-review-button"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
