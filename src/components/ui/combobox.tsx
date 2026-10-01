"use client";

import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";
import { controlClasses } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * Match every typed word anywhere in the label, description or keywords.
 * Predictable for names and postcodes, unlike fuzzy letter matching.
 */
export function matchesSearch(haystack: string, search: string): boolean {
  const text = haystack.toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary line, e.g. town and postcode for a site. */
  description?: string;
  /** Extra words to match when searching, e.g. account ref. */
  keywords?: string[];
  disabled?: boolean;
};

type ComboboxProps = {
  options: ComboboxOption[];
  /** Controlled value. Leave undefined to let the combobox manage its own. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

/** Searchable single select for long lists (customers, sites, vehicles). */
export function Combobox({
  options,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  disabled,
  invalid,
  id,
  className,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState<string | null>(defaultValue);
  const value = valueProp === undefined ? internal : valueProp;
  const listId = useId();
  const control = useFieldControl({ id });
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          {...control}
          aria-invalid={invalid || control["aria-invalid"]}
          className={cn(
            controlClasses,
            "flex h-control items-center justify-between gap-2 px-3 text-left",
            !selected && "text-text-subtle",
            className,
          )}
        >
          <span className="min-w-0 truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className="w-(--radix-popover-trigger-width) min-w-popover p-0">
        <Command
          loop
          filter={(_value, search, keywords) =>
            matchesSearch((keywords ?? []).join(" "), search) ? 1 : 0
          }
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
            <Command.Input
              placeholder={searchPlaceholder}
              className="h-control w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-text-subtle"
            />
          </div>
          <Command.List className="max-h-popover overflow-y-auto p-1 scrollbar-thin">
            <Command.Empty className="px-3 py-4 text-sm text-text-subtle">
              {emptyText}
            </Command.Empty>
            {options.map((option) => (
              <Command.Item
                key={option.value}
                value={option.value}
                keywords={[option.label, option.description ?? "", ...(option.keywords ?? [])]}
                disabled={option.disabled}
                onSelect={() => {
                  const next = option.value === value ? null : option.value;
                  setInternal(next);
                  onValueChange?.(next);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-control-sm cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm outline-none select-none",
                  "data-[selected=true]:bg-surface-muted data-[disabled=true]:opacity-50",
                )}
              >
                <Check
                  className={cn(
                    "size-icon-sm shrink-0 text-accent-text",
                    option.value === value ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.description ? (
                    <span className="truncate text-xs text-text-subtle">{option.description}</span>
                  ) : null}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
