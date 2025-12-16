"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CategoryAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function CategoryAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder = "Select or type a category...",
  className,
  disabled = false,
  "data-testid": testId,
}: CategoryAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Update trigger width when component mounts or value changes
  React.useEffect(() => {
    if (triggerRef.current) {
      const updateWidth = () => {
        setTriggerWidth(triggerRef.current?.offsetWidth || 0);
      };

      updateWidth();

      // Listen for resize events to handle responsive behavior
      const resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(triggerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
          data-testid={testId}
        >
          {value
            ? suggestions.find((s) => s === value) ?? value
            : placeholder}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{
          width: Math.max(triggerWidth, 200),
        }}
      >
        <Command>
          <CommandInput placeholder="Search category..." className="h-9" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {suggestions.map((suggestion) => (
                <CommandItem
                  key={suggestion}
                  value={suggestion}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                  data-testid={`category-option-${suggestion.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {suggestion}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === suggestion ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
