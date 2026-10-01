import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, OctagonAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type StatusTone = "danger" | "warning" | "success" | "info" | "neutral";

/**
 * Status colours carry meaning only (10.3): red blocking, amber check,
 * green ready/complete, blue info. Every status pairs colour with an icon
 * and a label so it reads without colour.
 */
export const STATUS_ICONS = {
  danger: OctagonAlert,
  warning: CircleAlert,
  success: CircleCheck,
  info: Info,
  neutral: null,
} as const;

const badgeVariants = cva(
  "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        danger: "border-danger-border bg-danger-bg text-danger-fg",
        warning: "border-warning-border bg-warning-bg text-warning-fg",
        success: "border-success-border bg-success-bg text-success-fg",
        info: "border-info-border bg-info-bg text-info-fg",
        neutral: "border-border bg-surface-muted text-text-muted",
      },
      size: {
        sm: "h-6 px-2 text-xs [&_svg]:size-3",
        md: "h-control-sm px-3 text-sm [&_svg]:size-icon-sm",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Override or hide (null) the default status icon. */
    icon?: React.ReactNode | null;
  };

/** A status label: colour + icon + text. */
export function Badge({ tone = "neutral", size, icon, className, children, ...props }: BadgeProps) {
  const DefaultIcon = STATUS_ICONS[tone ?? "neutral"];
  const shownIcon = icon === undefined ? DefaultIcon ? <DefaultIcon aria-hidden /> : null : icon;
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {shownIcon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Fixed colour tags for configuration (e.g. handling unit types, 6.2). */
export const TAG_COLOURS = [
  "load-1",
  "load-2",
  "load-3",
  "load-4",
  "load-5",
  "load-6",
  "load-7",
  "load-8",
  "load-9",
  "load-10",
] as const;
export type TagColour = (typeof TAG_COLOURS)[number];

const tagDot: Record<TagColour, string> = {
  "load-1": "bg-load-1",
  "load-2": "bg-load-2",
  "load-3": "bg-load-3",
  "load-4": "bg-load-4",
  "load-5": "bg-load-5",
  "load-6": "bg-load-6",
  "load-7": "bg-load-7",
  "load-8": "bg-load-8",
  "load-9": "bg-load-9",
  "load-10": "bg-load-10",
};

type ChipProps = React.ComponentProps<"span"> & {
  colour?: TagColour;
  selected?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
};

/** Neutral chip for filters, tags and unit summaries. Not for status. */
export function Chip({
  colour,
  selected,
  onRemove,
  removeLabel,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-2 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        selected
          ? "border-accent bg-accent-subtle text-accent-text"
          : "border-border bg-surface text-text-muted",
        onRemove && "pr-1",
        className,
      )}
      {...props}
    >
      {colour ? (
        <span className={cn("size-2 shrink-0 rounded-full", tagDot[colour])} aria-hidden />
      ) : null}
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "Remove"}
          className="flex size-4 items-center justify-center rounded-full text-text-subtle hover:bg-surface-muted hover:text-text"
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
