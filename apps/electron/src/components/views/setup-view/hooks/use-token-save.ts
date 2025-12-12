import { useState, useCallback } from "react";
import { toast } from "sonner";
import { services, isBootstrapped } from "@/services";

interface UseTokenSaveOptions {
  provider: string; // e.g., "anthropic_oauth_token", "anthropic", "openai"
  onSuccess?: () => void;
}

export function useTokenSave({ provider, onSuccess }: UseTokenSaveOptions) {
  const [isSaving, setIsSaving] = useState(false);

  const saveToken = useCallback(
    async (tokenValue: string) => {
      if (!tokenValue.trim()) {
        toast.error("Please enter a valid token");
        return false;
      }

      if (!isBootstrapped()) {
        toast.error("Services not initialized");
        return false;
      }

      setIsSaving(true);
      try {
        const result = await services.setup.storeApiKey(provider, tokenValue);
        console.log(`[Token Save] Store result for ${provider}:`, result);

        if (result.success) {
          const tokenType = provider.includes("oauth")
            ? "subscription token"
            : "API key";
          toast.success(`${tokenType} saved successfully`);
          onSuccess?.();
          return true;
        } else {
          toast.error("Failed to save token", { description: result.error });
          return false;
        }
      } catch (error) {
        console.error(`[Token Save] Failed to save ${provider}:`, error);
        toast.error("Failed to save token");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [provider, onSuccess]
  );

  return { isSaving, saveToken };
}
