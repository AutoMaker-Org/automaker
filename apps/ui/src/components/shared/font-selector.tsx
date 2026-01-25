import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';

interface FontOption {
  value: string;
  label: string;
}

interface FontSelectorProps {
  id: string;
  value: string;
  options: readonly FontOption[];
  placeholder: string;
  onChange: (value: string) => void;
}

/**
 * Reusable font selector component with live preview styling
 */
export function FontSelector({ id, value, options, placeholder, onChange }: FontSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span
              style={{
                fontFamily: option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
              }}
            >
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
