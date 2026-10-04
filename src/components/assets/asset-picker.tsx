"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { matchesSearch } from "@/components/ui/combobox";
import { plural } from "@/lib/format";

export type PickableAsset = {
  id: string;
  label: string;
  /** e.g. the unit type, so a long list reads in groups. */
  group: string;
  hint?: string;
};

/** Tick several returnable assets, e.g. stillages to send or collect. */
export function AssetPicker({
  open,
  onOpenChange,
  title,
  description,
  assets,
  confirmLabel,
  emptyText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  assets: PickableAsset[];
  confirmLabel: string;
  emptyText: string;
  onConfirm: (ids: string[]) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const shown = assets.filter((a) => !q || matchesSearch(`${a.label} ${a.group}`, q));
  const groups = [...new Set(shown.map((a) => a.group))].sort();

  function toggle(id: string, on: boolean) {
    setPicked((p) => {
      const next = new Set(p);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setPicked(new Set());
          setQ("");
        }
        onOpenChange(o);
      }}
      title={title}
      description={description}
      footer={
        assets.length ? (
          <>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!picked.size}
              loading={saving}
              onClick={async () => {
                setSaving(true);
                const ok = await onConfirm([...picked]);
                setSaving(false);
                if (ok) {
                  setPicked(new Set());
                  onOpenChange(false);
                }
              }}
            >
              {picked.size ? `${confirmLabel} (${picked.size})` : confirmLabel}
            </Button>
          </>
        ) : undefined
      }
    >
      {assets.length ? (
        <div className="flex flex-col gap-4">
          {assets.length > 8 ? (
            <Input
              leadingIcon={<Search />}
              aria-label="Find an asset"
              placeholder="Asset number or type"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          ) : null}
          {groups.map((g) => {
            const inGroup = shown.filter((a) => a.group === g);
            return (
              <fieldset key={g} className="flex flex-col gap-2">
                <legend className="mb-1 text-xs font-semibold text-text-muted uppercase">
                  {g} · {plural(inGroup.length, "available", "available")}
                </legend>
                {inGroup.map((a) => (
                  <Checkbox
                    key={a.id}
                    checked={picked.has(a.id)}
                    onCheckedChange={(v) => toggle(a.id, v === true)}
                    label={a.label}
                    description={a.hint}
                  />
                ))}
              </fieldset>
            );
          })}
          {!shown.length ? <p className="text-sm text-text-muted">No assets match.</p> : null}
        </div>
      ) : (
        <EmptyState compact title="Nothing to choose" description={emptyText} />
      )}
    </Modal>
  );
}
