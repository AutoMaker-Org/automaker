import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Terminal } from 'lucide-react';
import { CursorSettingsTab } from './cursor-settings-tab';
import { ClaudeSettingsTab } from './claude-settings-tab';

interface ProviderTabsProps {
  defaultTab?: 'claude' | 'cursor';
}

export function ProviderTabs({ defaultTab = 'claude' }: ProviderTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-6">
        <TabsTrigger value="claude" className="flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Claude
        </TabsTrigger>
        <TabsTrigger value="cursor" className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Cursor
        </TabsTrigger>
      </TabsList>

      <TabsContent value="claude">
        <ClaudeSettingsTab />
      </TabsContent>

      <TabsContent value="cursor">
        <CursorSettingsTab />
      </TabsContent>
    </Tabs>
  );
}

export default ProviderTabs;
