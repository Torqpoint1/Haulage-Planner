"use client";

import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enGB } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatLocalDate, parseUkDate } from "@/lib/format";
import { Button } from "./button";
import { useFieldControl } from "./field";
import { controlClasses } from "./input";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

const WEEK = { weekStartsOn: 1 as const };
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type CalendarProps = {
  selected: Date | null;
  onSelect: (date: Date) => void;
  isDisabled?: (date: Date) => boolean;
  initialMonth?: Date;
};

/** Month grid, Monday first, fully keyboard operable (arrows, Home/End, PageUp/Down). */
export function Calendar({ selected, onSelect, isDisabled, initialMonth }: CalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(selected ?? initialMonth ?? new Date()));
  const [focused, setFocused] = useState<Date>(() => selected ?? initialMonth ?? new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, [focused]);

  const days: Date[] = [];
  for (
    let d = startOfWeek(startOfMonth(month), WEEK);
    d <= endOfWeek(endOfMonth(month), WEEK);
    d = addDays(d, 1)
  ) {
    days.push(d);
  }

  function move(next: Date) {
    shouldFocus.current = true;
    setFocused(next);
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const keys: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => startOfWeek(focused, WEEK),
      End: () => endOfWeek(focused, WEEK),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      move(fn());
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Previous month"
          onClick={() => setMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <p className="text-sm font-semibold" aria-live="polite">
          {format(month, "MMMM yyyy", { locale: enGB })}
        </p>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <div role="grid" ref={gridRef} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            role="columnheader"
            className="flex h-control-sm items-center justify-center text-xs font-medium text-text-subtle"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const disabled = isDisabled?.(day) ?? false;
          const isSelected = selected ? isSameDay(day, selected) : false;
          const outside = !isSameMonth(day, month);
          return (
            <button
              key={day.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={format(day, "EEEE d MMMM yyyy", { locale: enGB })}
              aria-current={isToday(day) ? "date" : undefined}
              tabIndex={isSameDay(day, focused) ? 0 : -1}
              disabled={disabled}
              onClick={() => onSelect(day)}
              onFocus={() => setFocused(day)}
              className={cn(
                "num flex size-control-sm items-center justify-center rounded-md text-sm",
                "hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40",
                outside && "text-text-subtle",
                isToday(day) && !isSelected && "font-semibold text-accent-text",
                isSelected && "bg-accent text-accent-fg hover:bg-accent-hover",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type DatePickerProps = {
  /** Controlled value. Leave undefined and use defaultValue inside plain forms. */
  value?: Date | null;
  defaultValue?: Date | null;
  onValueChange?: (date: Date | null) => void;
  /** Submits the date as yyyy-mm-dd under this name in a form. */
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  isDateDisabled?: (date: Date) => boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Type a UK date (dd/mm/yyyy) or pick one from the calendar.
 * Invalid typed text is kept and flagged rather than silently discarded.
 */
export function DatePicker({
  value: valueProp,
  defaultValue = null,
  onValueChange: onValueChangeProp,
  name,
  placeholder = "dd/mm/yyyy",
  disabled,
  invalid,
  isDateDisabled,
  id,
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const control = useFieldControl({ id });
  const [internal, setInternal] = useState<Date | null>(defaultValue);
  const value = valueProp === undefined ? internal : valueProp;
  const onValueChange = (date: Date | null) => {
    setInternal(date);
    onValueChangeProp?.(date);
  };
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? formatLocalDate(value) : "");
  const [typedInvalid, setTypedInvalid] = useState(false);
  const [lastValue, setLastValue] = useState(value);

  // Keep the text box in step when the value changes from outside.
  if (value !== lastValue) {
    setLastValue(value);
    setText(value ? formatLocalDate(value) : "");
    setTypedInvalid(false);
  }

  function commit(raw: string) {
    if (!raw.trim()) {
      setTypedInvalid(false);
      onValueChange(null);
      return;
    }
    const parsed = parseUkDate(raw);
    if (!parsed || isDateDisabled?.(parsed)) {
      setTypedInvalid(true);
      return;
    }
    setTypedInvalid(false);
    setText(formatLocalDate(parsed));
    onValueChange(parsed);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative min-w-0", className)}>
          <input
            {...control}
            aria-label={ariaLabel}
            aria-invalid={invalid || typedInvalid || control["aria-invalid"]}
            inputMode="numeric"
            autoComplete="off"
            placeholder={placeholder}
            disabled={disabled}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(text);
              }
              if (e.key === "ArrowDown" && e.altKey) setOpen(true);
            }}
            className={cn(controlClasses, "num h-control pr-control pl-3")}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-label="Choose date from calendar"
            aria-expanded={open}
            className="absolute inset-y-0 right-0 flex w-control items-center justify-center rounded-r-md text-text-subtle hover:text-text disabled:pointer-events-none"
          >
            <CalendarIcon className="size-icon-sm" aria-hidden />
          </button>
          {name ? (
            <input type="hidden" name={name} value={value ? format(value, "yyyy-MM-dd") : ""} />
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)
            ?.querySelector<HTMLButtonElement>('[role="gridcell"][tabindex="0"]')
            ?.focus();
        }}
      >
        <Calendar
          selected={value}
          isDisabled={isDateDisabled}
          onSelect={(date) => {
            setTypedInvalid(false);
            onValueChange(date);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
