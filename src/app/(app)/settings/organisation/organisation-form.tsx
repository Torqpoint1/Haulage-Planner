"use client";

import { Check, ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { EntityForm, FormField, FormSection } from "@/components/settings/entity-form";
import { useTheme } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { DEFAULT_ACCENT, deriveAccentTokens, isHexColour } from "@/lib/color";
import { createClient } from "@/lib/supabase/client";
import { saveOrganisation, setLogo } from "./actions";

const PRESETS = [
  { value: DEFAULT_ACCENT, label: "Deep blue" },
  { value: "#0f766e", label: "Teal" },
  { value: "#15803d", label: "Green" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#be123c", label: "Rose" },
  { value: "#c2410c", label: "Burnt orange" },
  { value: "#334155", label: "Slate" },
  { value: "#facc15", label: "Yellow" },
];

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function AccentPreview({ colour }: { colour: string }) {
  const { resolvedTheme } = useTheme();
  const t = deriveAccentTokens(isHexColour(colour) ? colour : DEFAULT_ACCENT, resolvedTheme);
  const adjusted = t.accent.toLowerCase() !== colour.toLowerCase();
  const style = {
    "--accent": t.accent,
    "--accent-hover": t.accentHover,
    "--accent-fg": t.accentFg,
    "--accent-subtle": t.accentSubtle,
    "--accent-text": t.accentText,
    "--focus": t.focus,
  } as React.CSSProperties;
  return (
    <div
      style={style}
      className="flex flex-col gap-3 rounded-md border border-border bg-bg p-4"
      aria-label="Preview"
    >
      <p className="text-xs font-medium text-text-subtle">Preview</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-control items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg">
          Primary button
        </span>
        <span className="rounded-md bg-accent-subtle px-3 py-1 text-sm font-medium text-accent-text">
          Selected tab
        </span>
        <span className="text-sm font-medium text-accent-text underline underline-offset-2">
          A link
        </span>
      </div>
      {adjusted ? (
        <p className="text-xs text-text-muted">
          Shown slightly {resolvedTheme === "dark" ? "lighter" : "darker"} in {resolvedTheme} mode
          so text stays readable.
        </p>
      ) : null}
    </div>
  );
}

export function OrganisationForm({
  orgId,
  name,
  accentColour,
  logoUrl,
}: {
  orgId: string;
  name: string;
  accentColour: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [colour, setColour] = useState(accentColour);
  const [saving, setSaving] = useState(false);
  const [uploading, startUpload] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("That image is over 1 MB. Use a smaller one.");
      return;
    }
    startUpload(async () => {
      const path = `${orgId}/branding/logo-${Date.now()}.${EXTENSIONS[file.type]}`;
      const { error } = await createClient()
        .storage.from("organisation-files")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error("The logo didn't upload. Check your connection and try again.");
        return;
      }
      const result = await setLogo(path);
      if (result.ok) {
        toast.success("Logo updated");
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <div className="flex max-w-panel flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Logo</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted">
              {logoUrl ? (
                // Signed storage URL; next/image can't optimise it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={`${name} logo`} className="size-full object-contain" />
              ) : (
                <ImageUp className="size-icon text-text-subtle" aria-hidden />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED.join(",")}
                className="sr-only"
                aria-label="Choose a logo image"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
              <Button loading={uploading} onClick={() => fileInput.current?.click()}>
                <ImageUp aria-hidden />
                {logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {logoUrl ? (
                <Button
                  variant="ghost"
                  disabled={uploading}
                  onClick={() =>
                    startUpload(async () => {
                      const result = await setLogo(null);
                      if (result.ok) {
                        toast.success("Logo removed");
                        router.refresh();
                      } else toast.error(result.error);
                    })
                  }
                >
                  <Trash2 aria-hidden />
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-text-subtle">
            PNG, JPEG or WebP, up to 1 MB. Square logos look best. Printed on run sheets and pick
            sheets.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <EntityForm
            id="organisation-form"
            action={(fd) => saveOrganisation(orgId, fd)}
            onPendingChange={setSaving}
            onSaved={() => {
              toast.success("Organisation saved");
              router.refresh();
            }}
          >
            <FormSection title="Company">
              <FormField name="name" label="Company name" required>
                <Input name="name" defaultValue={name} autoComplete="organization" />
              </FormField>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium">Timezone</span>
                <span className="text-sm text-text-muted">
                  Europe/London (UK time, including British Summer Time)
                </span>
              </div>
            </FormSection>
            <FormSection
              title="Accent colour"
              description="Used for buttons, the active tab, focus rings and selection."
            >
              <div role="radiogroup" aria-label="Preset colours" className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const selected = colour.toLowerCase() === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={p.label}
                      title={p.label}
                      onClick={() => setColour(p.value)}
                      className={cn(
                        "flex size-control items-center justify-center rounded-full border-2",
                        selected ? "border-text" : "border-transparent",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      )}
                    >
                      <span
                        className="flex size-8 items-center justify-center rounded-full"
                        style={{ background: p.value }}
                        aria-hidden
                      >
                        {selected ? (
                          <Check
                            className="size-icon-sm"
                            style={{ color: deriveAccentTokens(p.value, "light").accentFg }}
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <FormField
                name="accent_colour"
                label="Colour code"
                hint="Any colour, e.g. your brand's hex code."
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Input
                    name="accent_colour"
                    value={colour}
                    onChange={(e) => setColour(e.target.value)}
                    className="num md:w-menu"
                    spellCheck={false}
                  />
                  <input
                    type="color"
                    value={isHexColour(colour) && colour.length === 7 ? colour : DEFAULT_ACCENT}
                    onChange={(e) => setColour(e.target.value)}
                    aria-label="Pick a custom colour"
                    className="h-control w-control shrink-0 cursor-pointer rounded-md border border-border-strong bg-surface p-1"
                  />
                </div>
              </FormField>
              <AccentPreview colour={colour} />
            </FormSection>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={saving}>
                Save changes
              </Button>
            </div>
          </EntityForm>
        </CardContent>
      </Card>
    </div>
  );
}
