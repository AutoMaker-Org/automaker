"use client";

import * as React from "react";
import { Check, ChevronsUpDown, GitBranch } from "lucide-react";

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

interface BranchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  branches: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function BranchAutocomplete({
  value,
  onChange,
  branches,
  placeholder = "Select a branch...",
  className,
  disabled = false,
  "data-testid": testId,
}: BranchAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  // Always include "main" at the top of suggestions
  const allBranches = React.useMemo(() => {
    const branchSet = new Set(["main", ...branches]);
    return Array.from(branchSet);
  }, [branches]);

  // Filter branches based on input
  const filteredBranches = React.useMemo(() => {
    if (!inputValue) return allBranches;
    const lower = inputValue.toLowerCase();
    return allBranches.filter((b) => b.toLowerCase().includes(lower));
  }, [allBranches, inputValue]);

  // Check if user typed a new branch name that doesn't exist
  const isNewBranch =
    inputValue.trim() &&
    !allBranches.some((b) => b.toLowerCase() === inputValue.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-mono text-sm", className)}
          data-testid={testId}
        >
          <span className="flex items-center gap-2 truncate">
            <GitBranch className="w-4 h-4 shrink-0 text-muted-foreground" />
            {value || placeholder}
          </span>
          <ChevronsUpDown className="opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" data-testid="branch-autocomplete-list">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type new branch..."
            className="h-9"
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
              {inputValue.trim() ? (
                <div className="py-2 px-3 text-sm">
                  Press enter to create{" "}
                  <code className="bg-muted px-1 rounded">{inputValue}</code>
                </div>
              ) : (
                "No branches found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {/* Show "Create new" option if typing a new branch name */}
              {isNewBranch && (
                <CommandItem
                  value={inputValue}
                  onSelect={() => {
                    onChange(inputValue);
                    setInputValue("");
                    setOpen(false);
                  }}
                  className="text-[var(--status-success)]"
                  data-testid="branch-option-create-new"
                >
                  <GitBranch className="w-4 h-4 mr-2" />
                  Create &quot;{inputValue}&quot;
                  <span className="ml-auto text-xs text-muted-foreground">
                    (new)
                  </span>
                </CommandItem>
              )}
              {filteredBranches.map((branch) => (
                <CommandItem
                  key={branch}
                  value={branch}
                  onSelect={(currentValue) => {
                    onChange(currentValue);
                    setInputValue("");
                    setOpen(false);
                  }}
                  data-testid={`branch-option-${branch.replace(/[/\\]/g, "-")}`}
                >
                  <GitBranch className="w-4 h-4 mr-2" />
                  {branch}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === branch ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {branch === "main" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (default)
                    </span>
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
