import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnthropicIcon, CursorIcon, OpenAIIcon } from '@/components/ui/provider-icon';
import { Cpu, Globe } from 'lucide-react';
import { CursorSettingsTab } from './cursor-settings-tab';
import { ClaudeSettingsTab } from './claude-settings-tab';
import { CodexSettingsTab } from './codex-settings-tab';
import { OpencodeSettingsTab } from './opencode-settings-tab';
import { CustomSettingsTab } from './custom-settings-tab';

interface ProviderTabsProps {
  defaultTab?: 'claude' | 'cursor' | 'codex' | 'opencode' | 'custom';
}

export function ProviderTabs({ defaultTab = 'claude' }: ProviderTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-5 mb-6">
        <TabsTrigger value="claude" className="flex items-center gap-2">
          <AnthropicIcon className="w-4 h-4" />
          Claude
        </TabsTrigger>
        <TabsTrigger value="cursor" className="flex items-center gap-2">
          <CursorIcon className="w-4 h-4" />
          Cursor
        </TabsTrigger>
        <TabsTrigger value="codex" className="flex items-center gap-2">
          <OpenAIIcon className="w-4 h-4" />
          Codex
        </TabsTrigger>
        <TabsTrigger value="opencode" className="flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          OpenCode
        </TabsTrigger>
        <TabsTrigger value="custom" className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Custom
        </TabsTrigger>
      </TabsList>

      <TabsContent value="claude">
        <ClaudeSettingsTab />
      </TabsContent>

      <TabsContent value="cursor">
        <CursorSettingsTab />
      </TabsContent>

      <TabsContent value="codex">
        <CodexSettingsTab />
      </TabsContent>

      <TabsContent value="opencode">
        <OpencodeSettingsTab />
      </TabsContent>

      <TabsContent value="custom">
        <CustomSettingsTab />
      </TabsContent>
    </Tabs>
  );
}

export default ProviderTabs;
