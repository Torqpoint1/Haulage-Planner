import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border",
    "font-medium transition-colors select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "border-transparent bg-accent text-accent-fg hover:bg-accent-hover",
        secondary: "border-border-strong bg-surface text-text hover:bg-surface-muted",
        ghost: "border-transparent bg-transparent text-text hover:bg-surface-muted",
        danger: "border-transparent bg-danger-solid text-white hover:bg-danger-solid-hover",
      },
      size: {
        sm: "h-control-sm px-3 text-sm [&_svg]:size-icon-sm",
        md: "h-control px-4 text-sm [&_svg]:size-icon-sm",
        lg: "h-control-lg px-6 text-base [&_svg]:size-icon",
      },
      iconOnly: { true: "px-0" },
    },
    compoundVariants: [
      { iconOnly: true, size: "sm", className: "w-control-sm" },
      { iconOnly: true, size: "md", className: "w-control" },
      { iconOnly: true, size: "lg", className: "w-control-lg" },
    ],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a busy indicator and blocks clicks while an action runs. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  iconOnly,
  asChild,
  loading,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size, iconOnly }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, iconOnly }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
