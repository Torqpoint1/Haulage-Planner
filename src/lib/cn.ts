import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about our custom type scale and component sizes so `text-sm` and
// `text-accent-fg` are not treated as conflicting classes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        "control-sm",
        "control",
        "control-lg",
        "icon-sm",
        "icon",
        "avatar-sm",
        "avatar",
        "avatar-lg",
        "sidebar",
        "rail",
        "bottombar",
        "header",
        "panel",
        "modal",
        "popover",
        "menu",
        "content",
      ],
    },
    classGroups: {
      "font-size": [{ text: ["xs", "sm", "base", "lg", "xl", "2xl"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
