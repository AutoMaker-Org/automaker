import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
  MoreVertical,
  Pencil,
  Plus,
  Server,
  Settings2,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type {
  ClaudeCompatibleProvider,
  ClaudeCompatibleProviderType,
  ApiKeySource,
  ProviderModel,
  ClaudeModelAlias,
} from '@automaker/types';
import { CLAUDE_PROVIDER_TEMPLATES } from '@automaker/types';
import { Badge } from '@/components/ui/badge';

// Generate unique ID for providers
function generateProviderId(): string {
  return `provider-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Mask API key for display (show first 4 + last 4 chars)
function maskApiKey(key?: string): string {
  if (!key || key.length <= 8) return '••••••••';
  return `${key.substring(0, 4)}••••${key.substring(key.length - 4)}`;
}

// Provider type display names
const PROVIDER_TYPE_LABELS: Record<ClaudeCompatibleProviderType, string> = {
  anthropic: 'Anthropic',
  glm: 'GLM',
  minimax: 'MiniMax',
  openrouter: 'OpenRouter',
  custom: 'Custom',
};

// Provider type badge colors
const PROVIDER_TYPE_COLORS: Record<ClaudeCompatibleProviderType, string> = {
  anthropic: 'bg-brand-500/20 text-brand-500',
  glm: 'bg-emerald-500/20 text-emerald-500',
  minimax: 'bg-purple-500/20 text-purple-500',
  openrouter: 'bg-amber-500/20 text-amber-500',
  custom: 'bg-zinc-500/20 text-zinc-400',
};

// Claude model display names
const CLAUDE_MODEL_LABELS: Record<ClaudeModelAlias, string> = {
  haiku: 'Claude Haiku',
  sonnet: 'Claude Sonnet',
  opus: 'Claude Opus',
};

interface ModelFormEntry {
  id: string;
  displayName: string;
  mapsToClaudeModel: ClaudeModelAlias;
}

interface ProviderFormData {
  name: string;
  providerType: ClaudeCompatibleProviderType;
  baseUrl: string;
  apiKeySource: ApiKeySource;
  apiKey: string;
  useAuthToken: boolean;
  timeoutMs: string; // String for input, convert to number
  models: ModelFormEntry[];
  disableNonessentialTraffic: boolean;
}

const emptyFormData: ProviderFormData = {
  name: '',
  providerType: 'custom',
  baseUrl: '',
  apiKeySource: 'inline',
  apiKey: '',
  useAuthToken: false,
  timeoutMs: '',
  models: [],
  disableNonessentialTraffic: false,
};

// Provider types that have fixed settings (no need to show toggles)
const FIXED_SETTINGS_PROVIDERS: ClaudeCompatibleProviderType[] = ['glm', 'minimax'];

// Check if provider type has fixed settings
function hasFixedSettings(providerType: ClaudeCompatibleProviderType): boolean {
  return FIXED_SETTINGS_PROVIDERS.includes(providerType);
}

export function ApiProfilesSection() {
  const {
    claudeCompatibleProviders,
    addClaudeCompatibleProvider,
    updateClaudeCompatibleProvider,
    deleteClaudeCompatibleProvider,
    toggleClaudeCompatibleProviderEnabled,
  } = useAppStore();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>(emptyFormData);
  const [showApiKey, setShowApiKey] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [currentTemplate, setCurrentTemplate] = useState<
    (typeof CLAUDE_PROVIDER_TEMPLATES)[0] | null
  >(null);
  const [showModelMappings, setShowModelMappings] = useState(false);

  const handleOpenAddDialog = (templateName?: string) => {
    const template = templateName
      ? CLAUDE_PROVIDER_TEMPLATES.find((t) => t.name === templateName)
      : undefined;

    if (template) {
      setFormData({
        name: template.name,
        providerType: template.providerType,
        baseUrl: template.baseUrl,
        apiKeySource: template.defaultApiKeySource ?? 'inline',
        apiKey: '',
        useAuthToken: template.useAuthToken,
        timeoutMs: template.timeoutMs?.toString() ?? '',
        models: (template.defaultModels || []).map((m) => ({
          id: m.id,
          displayName: m.displayName,
          mapsToClaudeModel: m.mapsToClaudeModel || 'sonnet',
        })),
        disableNonessentialTraffic: template.disableNonessentialTraffic ?? false,
      });
      setCurrentTemplate(template);
    } else {
      setFormData(emptyFormData);
      setCurrentTemplate(null);
    }

    setEditingProviderId(null);
    setShowApiKey(false);
    // For fixed providers, hide model mappings by default (they have sensible defaults)
    setShowModelMappings(template ? !hasFixedSettings(template.providerType) : true);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (provider: ClaudeCompatibleProvider) => {
    // Find matching template by provider type
    const template = CLAUDE_PROVIDER_TEMPLATES.find(
      (t) => t.providerType === provider.providerType
    );

    setFormData({
      name: provider.name,
      providerType: provider.providerType,
      baseUrl: provider.baseUrl,
      apiKeySource: provider.apiKeySource ?? 'inline',
      apiKey: provider.apiKey ?? '',
      useAuthToken: provider.useAuthToken ?? false,
      timeoutMs: provider.timeoutMs?.toString() ?? '',
      models: (provider.models || []).map((m) => ({
        id: m.id,
        displayName: m.displayName,
        mapsToClaudeModel: m.mapsToClaudeModel || 'sonnet',
      })),
      disableNonessentialTraffic: provider.disableNonessentialTraffic ?? false,
    });
    setEditingProviderId(provider.id);
    setCurrentTemplate(template ?? null);
    setShowApiKey(false);
    // For fixed providers, hide model mappings by default when editing
    setShowModelMappings(!hasFixedSettings(provider.providerType));
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    // For GLM/MiniMax, enforce fixed settings
    const isFixedProvider = hasFixedSettings(formData.providerType);

    // Convert form models to ProviderModel format
    const models: ProviderModel[] = formData.models
      .filter((m) => m.id.trim()) // Only include models with IDs
      .map((m) => ({
        id: m.id.trim(),
        displayName: m.displayName.trim() || m.id.trim(),
        mapsToClaudeModel: m.mapsToClaudeModel,
      }));

    // Preserve enabled state when editing, default to true for new providers
    const existingProvider = editingProviderId
      ? claudeCompatibleProviders.find((p) => p.id === editingProviderId)
      : undefined;

    const providerData: ClaudeCompatibleProvider = {
      id: editingProviderId ?? generateProviderId(),
      name: formData.name.trim(),
      providerType: formData.providerType,
      enabled: existingProvider?.enabled ?? true,
      baseUrl: formData.baseUrl.trim(),
      // For fixed providers, always use inline
      apiKeySource: isFixedProvider ? 'inline' : formData.apiKeySource,
      // Only include apiKey when source is 'inline'
      apiKey: isFixedProvider || formData.apiKeySource === 'inline' ? formData.apiKey : undefined,
      // For fixed providers, always use auth token
      useAuthToken: isFixedProvider ? true : formData.useAuthToken,
      timeoutMs: (() => {
        const parsed = Number(formData.timeoutMs);
        return Number.isFinite(parsed) ? parsed : undefined;
      })(),
      models,
      // For fixed providers, always disable non-essential
      disableNonessentialTraffic: isFixedProvider
        ? true
        : formData.disableNonessentialTraffic || undefined,
    };

    if (editingProviderId) {
      updateClaudeCompatibleProvider(editingProviderId, providerData);
    } else {
      addClaudeCompatibleProvider(providerData);
    }

    setIsDialogOpen(false);
    setFormData(emptyFormData);
    setEditingProviderId(null);
  };

  const handleDelete = (id: string) => {
    deleteClaudeCompatibleProvider(id);
    setDeleteConfirmId(null);
  };

  const handleAddModel = () => {
    setFormData({
      ...formData,
      models: [...formData.models, { id: '', displayName: '', mapsToClaudeModel: 'sonnet' }],
    });
  };

  const handleUpdateModel = (index: number, updates: Partial<ModelFormEntry>) => {
    const newModels = [...formData.models];
    newModels[index] = { ...newModels[index], ...updates };
    setFormData({ ...formData, models: newModels });
  };

  const handleRemoveModel = (index: number) => {
    setFormData({
      ...formData,
      models: formData.models.filter((_, i) => i !== index),
    });
  };

  // Check for duplicate provider name (case-insensitive, excluding current provider when editing)
  const isDuplicateName = claudeCompatibleProviders.some(
    (p) => p.name.toLowerCase() === formData.name.trim().toLowerCase() && p.id !== editingProviderId
  );

  // For fixed providers, API key is always required (inline only)
  // For others, only required when source is 'inline'
  const isFixedProvider = hasFixedSettings(formData.providerType);
  const isFormValid =
    formData.name.trim().length > 0 &&
    formData.baseUrl.trim().length > 0 &&
    (isFixedProvider
      ? formData.apiKey.length > 0
      : formData.apiKeySource !== 'inline' || formData.apiKey.length > 0) &&
    !isDuplicateName;

  // Check model coverage
  const modelCoverage = {
    hasHaiku: formData.models.some((m) => m.mapsToClaudeModel === 'haiku'),
    hasSonnet: formData.models.some((m) => m.mapsToClaudeModel === 'sonnet'),
    hasOpus: formData.models.some((m) => m.mapsToClaudeModel === 'opus'),
  };
  const hasAllMappings = modelCoverage.hasHaiku && modelCoverage.hasSonnet && modelCoverage.hasOpus;

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-linear-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-500/10">
            <Server className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Model Providers</h3>
            <p className="text-xs text-muted-foreground">
              Configure providers whose models appear in all model selectors
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Provider
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleOpenAddDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Custom Provider
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {CLAUDE_PROVIDER_TEMPLATES.filter((t) => t.providerType !== 'anthropic').map(
              (template) => (
                <DropdownMenuItem
                  key={template.name}
                  onClick={() => handleOpenAddDialog(template.name)}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {template.name}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Info Banner */}
        <div className="p-3 rounded-lg bg-brand-500/5 border border-brand-500/20 text-sm text-muted-foreground">
          Models from enabled providers appear in all model dropdowns throughout the app. You can
          select different models from different providers for each phase.
        </div>

        {/* Provider List */}
        {claudeCompatibleProviders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed border-border/50 rounded-lg">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No model providers configured</p>
            <p className="text-xs mt-1">
              Add a provider to use alternative Claude-compatible models
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {claudeCompatibleProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onEdit={() => handleOpenEditDialog(provider)}
                onDelete={() => setDeleteConfirmId(provider.id)}
                onToggleEnabled={() => toggleClaudeCompatibleProviderEnabled(provider.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProviderId ? 'Edit Model Provider' : 'Add Model Provider'}
            </DialogTitle>
            <DialogDescription>
              {isFixedProvider
                ? `Configure ${PROVIDER_TYPE_LABELS[formData.providerType]} endpoint with model mappings to Claude.`
                : 'Configure a Claude-compatible API endpoint. Models from this provider will appear in all model selectors.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="provider-name">Provider Name</Label>
              <Input
                id="provider-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., GLM (Work)"
                className={isDuplicateName ? 'border-destructive' : ''}
              />
              {isDuplicateName && (
                <p className="text-xs text-destructive">A provider with this name already exists</p>
              )}
            </div>

            {/* Provider Type - only for custom providers */}
            {!isFixedProvider && (
              <div className="space-y-2">
                <Label>Provider Type</Label>
                <Select
                  value={formData.providerType}
                  onValueChange={(value: ClaudeCompatibleProviderType) =>
                    setFormData({ ...formData, providerType: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select provider type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="glm">GLM (z.AI)</SelectItem>
                    <SelectItem value="minimax">MiniMax</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* API Key - always shown first for fixed providers */}
            <div className="space-y-2">
              <Label htmlFor="provider-api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="provider-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="Enter API key"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              {currentTemplate?.apiKeyUrl && (
                <a
                  href={currentTemplate.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-400"
                >
                  Get API Key from {currentTemplate.name} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Base URL - hidden for fixed providers since it's pre-configured */}
            {!isFixedProvider && (
              <div className="space-y-2">
                <Label htmlFor="provider-base-url">API Base URL</Label>
                <Input
                  id="provider-base-url"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>
            )}

            {/* Advanced options for non-fixed providers only */}
            {!isFixedProvider && (
              <>
                {/* API Key Source */}
                <div className="space-y-2">
                  <Label>API Key Source</Label>
                  <Select
                    value={formData.apiKeySource}
                    onValueChange={(value: ApiKeySource) =>
                      setFormData({ ...formData, apiKeySource: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select API key source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inline">Enter key for this provider only</SelectItem>
                      <SelectItem value="credentials">
                        Use saved API key (from Settings → API Keys)
                      </SelectItem>
                      <SelectItem value="env">
                        Use environment variable (ANTHROPIC_API_KEY)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Use Auth Token */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label htmlFor="use-auth-token" className="font-medium">
                      Use Auth Token
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Use ANTHROPIC_AUTH_TOKEN instead of ANTHROPIC_API_KEY
                    </p>
                  </div>
                  <Switch
                    id="use-auth-token"
                    checked={formData.useAuthToken}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, useAuthToken: checked })
                    }
                  />
                </div>

                {/* Disable Non-essential Traffic */}
                <div className="flex items-center justify-between py-2">
                  <div>
                    <Label htmlFor="disable-traffic" className="font-medium">
                      Disable Non-essential Traffic
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Sets CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
                    </p>
                  </div>
                  <Switch
                    id="disable-traffic"
                    checked={formData.disableNonessentialTraffic}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, disableNonessentialTraffic: checked })
                    }
                  />
                </div>
              </>
            )}

            {/* Timeout */}
            <div className="space-y-2">
              <Label htmlFor="provider-timeout">Timeout (ms)</Label>
              <Input
                id="provider-timeout"
                type="number"
                value={formData.timeoutMs}
                onChange={(e) => setFormData({ ...formData, timeoutMs: e.target.value })}
                placeholder="Optional, e.g., 3000000"
              />
            </div>

            {/* Models */}
            <div className="space-y-3">
              {/* For fixed providers, show collapsible section */}
              {isFixedProvider ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Model Mappings</Label>
                      <p className="text-xs text-muted-foreground">
                        {formData.models.length} mappings configured (Haiku, Sonnet, Opus)
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowModelMappings(!showModelMappings)}
                      className="gap-2"
                    >
                      <Settings2 className="w-4 h-4" />
                      {showModelMappings ? 'Hide' : 'Customize'}
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 transition-transform',
                          showModelMappings && 'rotate-180'
                        )}
                      />
                    </Button>
                  </div>

                  {/* Expanded model mappings for fixed providers */}
                  {showModelMappings && (
                    <div className="space-y-2 pt-2">
                      {formData.models.map((model, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-3 bg-card/50 rounded-lg border border-border/30"
                        >
                          <div className="flex-1 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Model ID</Label>
                                <Input
                                  value={model.id}
                                  onChange={(e) => handleUpdateModel(index, { id: e.target.value })}
                                  placeholder="e.g., GLM-4.7"
                                  className="text-xs h-8"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                  Display Name
                                </Label>
                                <Input
                                  value={model.displayName}
                                  onChange={(e) =>
                                    handleUpdateModel(index, { displayName: e.target.value })
                                  }
                                  placeholder="e.g., GLM 4.7"
                                  className="text-xs h-8"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Maps to Claude Model
                              </Label>
                              <Select
                                value={model.mapsToClaudeModel}
                                onValueChange={(value: ClaudeModelAlias) =>
                                  handleUpdateModel(index, { mapsToClaudeModel: value })
                                }
                              >
                                <SelectTrigger className="text-xs h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="haiku">Haiku (fast, efficient)</SelectItem>
                                  <SelectItem value="sonnet">Sonnet (balanced)</SelectItem>
                                  <SelectItem value="opus">Opus (powerful)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveModel(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddModel}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Model
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Non-fixed providers: always show full editing UI */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-medium">Model Mappings</Label>
                      <p className="text-xs text-muted-foreground">
                        Map provider models to Claude equivalents (Haiku, Sonnet, Opus)
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddModel}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Model
                    </Button>
                  </div>

                  {/* Coverage warning - only for non-fixed providers */}
                  {formData.models.length > 0 && !hasAllMappings && (
                    <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
                      Missing mappings:{' '}
                      {[
                        !modelCoverage.hasHaiku && 'Haiku',
                        !modelCoverage.hasSonnet && 'Sonnet',
                        !modelCoverage.hasOpus && 'Opus',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  )}

                  {formData.models.length === 0 ? (
                    <div className="p-4 border border-dashed border-border/50 rounded-lg text-center text-sm text-muted-foreground">
                      No models configured. Add models to use with this provider.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.models.map((model, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-3 bg-card/50 rounded-lg border border-border/30"
                        >
                          <div className="flex-1 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Model ID</Label>
                                <Input
                                  value={model.id}
                                  onChange={(e) => handleUpdateModel(index, { id: e.target.value })}
                                  placeholder="e.g., GLM-4.7"
                                  className="text-xs h-8"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">
                                  Display Name
                                </Label>
                                <Input
                                  value={model.displayName}
                                  onChange={(e) =>
                                    handleUpdateModel(index, { displayName: e.target.value })
                                  }
                                  placeholder="e.g., GLM 4.7"
                                  className="text-xs h-8"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Maps to Claude Model
                              </Label>
                              <Select
                                value={model.mapsToClaudeModel}
                                onValueChange={(value: ClaudeModelAlias) =>
                                  handleUpdateModel(index, { mapsToClaudeModel: value })
                                }
                              >
                                <SelectTrigger className="text-xs h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="haiku">Haiku (fast, efficient)</SelectItem>
                                  <SelectItem value="sonnet">Sonnet (balanced)</SelectItem>
                                  <SelectItem value="opus">Opus (powerful)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveModel(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isFormValid}>
              {editingProviderId ? 'Save Changes' : 'Add Provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Provider?</DialogTitle>
            <DialogDescription>
              This will permanently delete the provider and its models. Any phase model
              configurations using these models will need to be updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ProviderCardProps {
  provider: ClaudeCompatibleProvider;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}

function ProviderCard({ provider, onEdit, onDelete, onToggleEnabled }: ProviderCardProps) {
  const isEnabled = provider.enabled !== false;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        isEnabled
          ? 'border-border/50 bg-card/50 hover:border-border'
          : 'border-border/30 bg-card/30 opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-foreground truncate">{provider.name}</h4>
            <Badge
              variant="secondary"
              className={cn('text-xs', PROVIDER_TYPE_COLORS[provider.providerType])}
            >
              {PROVIDER_TYPE_LABELS[provider.providerType]}
            </Badge>
            {!isEnabled && (
              <Badge variant="secondary" className="text-xs bg-zinc-500/20 text-zinc-400">
                Disabled
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-1">{provider.baseUrl}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span>Key: {maskApiKey(provider.apiKey)}</span>
            <span>{provider.models?.length || 0} model(s)</span>
          </div>
          {/* Show models with their Claude mapping */}
          {provider.models && provider.models.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {provider.models.map((model) => (
                <Badge
                  key={`${model.id}-${model.mapsToClaudeModel}`}
                  variant="outline"
                  className="text-xs"
                >
                  <span>{model.displayName || model.id}</span>
                  {model.mapsToClaudeModel && (
                    <span className="ml-1 text-muted-foreground">
                      → {CLAUDE_MODEL_LABELS[model.mapsToClaudeModel]}
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={isEnabled} onCheckedChange={onToggleEnabled} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
