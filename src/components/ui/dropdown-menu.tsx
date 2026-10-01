"use client";

import { Check } from "lucide-react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import { floatingClasses } from "./popover";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          floatingClasses,
          "max-h-(--radix-dropdown-menu-content-available-height) min-w-menu overflow-y-auto p-1",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

const itemClasses = cn(
  "relative flex h-control-sm cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
  "data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:size-icon-sm [&_svg]:shrink-0 [&_svg]:text-text-subtle",
);

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(itemClasses, destructive && "text-danger-fg [&_svg]:text-danger-fg", className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(itemClasses, "pl-8", className)} {...props}>
      <span className="absolute left-2 flex items-center">
        <MenuPrimitive.ItemIndicator>
          <Check className="text-accent-text!" aria-hidden />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn("px-2 py-1 text-xs font-medium text-text-subtle", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
  );
}

export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(itemClasses, "pl-8", className)} {...props}>
      <span className="absolute left-2 flex items-center">
        <MenuPrimitive.ItemIndicator>
          <Check className="text-accent-text!" aria-hidden />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}
