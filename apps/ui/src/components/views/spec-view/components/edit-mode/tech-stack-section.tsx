import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu } from 'lucide-react';
import { ArrayFieldEditor } from './array-field-editor';

interface TechStackSectionProps {
  technologies: string[];
  onChange: (technologies: string[]) => void;
}

export function TechStackSection({ technologies, onChange }: TechStackSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Cpu className="w-5 h-5 text-primary" />
          Technology Stack
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ArrayFieldEditor
          values={technologies}
          onChange={onChange}
          placeholder="e.g., React, TypeScript, Node.js..."
          addLabel="Add Technology"
          emptyMessage="No technologies added. Add your tech stack."
        />
      </CardContent>
    </Card>
  );
}
