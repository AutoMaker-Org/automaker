import * as React from 'react';
import { Check, ChevronsUpDown, LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface AutocompleteOption {
  value: string;
  label?: string;
  badge?: string;
  isDefault?: boolean;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | AutocompleteOption)[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  icon?: LucideIcon;
  allowCreate?: boolean;
  createLabel?: (value: string) => string;
  'data-testid'?: string;
  itemTestIdPrefix?: string;
}

function normalizeOption(opt: string | AutocompleteOption): AutocompleteOption {
  if (typeof opt === 'string') {
    return { value: opt, label: opt };
  }
  return { ...opt, label: opt.label ?? opt.value };
}

export function Autocomplete({
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  disabled = false,
  error = false,
  icon: Icon,
  allowCreate = false,
  createLabel = (v) => `Create "${v}"`,
  'data-testid': testId,
  itemTestIdPrefix = 'option',
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const normalizedOptions = React.useMemo(
    () =>
      options
        .filter((opt) => opt != null)
        .map(normalizeOption)
        .filter((opt) => opt.value != null),
    [options]
  );

  // Update trigger width when component mounts or value changes
  React.useEffect(() => {
    if (triggerRef.current) {
      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth || 0);
      };

      updateWidth();

      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(triggerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [value]);

  // Filter options based on input
  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return normalizedOptions;
    const lower = inputValue.toLowerCase();
    return normalizedOptions.filter(
      (opt) => opt.value.toLowerCase().includes(lower) || opt.label?.toLowerCase().includes(lower)
    );
  }, [normalizedOptions, inputValue]);

  // Check if user typed a new value that doesn't exist
  const isNewValue =
    allowCreate &&
    inputValue.trim() &&
    !normalizedOptions.some((opt) => opt.value.toLowerCase() === inputValue.toLowerCase());

  // Get display value
  const displayValue = React.useMemo(() => {
    if (!value) return null;
    const found = normalizedOptions.find((opt) => opt.value === value);
    return found?.label ?? value;
  }, [value, normalizedOptions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between',
            Icon && 'font-mono text-sm',
            error && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          data-testid={testId}
        >
          <span className="flex items-center gap-2 truncate">
            {Icon && <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />}
            {displayValue || placeholder}
          </span>
          <ChevronsUpDown className="opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{
          width: Math.max(triggerWidth, 200),
        }}
        data-testid={testId ? `${testId}-list` : undefined}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-9"
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
              {isNewValue ? (
                <div className="py-2 px-3 text-sm">
                  Press enter to create <code className="bg-muted px-1 rounded">{inputValue}</code>
                </div>
              ) : (
                emptyMessage
              )}
            </CommandEmpty>
            <CommandGroup>
              {/* Show "Create new" option if typing a new value */}
              {isNewValue && (
                <CommandItem
                  value={inputValue}
                  onSelect={() => {
                    onChange(inputValue);
                    setInputValue('');
                    setOpen(false);
                  }}
                  className="text-[var(--status-success)]"
                  data-testid={`${itemTestIdPrefix}-create-new`}
                >
                  {Icon && <Icon className="w-4 h-4 mr-2" />}
                  {createLabel(inputValue)}
                  <span className="ml-auto text-xs text-muted-foreground">(new)</span>
                </CommandItem>
              )}
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? '' : currentValue);
                    setInputValue('');
                    setOpen(false);
                  }}
                  data-testid={`${itemTestIdPrefix}-${option.value.toLowerCase().replace(/[\s/\\]+/g, '-')}`}
                >
                  {Icon && <Icon className="w-4 h-4 mr-2" />}
                  {option.label}
                  <Check
                    className={cn('ml-auto', value === option.value ? 'opacity-100' : 'opacity-0')}
                  />
                  {option.badge && (
                    <span className="ml-2 text-xs text-muted-foreground">({option.badge})</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
