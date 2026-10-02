"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Skeleton } from "./skeleton";

type SortValue = string | number | Date | null | undefined;

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => SortValue;
  /** Right-align figures so they line up (10.2). */
  align?: "left" | "right";
  /** Can be hidden from the column chooser (default true). */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Extra classes for header and cells, e.g. a width. */
  className?: string;
};

export type SortState = { columnId: string; direction: "asc" | "desc" } | null;

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Accessible name for the table. */
  label: string;
  initialSort?: SortState;
  onRowClick?: (row: T) => void;
  selectedRowId?: string | null;
  loading?: boolean;
  /** Shown instead of rows when there are none. */
  empty?: React.ReactNode;
  /** Show the column chooser button above the table. */
  columnChooser?: boolean;
  /** Controlled visible columns, so a screen can remember them per user. */
  visibleColumns?: string[];
  onVisibleColumnsChange?: (ids: string[]) => void;
  /** Toolbar content shown left of the column chooser (search, filters). */
  toolbar?: React.ReactNode;
  /** Classes for the scroll container, e.g. a max height for the sticky header. */
  scrollClassName?: string;
  /**
   * Below 1280px, show each row as a stacked card instead of the table, so
   * controls never scroll out of view on phones and tablets (10.7).
   */
  renderCard?: (row: T) => React.ReactNode;
  className?: string;
};

function compare(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-GB", { numeric: true, sensitivity: "base" });
}

/**
 * Sortable table with a sticky header and column chooser (10.4). Row height
 * follows the Comfortable/Compact density setting (10.5).
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  label,
  initialSort = null,
  onRowClick,
  selectedRowId,
  loading,
  empty,
  columnChooser,
  visibleColumns: visibleProp,
  onVisibleColumnsChange,
  toolbar,
  scrollClassName,
  renderCard,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [visibleState, setVisibleState] = useState<string[]>(() =>
    columns.filter((c) => !c.defaultHidden).map((c) => c.id),
  );
  const visible = visibleProp ?? visibleState;

  function setVisible(ids: string[]) {
    if (!visibleProp) setVisibleState(ids);
    onVisibleColumnsChange?.(ids);
  }

  const shown = columns.filter((c) => visible.includes(c.id) || c.hideable === false);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column?.sortValue) return rows;
    const get = column.sortValue;
    const out = [...rows].sort((a, b) => compare(get(a), get(b)));
    return sort.direction === "desc" ? out.reverse() : out;
  }, [rows, columns, sort]);

  function toggleSort(columnId: string) {
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, direction: "asc" };
      if (current.direction === "asc") return { columnId, direction: "desc" };
      return null;
    });
  }

  const hideableColumns = columns.filter((c) => c.hideable !== false);

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {toolbar || columnChooser ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {columnChooser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="md" variant="secondary">
                  <Columns3 aria-hidden />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideableColumns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={visible.includes(c.id)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) =>
                      setVisible(checked ? [...visible, c.id] : visible.filter((id) => id !== c.id))
                    }
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "min-w-0 overflow-auto rounded-lg border border-border bg-surface scrollbar-thin",
          renderCard && "hidden xl:block",
          scrollClassName,
        )}
      >
        <table
          className="w-full border-separate border-spacing-0 text-sm"
          aria-label={label}
          aria-busy={loading || undefined}
        >
          <thead>
            <tr>
              {shown.map((column) => {
                const active = sort?.columnId === column.id ? sort.direction : null;
                const SortIcon =
                  active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined
                    }
                    className={cn(
                      "sticky top-0 z-10 h-control border-b border-border bg-surface-muted px-(--cell-px) text-xs font-medium whitespace-nowrap text-text-muted",
                      column.align === "right" ? "text-right" : "text-left",
                      column.className,
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-text",
                          column.align === "right" && "flex-row-reverse",
                          active && "text-text",
                        )}
                      >
                        {column.header}
                        <SortIcon className={cn("size-3", !active && "opacity-50")} aria-hidden />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} aria-hidden>
                    {shown.map((column) => (
                      <td
                        key={column.id}
                        className="h-(--row-height) border-b border-border px-(--cell-px)"
                      >
                        <Skeleton className="h-3 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((row) => {
                  const id = getRowId(row);
                  const selected = selectedRowId === id;
                  return (
                    <tr
                      key={id}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                      tabIndex={onRowClick ? 0 : undefined}
                      aria-selected={onRowClick ? selected : undefined}
                      className={cn(
                        "group",
                        onRowClick && "cursor-pointer focus-visible:-outline-offset-2",
                        selected ? "bg-accent-subtle" : onRowClick && "hover:bg-surface-muted",
                      )}
                    >
                      {shown.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "h-(--row-height) max-w-popover border-b border-border px-(--cell-px) py-(--cell-py) whitespace-nowrap group-last:border-b-0",
                            column.align === "right" ? "num text-right" : "text-left",
                            column.className,
                          )}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? <div>{empty}</div> : null}
      </div>
      {renderCard ? (
        <div className="min-w-0 xl:hidden">
          {loading ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">{empty}</div>
          ) : (
            <ul
              aria-label={label}
              className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
            >
              {sorted.map((row) => (
                <li key={getRowId(row)} className="min-w-0 p-4">
                  {renderCard(row)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
