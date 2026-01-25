import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb } from 'lucide-react';
import { ArrayFieldEditor } from './array-field-editor';

interface CapabilitiesSectionProps {
  capabilities: string[];
  onChange: (capabilities: string[]) => void;
}

export function CapabilitiesSection({ capabilities, onChange }: CapabilitiesSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="w-5 h-5 text-primary" />
          Core Capabilities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ArrayFieldEditor
          values={capabilities}
          onChange={onChange}
          placeholder="e.g., User authentication, Data visualization..."
          addLabel="Add Capability"
          emptyMessage="No capabilities defined. Add your core features."
        />
      </CardContent>
    </Card>
  );
}
