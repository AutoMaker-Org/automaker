import { Eye, Edit3, Code } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SpecViewMode } from '../types';

interface SpecModeTabsProps {
  mode: SpecViewMode;
  onModeChange: (mode: SpecViewMode) => void;
  isParseValid: boolean;
  disabled?: boolean;
}

export function SpecModeTabs({
  mode,
  onModeChange,
  isParseValid,
  disabled = false,
}: SpecModeTabsProps) {
  const handleValueChange = (value: string) => {
    onModeChange(value as SpecViewMode);
  };

  return (
    <Tabs value={mode} onValueChange={handleValueChange}>
      <TabsList>
        <TabsTrigger
          value="view"
          disabled={disabled || !isParseValid}
          title={!isParseValid ? 'Fix XML errors to enable View mode' : 'View formatted spec'}
          aria-label="View"
        >
          <Eye className="w-4 h-4" />
          <span className="hidden sm:inline">View</span>
        </TabsTrigger>
        <TabsTrigger
          value="edit"
          disabled={disabled || !isParseValid}
          title={!isParseValid ? 'Fix XML errors to enable Edit mode' : 'Edit spec with form'}
          aria-label="Edit"
        >
          <Edit3 className="w-4 h-4" />
          <span className="hidden sm:inline">Edit</span>
        </TabsTrigger>
        <TabsTrigger
          value="source"
          disabled={disabled}
          title="Edit raw XML source"
          aria-label="Source"
        >
          <Code className="w-4 h-4" />
          <span className="hidden sm:inline">Source</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
