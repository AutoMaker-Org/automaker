import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useRef, useState, useEffect } from 'react';

interface ArrayFieldEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  emptyMessage?: string;
}

interface ItemWithId {
  id: string;
  value: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

export function ArrayFieldEditor({
  values,
  onChange,
  placeholder = 'Enter value...',
  addLabel = 'Add Item',
  emptyMessage = 'No items added yet.',
}: ArrayFieldEditorProps) {
  // Track items with stable IDs
  const [items, setItems] = useState<ItemWithId[]>(() =>
    values.map((value) => ({ id: generateId(), value }))
  );

  // Track if we're making an internal change to avoid sync loops
  const isInternalChange = useRef(false);

  // Sync external values to internal items when values change externally
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }

    // External change - rebuild items with new IDs
    setItems(values.map((value) => ({ id: generateId(), value })));
  }, [values]);

  const handleAdd = () => {
    const newItems = [...items, { id: generateId(), value: '' }];
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map((item) => item.value));
  };

  const handleRemove = (id: string) => {
    const newItems = items.filter((item) => item.id !== id);
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map((item) => item.value));
  };

  const handleChange = (id: string, value: string) => {
    const newItems = items.map((item) => (item.id === id ? { ...item, value } : item));
    setItems(newItems);
    isInternalChange.current = true;
    onChange(newItems.map((item) => item.value));
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="p-2">
              <div className="flex items-center gap-2">
                <Input
                  value={item.value}
                  onChange={(e) => handleChange(item.id, e.target.value)}
                  placeholder={placeholder}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(item.id)}
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
