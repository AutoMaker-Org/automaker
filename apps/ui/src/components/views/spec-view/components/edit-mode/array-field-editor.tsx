import { Plus, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface ArrayFieldEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  emptyMessage?: string;
}

export function ArrayFieldEditor({
  values,
  onChange,
  placeholder = 'Enter value...',
  addLabel = 'Add Item',
  emptyMessage = 'No items added yet.',
}: ArrayFieldEditorProps) {
  const handleAdd = () => {
    onChange([...values, '']);
  };

  const handleRemove = (index: number) => {
    const newValues = values.filter((_, i) => i !== index);
    onChange(newValues);
  };

  const handleChange = (index: number, value: string) => {
    const newValues = [...values];
    newValues[index] = value;
    onChange(newValues);
  };

  return (
    <div className="space-y-2">
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {values.map((value, index) => (
            <Card key={index} className="p-2">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab" />
                <Input
                  value={value}
                  onChange={(e) => handleChange(index, e.target.value)}
                  placeholder={placeholder}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="gap-1">
        <Plus className="w-4 h-4" />
        {addLabel}
      </Button>
    </div>
  );
}
