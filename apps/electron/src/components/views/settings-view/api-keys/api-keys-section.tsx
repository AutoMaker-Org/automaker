import { useAppStore } from "@/store/app-store";
import { useSetupStore } from "@/store/setup-store";
import { Button } from "@/components/ui/button";
import { Key, CheckCircle2 } from "lucide-react";
import { ApiKeyField } from "./api-key-field";
import { buildProviderConfigs } from "@/config/api-providers";
import { AuthenticationStatusDisplay } from "./authentication-status-display";
import { SecurityNotice } from "./security-notice";
import { useApiKeyManagement } from "./hooks/use-api-key-management";

export function ApiKeysSection() {
  const { apiKeys } = useAppStore();
  const { claudeAuthStatus, codexAuthStatus } = useSetupStore();

  const { providerConfigParams, apiKeyStatus, handleSave, saved } =
    useApiKeyManagement();

  const providerConfigs = buildProviderConfigs(providerConfigParams);

  return (
    <div
      id="api-keys"
      className="rounded-xl border border-border bg-card backdrop-blur-md overflow-hidden scroll-mt-6"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Key className="w-5 h-5 text-brand-500" />
          <h2 className="text-lg font-semibold text-foreground">API Keys</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure your AI provider API keys. Keys are stored locally in your
          browser.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* API Key Fields */}
        {providerConfigs.map((provider) => (
          <ApiKeyField key={provider.key} config={provider} />
        ))}

        {/* Authentication Status Display */}
        <AuthenticationStatusDisplay
          claudeAuthStatus={claudeAuthStatus}
          codexAuthStatus={codexAuthStatus}
          apiKeyStatus={apiKeyStatus}
          apiKeys={apiKeys}
        />

        {/* Security Notice */}
        <SecurityNotice />

        {/* Save Button */}
        <div className="flex items-center gap-4 pt-2">
          <Button
            onClick={handleSave}
            data-testid="save-settings"
            className="min-w-[120px] bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-primary-foreground border-0"
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Saved!
              </>
            ) : (
              "Save API Keys"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
