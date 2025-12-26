import { useState, useMemo, useCallback } from 'react';
import { useAppStore, AIProfile } from '@/store/app-store';
import {
  useKeyboardShortcuts,
  useKeyboardShortcutsConfig,
  KeyboardShortcut,
} from '@/hooks/use-keyboard-shortcuts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableProfileCard, ProfileForm, ProfilesHeader } from './profiles-view/components';
import type { ModelProvider } from '@automaker/types';
import { PROVIDERS } from './board-view/shared/provider-constants';

export function ProfilesView() {
  const {
    aiProfiles,
    addAIProfile,
    updateAIProfile,
    removeAIProfile,
    reorderAIProfiles,
    resetAIProfiles,
  } = useAppStore();
  const shortcuts = useKeyboardShortcutsConfig();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AIProfile | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<AIProfile | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>('claude');

  // Sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Separate built-in and custom profiles, filtered by selected provider
  const builtInProfiles = useMemo(
    () => aiProfiles.filter((p) => p.isBuiltIn && p.provider === selectedProvider),
    [aiProfiles, selectedProvider]
  );
  const customProfiles = useMemo(
    () => aiProfiles.filter((p) => !p.isBuiltIn && p.provider === selectedProvider),
    [aiProfiles, selectedProvider]
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

  const handleAddProfile = (profile: Omit<AIProfile, 'id'>) => {
    addAIProfile(profile);
    setShowAddDialog(false);
    toast.success('Profile created', {
      description: `Created "${profile.name}" profile`,
    });
  };

  const handleUpdateProfile = (profile: Omit<AIProfile, 'id'>) => {
    if (editingProfile) {
      updateAIProfile(editingProfile.id, profile);
      setEditingProfile(null);
      toast.success('Profile updated', {
        description: `Updated "${profile.name}" profile`,
      });
    }
  };

  const confirmDeleteProfile = () => {
    if (!profileToDelete) return;

    removeAIProfile(profileToDelete.id);
    toast.success('Profile deleted', {
      description: `Deleted "${profileToDelete.name}" profile`,
    });
    setProfileToDelete(null);
  };

  const handleResetProfiles = () => {
    resetAIProfiles();
    toast.success('Profiles refreshed', {
      description: 'Default profiles have been updated to the latest version',
    });
  };

  // Build keyboard shortcuts for profiles view
  const profilesShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Add profile shortcut - when in profiles view
    shortcutsList.push({
      key: shortcuts.addProfile,
      action: () => setShowAddDialog(true),
      description: 'Create new profile',
    });

    return shortcutsList;
  }, [shortcuts]);

  // Register keyboard shortcuts for profiles view
  useKeyboardShortcuts(profilesShortcuts);

  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="profiles-view">
      {/* Header Section */}
      <ProfilesHeader
        onResetProfiles={handleResetProfiles}
        onAddProfile={() => setShowAddDialog(true)}
        addProfileHotkey={shortcuts.addProfile}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Provider Tabs */}
          <Tabs
            value={selectedProvider}
            onValueChange={(value) => setSelectedProvider(value as ModelProvider)}
          >
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              {PROVIDERS.map((provider) => (
                <TabsTrigger key={provider.id} value={provider.id}>
                  {provider.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Custom Profiles Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-foreground">Custom Profiles</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {customProfiles.length}
              </span>
            </div>
            {customProfiles.length === 0 ? (
              <div
                className="group rounded-xl border border-dashed border-border p-8 text-center transition-all duration-300 hover:border-primary hover:bg-primary/5 cursor-pointer"
                onClick={() => setShowAddDialog(true)}
              >
                <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50 transition-all duration-300 group-hover:text-primary group-hover:opacity-100 group-hover:scale-110 group-hover:rotate-12" />
                <p className="text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                  No custom profiles yet. Create one to get started!
                </p>
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
                        onDelete={() => setProfileToDelete(profile)}
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
              <h2 className="text-lg font-semibold text-foreground">Built-in Profiles</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {builtInProfiles.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Pre-configured profiles for common use cases. These cannot be edited or deleted.
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
        <DialogContent
          data-testid="add-profile-dialog"
          className="flex flex-col max-h-[calc(100vh-4rem)]"
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>Create New Profile</DialogTitle>
            <DialogDescription>Define a reusable model configuration preset.</DialogDescription>
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
      <Dialog open={!!editingProfile} onOpenChange={() => setEditingProfile(null)}>
        <DialogContent
          data-testid="edit-profile-dialog"
          className="flex flex-col max-h-[calc(100vh-4rem)]"
        >
          <DialogHeader className="shrink-0">
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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!profileToDelete}
        onOpenChange={(open) => !open && setProfileToDelete(null)}
        onConfirm={confirmDeleteProfile}
        title="Delete Profile"
        description={
          profileToDelete
            ? `Are you sure you want to delete "${profileToDelete.name}"? This action cannot be undone.`
            : ''
        }
        confirmText="Delete Profile"
        testId="delete-profile-confirm-dialog"
        confirmTestId="confirm-delete-profile-button"
      />
    </div>
  );
}
