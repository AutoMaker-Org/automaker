import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AnthropicIcon,
  CursorIcon,
  OpenAIIcon,
  GeminiIcon,
  OpenCodeIcon,
  CopilotIcon,
} from '@/components/ui/provider-icon';
import { CursorSettingsTab } from './cursor-settings-tab';
import { ClaudeSettingsTab } from './claude-settings-tab';
import { CodexSettingsTab } from './codex-settings-tab';
import { OpencodeSettingsTab } from './opencode-settings-tab';
import { GeminiSettingsTab } from './gemini-settings-tab';
import { CopilotSettingsTab } from './copilot-settings-tab';

interface ProviderTabsProps {
  defaultTab?: 'claude' | 'cursor' | 'codex' | 'opencode' | 'gemini' | 'copilot';
}

export function ProviderTabs({ defaultTab = 'claude' }: ProviderTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-6 mb-6">
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
          <OpenCodeIcon className="w-4 h-4" />
          OpenCode
        </TabsTrigger>
        <TabsTrigger value="gemini" className="flex items-center gap-2">
          <GeminiIcon className="w-4 h-4" />
          Gemini
        </TabsTrigger>
        <TabsTrigger value="copilot" className="flex items-center gap-2">
          <CopilotIcon className="w-4 h-4" />
          Copilot
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

      <TabsContent value="gemini">
        <GeminiSettingsTab />
      </TabsContent>

      <TabsContent value="copilot">
        <CopilotSettingsTab />
      </TabsContent>
    </Tabs>
  );
}

export default ProviderTabs;
