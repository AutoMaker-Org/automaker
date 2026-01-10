import { SettingsHeader } from './settings-view/components/settings-header';
import { SettingsContent } from './settings-view/settings-content';

export function SettingsView() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden content-bg" data-testid="settings-view">
      {/* Header Section */}
      <SettingsHeader />

      {/* Content Area with Sidebar */}
      <SettingsContent />
    </div>
  );
}
