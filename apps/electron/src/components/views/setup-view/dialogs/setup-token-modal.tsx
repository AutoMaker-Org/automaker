"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Terminal,
  CheckCircle2,
  XCircle,
  Copy,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useOAuthAuthentication } from "../hooks";

interface SetupTokenModalProps {
  open: boolean;
  onClose: () => void;
  onTokenObtained: (token: string) => void;
}

export function SetupTokenModal({
  open,
  onClose,
  onTokenObtained,
}: SetupTokenModalProps) {
  // Use the OAuth authentication hook
  const { authState, output, token, error, startAuth, reset } =
    useOAuthAuthentication({ cliType: "claude" });

  const [manualToken, setManualToken] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      reset();
      setManualToken("");
    }
  }, [open, reset]);

  const handleUseToken = useCallback(() => {
    const tokenToUse = token || manualToken;
    if (tokenToUse.trim()) {
      onTokenObtained(tokenToUse.trim());
      onClose();
    }
  }, [token, manualToken, onTokenObtained, onClose]);

  const copyCommand = useCallback(() => {
    navigator.clipboard.writeText("claude setup-token");
    toast.success("Command copied to clipboard");
  }, []);

  const handleRetry = useCallback(() => {
    reset();
    setManualToken("");
  }, [reset]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl bg-card border-border"
        data-testid="setup-token-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Terminal className="w-5 h-5 text-brand-500" />
            Claude Subscription Authentication
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {authState === "idle" &&
              "Click Start to begin the authentication process."}
            {authState === "running" &&
              "Complete the sign-in in your browser..."}
            {authState === "success" &&
              "Authentication successful! Your token has been captured."}
            {authState === "error" &&
              "Authentication failed. Please try again or enter the token manually."}
            {authState === "manual" &&
              "Copy the token from your terminal and paste it below."}
          </DialogDescription>
        </DialogHeader>

        {/* Terminal Output */}
        <div
          ref={scrollRef}
          className="bg-zinc-900 rounded-lg p-4 font-mono text-sm max-h-48 overflow-y-auto border border-border mt-3"
        >
          {output.map((line, index) => (
            <div key={index} className="text-zinc-300 whitespace-pre-wrap">
              {line.startsWith("Error") || line.startsWith("⚠") ? (
                <span className="text-yellow-400">{line}</span>
              ) : line.startsWith("✓") ? (
                <span className="text-green-400">{line}</span>
              ) : (
                line
              )}
            </div>
          ))}
          {output.length === 0 && (
            <div className="text-zinc-500 italic">Waiting to start...</div>
          )}
          {authState === "running" && (
            <div className="flex items-center gap-2 text-brand-400 mt-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Waiting for authentication...</span>
            </div>
          )}
        </div>

        {/* Manual Token Input (for fallback) */}
        {(authState === "manual" || authState === "error") && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Run this command in your terminal:</span>
              <code className="bg-muted px-2 py-1 rounded font-mono text-foreground">
                claude setup-token
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyCommand}
                className="h-7 w-7"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-token" className="text-foreground">
                Paste your token:
              </Label>
              <Input
                id="manual-token"
                type="password"
                placeholder="Paste token here..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="bg-input border-border text-foreground"
                data-testid="manual-token-input"
              />
            </div>
          </div>
        )}

        {/* Success State */}
        {authState === "success" && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
            <div>
              <p className="font-medium text-foreground">
                Token captured successfully!
              </p>
              <p className="text-sm text-muted-foreground">
                Click &quot;Use Token&quot; to save and continue.
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && authState === "error" && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <XCircle className="w-6 h-6 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        <DialogFooter className="mt-5 flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>

          {authState === "idle" && (
            <Button
              onClick={startAuth}
              className="bg-brand-500 hover:bg-brand-600 text-white"
              data-testid="start-auth-button"
            >
              <Terminal className="w-4 h-4 mr-2" />
              Start Authentication
            </Button>
          )}

          {authState === "running" && (
            <Button disabled className="bg-brand-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Authenticating...
            </Button>
          )}

          {authState === "success" && (
            <Button
              onClick={handleUseToken}
              className="bg-green-500 hover:bg-green-600 text-white"
              data-testid="use-token-button"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Use Token
            </Button>
          )}

          {authState === "manual" && (
            <Button
              onClick={handleUseToken}
              disabled={!manualToken.trim()}
              className="bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50"
              data-testid="use-manual-token-button"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Use Token
            </Button>
          )}

          {authState === "error" && (
            <>
              {manualToken.trim() && (
                <Button
                  onClick={handleUseToken}
                  className="bg-green-500 hover:bg-green-600 text-white"
                >
                  Use Manual Token
                </Button>
              )}
              <Button
                onClick={handleRetry}
                className="bg-brand-500 hover:bg-brand-600 text-white"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
