import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Zap } from "lucide-react";
import type { ProviderConfig } from "@/config/api-providers";

interface ApiKeyFieldProps {
  config: ProviderConfig;
}

export function ApiKeyField({ config }: ApiKeyFieldProps) {
  const {
    label,
    inputId,
    placeholder,
    value,
    setValue,
    showValue,
    setShowValue,
    hasStoredKey,
    inputTestId,
    toggleTestId,
    testButton,
    result,
    resultTestId,
    resultMessageTestId,
    descriptionPrefix,
    descriptionLinkHref,
    descriptionLinkText,
    descriptionSuffix,
  } = config;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label htmlFor={inputId} className="text-foreground">
          {label}
        </Label>
        {hasStoredKey && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={inputId}
            type={showValue ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="pr-10 bg-input border-border text-foreground placeholder:text-muted-foreground"
            data-testid={inputTestId}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent"
            onClick={() => setShowValue(!showValue)}
            data-testid={toggleTestId}
          >
            {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={testButton.onClick}
          disabled={testButton.disabled}
          className="bg-secondary hover:bg-accent text-secondary-foreground border border-border"
          data-testid={testButton.testId}
        >
          {testButton.loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Test
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {descriptionPrefix}{" "}
        <a
          href={descriptionLinkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-500 hover:text-brand-400 hover:underline"
        >
          {descriptionLinkText}
        </a>
        {descriptionSuffix}
      </p>
      {result && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            result.success
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
          data-testid={resultTestId}
        >
          {result.success ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm" data-testid={resultMessageTestId}>
            {result.message}
          </span>
        </div>
      )}
    </div>
  );
}
