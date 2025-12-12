"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useAppStore,
  AIProfile,
  AgentModel,
  ThinkingLevel,
  ModelProvider,
} from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn, modelSupportsThinking } from "@/lib/utils";
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from "@/hooks/use-keyboard-shortcuts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UserCircle,
  Plus,
  Pencil,
  Trash2,
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
  GripVertical,
  Lock,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Icon mapping for profiles
const PROFILE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
};

// Available icons for selection
const ICON_OPTIONS = [
  { name: "Brain", icon: Brain },
  { name: "Zap", icon: Zap },
  { name: "Scale", icon: Scale },
  { name: "Cpu", icon: Cpu },
  { name: "Rocket", icon: Rocket },
  { name: "Sparkles", icon: Sparkles },
];

// Model options for the form
const CLAUDE_MODELS: { id: AgentModel; label: string }[] = [
  { id: "haiku", label: "Claude Haiku" },
  { id: "sonnet", label: "Claude Sonnet" },
  { id: "opus", label: "Claude Opus" },
];

const CODEX_MODELS: { id: AgentModel; label: string }[] = [
  { id: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
  { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
  { id: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
  { id: "gpt-5.1", label: "GPT-5.1" },
];

const THINKING_LEVELS: { id: ThinkingLevel; label: string }[] = [
  { id: "none", label: "None" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "ultrathink", label: "Ultrathink" },
];

// Helper to determine provider from model
function getProviderFromModel(model: AgentModel): ModelProvider {
  if (model.startsWith("gpt")) {
    return "codex";
  }
  return "claude";
}

// Sortable Profile Card Component
function SortableProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: AIProfile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profile.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const IconComponent = profile.icon ? PROFILE_ICONS[profile.icon] : Brain;
  const isCodex = profile.provider === "codex";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-start gap-4 p-4 rounded-xl border bg-card transition-all",
        isDragging && "shadow-lg",
        profile.isBuiltIn
          ? "border-border/50"
          : "border-border hover:border-primary/50 hover:shadow-sm"
      )}
      data-testid={`profile-card-${profile.id}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded hover:bg-accent cursor-grab active:cursor-grabbing flex-shrink-0 mt-1"
        data-testid={`profile-drag-handle-${profile.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Icon */}
      <div
        className={cn(
          "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
          isCodex ? "bg-emerald-500/10" : "bg-primary/10"
        )}
      >
        {IconComponent && (
          <IconComponent
            className={cn(
              "w-5 h-5",
              isCodex ? "text-emerald-500" : "text-primary"
            )}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{profile.name}</h3>
          {profile.isBuiltIn && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Lock className="w-2.5 h-2.5" />
              Built-in
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {profile.description}
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full border",
              isCodex
                ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                : "border-primary/30 text-primary bg-primary/10"
            )}
          >
            {profile.model}
          </span>
          {profile.thinkingLevel !== "none" && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10">
              {profile.thinkingLevel}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!profile.isBuiltIn && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 w-8 p-0"
            data-testid={`edit-profile-${profile.id}`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            data-testid={`delete-profile-${profile.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Profile Form Component
function ProfileForm({
  profile,
  onSave,
  onCancel,
  isEditing,
  hotkeyActive,
}: {
  profile: Partial<AIProfile>;
  onSave: (profile: Omit<AIProfile, "id">) => void;
  onCancel: () => void;
  isEditing: boolean;
  hotkeyActive: boolean;
}) {
  const [formData, setFormData] = useState({
    name: profile.name || "",
    description: profile.description || "",
    model: profile.model || ("opus" as AgentModel),
    thinkingLevel: profile.thinkingLevel || ("none" as ThinkingLevel),
    icon: profile.icon || "Brain",
  });

  const provider = getProviderFromModel(formData.model);
  const supportsThinking = modelSupportsThinking(formData.model);

  const handleModelChange = (model: AgentModel) => {
    const newProvider = getProviderFromModel(model);
    setFormData({
      ...formData,
      model,
      // Reset thinking level when switching to Codex (doesn't support thinking)
      thinkingLevel: newProvider === "codex" ? "none" : formData.thinkingLevel,
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a profile name");
      return;
    }

    onSave({
      name: formData.name.trim(),
      description: formData.description.trim(),
      model: formData.model,
      thinkingLevel: supportsThinking ? formData.thinkingLevel : "none",
      provider,
      isBuiltIn: false,
      icon: formData.icon,
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="profile-name">Profile Name</Label>
        <Input
          id="profile-name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Heavy Task, Quick Fix"
          data-testid="profile-name-input"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="profile-description">Description</Label>
        <Textarea
          id="profile-description"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="Describe when to use this profile..."
          rows={2}
          data-testid="profile-description-input"
        />
      </div>

      {/* Icon Selection */}
      <div className="space-y-2">
        <Label>Icon</Label>
        <div className="flex gap-2 flex-wrap">
          {ICON_OPTIONS.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              onClick={() => setFormData({ ...formData, icon: name })}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center border transition-colors",
                formData.icon === name
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-input"
              )}
              data-testid={`icon-select-${name}`}
            >
              <Icon className="w-5 h-5" />
            </button>
          ))}
        </div>
      </div>

      {/* Model Selection - Claude */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Claude Models
        </Label>
        <div className="flex gap-2 flex-wrap">
          {CLAUDE_MODELS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleModelChange(id)}
              className={cn(
                "flex-1 min-w-[100px] px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                formData.model === id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-accent border-input"
              )}
              data-testid={`model-select-${id}`}
            >
              {label.replace("Claude ", "")}
            </button>
          ))}
        </div>
      </div>

      {/* Model Selection - Codex */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-500" />
          Codex Models
        </Label>
        <div className="flex gap-2 flex-wrap">
          {CODEX_MODELS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleModelChange(id)}
              className={cn(
                "flex-1 min-w-[100px] px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                formData.model === id
                  ? "bg-emerald-600 text-white border-emerald-500"
                  : "bg-background hover:bg-accent border-input"
              )}
              data-testid={`model-select-${id}`}
            >
              {label.replace("GPT-5.1 ", "").replace("Codex ", "")}
            </button>
          ))}
        </div>
      </div>

      {/* Thinking Level - Only for Claude models */}
      {supportsThinking && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-500" />
            Thinking Level
          </Label>
          <div className="flex gap-2 flex-wrap">
            {THINKING_LEVELS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFormData({ ...formData, thinkingLevel: id });
                  if (id === "ultrathink") {
                    toast.warning("Ultrathink uses extensive reasoning", {
                      description:
                        "Best for complex architecture, migrations, or deep debugging (~$0.48/task).",
                      duration: 4000,
                    });
                  }
                }}
                className={cn(
                  "flex-1 min-w-[70px] px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                  formData.thinkingLevel === id
                    ? "bg-amber-500 text-white border-amber-400"
                    : "bg-background hover:bg-accent border-input"
                )}
                data-testid={`thinking-select-${id}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Higher levels give more time to reason through complex problems.
          </p>
        </div>
      )}

      {/* Actions */}
      <DialogFooter className="pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <HotkeyButton
          onClick={handleSubmit}
          hotkey={{ key: "Enter", cmdCtrl: true }}
          hotkeyActive={hotkeyActive}
          data-testid="save-profile-button"
        >
          {isEditing ? "Save Changes" : "Create Profile"}
        </HotkeyButton>
      </DialogFooter>
    </div>
  );
}

export function ProfilesView() {
  const {
    aiProfiles,
    addAIProfile,
    updateAIProfile,
    removeAIProfile,
    reorderAIProfiles,
  } = useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AIProfile | null>(null);

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Separate built-in and custom profiles
  const builtInProfiles = useMemo(
    () => aiProfiles.filter((p) => p.isBuiltIn),
    [aiProfiles]
  );
  const customProfiles = useMemo(
    () => aiProfiles.filter((p) => !p.isBuiltIn),
    [aiProfiles]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = aiProfiles.findIndex((p) => p.id === active.id);
        const newIndex = aiProfiles.findIndex((p) => p.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          reorderAIProfiles(oldIndex, newIndex);
        }
      }
    },
    [aiProfiles, reorderAIProfiles]
  );

  const handleAddProfile = (profile: Omit<AIProfile, "id">) => {
    addAIProfile(profile);
    setShowAddDialog(false);
    toast.success("Profile created", {
      description: `Created "${profile.name}" profile`,
    });
  };

  const handleUpdateProfile = (profile: Omit<AIProfile, "id">) => {
    if (editingProfile) {
      updateAIProfile(editingProfile.id, profile);
      setEditingProfile(null);
      toast.success("Profile updated", {
        description: `Updated "${profile.name}" profile`,
      });
    }
  };

  const handleDeleteProfile = (profile: AIProfile) => {
    if (profile.isBuiltIn) return;

    removeAIProfile(profile.id);
    toast.success("Profile deleted", {
      description: `Deleted "${profile.name}" profile`,
    });
  };

  // Build keyboard shortcuts for profiles view
  const profilesShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Add profile shortcut - when in profiles view
    shortcutsList.push({
      key: shortcuts.addProfile,
      action: () => setShowAddDialog(true),
      description: "Create new profile",
    });

    return shortcutsList;
  }, [shortcuts]);

  // Register keyboard shortcuts for profiles view
  useKeyboardShortcuts(profilesShortcuts);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="profiles-view"
    >
      {/* Header Section */}
      <div className="shrink-0 border-b border-border bg-glass backdrop-blur-md">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/20 flex items-center justify-center">
                <UserCircle className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  AI Profiles
                </h1>
                <p className="text-sm text-muted-foreground">
                  Create and manage model configuration presets
                </p>
              </div>
            </div>
            <HotkeyButton
              onClick={() => setShowAddDialog(true)}
              hotkey={shortcuts.addProfile}
              hotkeyActive={false}
              data-testid="add-profile-button"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Profile
            </HotkeyButton>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Custom Profiles Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                Custom Profiles
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {customProfiles.length}
              </span>
            </div>
            {customProfiles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">
                  No custom profiles yet. Create one to get started!
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowAddDialog(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Profile
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={customProfiles.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {customProfiles.map((profile) => (
                      <SortableProfileCard
                        key={profile.id}
                        profile={profile}
                        onEdit={() => setEditingProfile(profile)}
                        onDelete={() => handleDeleteProfile(profile)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Built-in Profiles Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                Built-in Profiles
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {builtInProfiles.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Pre-configured profiles for common use cases. These cannot be
              edited or deleted.
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={builtInProfiles.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {builtInProfiles.map((profile) => (
                    <SortableProfileCard
                      key={profile.id}
                      profile={profile}
                      onEdit={() => {}}
                      onDelete={() => {}}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>

      {/* Add Profile Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="add-profile-dialog">
          <DialogHeader>
            <DialogTitle>Create New Profile</DialogTitle>
            <DialogDescription>
              Define a reusable model configuration preset.
            </DialogDescription>
          </DialogHeader>
          <ProfileForm
            profile={{}}
            onSave={handleAddProfile}
            onCancel={() => setShowAddDialog(false)}
            isEditing={false}
            hotkeyActive={showAddDialog}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog
        open={!!editingProfile}
        onOpenChange={() => setEditingProfile(null)}
      >
        <DialogContent data-testid="edit-profile-dialog">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Modify your profile settings.</DialogDescription>
          </DialogHeader>
          {editingProfile && (
            <ProfileForm
              profile={editingProfile}
              onSave={handleUpdateProfile}
              onCancel={() => setEditingProfile(null)}
              isEditing={true}
              hotkeyActive={!!editingProfile}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
