import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("keeps font size and text colour together", () => {
    expect(cn("text-sm text-accent-fg")).toBe("text-sm text-accent-fg");
  });

  it("lets later classes win within a group", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-base")).toBe("text-base");
    expect(cn("h-control", "h-control-sm")).toBe("h-control-sm");
  });
});
