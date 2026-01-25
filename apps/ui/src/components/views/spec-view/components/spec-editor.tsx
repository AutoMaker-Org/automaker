import { Card } from '@/components/ui/card';
import { XmlSyntaxEditor } from '@/components/ui/xml-syntax-editor';

interface SpecEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function SpecEditor({ value, onChange }: SpecEditorProps) {
  return (
    <div className="flex-1 p-4 overflow-hidden min-h-0">
      <Card className="h-full overflow-hidden">
        <XmlSyntaxEditor
          value={value}
          onChange={onChange}
          placeholder="Write your app specification here..."
          data-testid="spec-editor"
        />
      </Card>
    </div>
  );
}
