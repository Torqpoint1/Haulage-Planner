"use client";

import { Camera, CircleCheck, CircleAlert, MapPin, OctagonAlert, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { compressPhoto } from "@/lib/drivers/photos";
import { validatePod, type PodErrors, type PodSubmission } from "@/lib/drivers/pod";
import {
  FAILURE_REASONS,
  MAX_PHOTOS,
  OUTCOMES,
  type Outcome,
  type RunStop,
} from "@/lib/drivers/types";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

type Location = PodSubmission["location"];

export type RecordedPod = {
  submission: Omit<PodSubmission, "signaturePath" | "photoPaths" | "clientId" | "stopId">;
  signature: Blob | null;
  photos: Blob[];
};

const OUTCOME_ICON = { delivered: CircleCheck, part_delivered: CircleAlert, failed: OctagonAlert };

/** Ask for the phone's position once, if the driver allows it (spec 6.10: "if allowed"). */
function useLocation() {
  const [location, setLocation] = useState<Location | "pending" | "unavailable">(() =>
    "geolocation" in navigator ? "pending" : "unavailable",
  );
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        }),
      () => setLocation("unavailable"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  return location;
}

/**
 * Mount it only while open, so each stop starts with a blank form.
 *
 * Capture proof of delivery at a stop (spec 9.8): Delivered / Part delivered /
 * Failed, with the name, signature, photos, quantities and notes. Everything is
 * checked here, so it can be fixed on the spot without a signal.
 */
export function RecordSheet({
  stop,
  initialOutcome,
  open,
  onOpenChange,
  onSave,
}: {
  stop: RunStop;
  initialOutcome: Outcome;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (pod: RecordedPod) => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [receivedBy, setReceivedBy] = useState("");
  const [signed, setSigned] = useState(false);
  const [noSignature, setNoSignature] = useState(false);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<PodErrors>({});
  const [saving, setSaving] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const ids = useId();
  const contactsList = `${ids}-contacts`;
  const signatureHint = `${ids}-signature-error`;

  // Previews are revoked when removed, and the rest when the sheet closes.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const lines = stop.orders.flatMap((o) => o.lines.map((l) => ({ ...l, ref: o.order_ref })));
  const failed = outcome === "failed";
  const collects = stop.assets.filter((a) => a.direction === "collect");
  const drops = stop.assets.filter((a) => a.direction === "drop");
  // Nothing to deliver, only assets to bring back: no one signs for anything.
  const collectionOnly = !stop.orders.length;
  const outcomes = collectionOnly
    ? OUTCOMES.filter((o) => o.value !== "part_delivered").map((o) =>
        o.value === "delivered" ? { ...o, label: "Collected" } : o,
      )
    : OUTCOMES;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    const added = await Promise.all(
      picked.map(async (f) => {
        const blob = await compressPhoto(f);
        const url = URL.createObjectURL(blob);
        previews.current.push(url);
        return { blob, url };
      }),
    );
    setPhotos((p) => [...p, ...added]);
    setErrors((e) => ({ ...e, photos: undefined, signature: undefined }));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function save() {
    const draft = {
      outcome,
      receivedBy,
      hasSignature: signed && !noSignature,
      noSignature,
      photoCount: photos.length,
      failureReason: reason || null,
      note,
      quantities,
      collectedCount: collected.size,
    };
    const found = validatePod(draft, stop);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const signature = !failed && !noSignature ? await pad.current?.toBlob() : null;
      await onSave({
        submission: {
          outcome,
          receivedBy: failed ? "" : receivedBy.trim(),
          noSignature: !failed && noSignature,
          failureReason: failed ? (reason as PodSubmission["failureReason"]) : null,
          note: note.trim(),
          lines: lines.map((l) => ({
            orderLineId: l.id,
            quantity:
              outcome === "failed"
                ? 0
                : outcome === "delivered"
                  ? l.quantity
                  : (quantities[l.id] ?? l.quantity),
          })),
          collected: failed ? [] : [...collected],
          recordedAt: new Date().toISOString(),
          location: typeof location === "object" ? location : null,
        },
        signature: signature ?? null,
        photos: photos.map((p) => p.blob),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={stop.site.name}
      description={`${collectionOnly ? "Collection" : "Drop"} ${stop.sequence} · ${stop.site.postcode}`}
      footer={
        <>
          <Button size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div
          role="radiogroup"
          aria-label="Outcome"
          className={cn("grid gap-2", collectionOnly ? "grid-cols-2" : "grid-cols-3")}
        >
          {outcomes.map((o) => {
            const Icon = OUTCOME_ICON[o.value];
            const selected = outcome === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setOutcome(o.value);
                  setErrors({});
                }}
                className={cn(
                  "flex min-h-control-lg min-w-0 flex-col items-center justify-center gap-1 rounded-md border p-2 text-center text-sm font-medium",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  selected
                    ? o.tone === "success"
                      ? "border-success-border bg-success-bg text-success-fg"
                      : o.tone === "warning"
                        ? "border-warning-border bg-warning-bg text-warning-fg"
                        : "border-danger-border bg-danger-bg text-danger-fg"
                    : "border-border-strong bg-surface text-text",
                )}
              >
                <Icon className="size-icon" aria-hidden />
                <span className="leading-tight">{o.label}</span>
              </button>
            );
          })}
        </div>

        {failed ? (
          <>
            <Field label="Why did it fail?" required error={errors.failureReason}>
              <Select
                value={reason}
                onValueChange={(v) => {
                  setReason(v);
                  setErrors((e) => ({ ...e, failureReason: undefined }));
                }}
                placeholder="Choose a reason"
                options={FAILURE_REASONS.map((r) => ({ value: r.value, label: r.label }))}
              />
            </Field>
            <Field label="What happened?" required error={errors.note}>
              <Textarea
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Gates locked, rang the site contact twice, no answer"
              />
            </Field>
          </>
        ) : collectionOnly ? (
          <>
            {collects.length ? (
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">
                  Collected{collectionOnly ? " *" : ""}
                </legend>
                {collects.map((a) => (
                  <Checkbox
                    key={a.id}
                    size="lg"
                    checked={collected.has(a.id)}
                    onCheckedChange={(v) => {
                      setCollected((c) => {
                        const next = new Set(c);
                        if (v === true) next.add(a.id);
                        else next.delete(a.id);
                        return next;
                      });
                      setErrors((e) => ({ ...e, collected: undefined }));
                    }}
                    label={a.label}
                  />
                ))}
                {errors.collected ? (
                  <p role="alert" className="text-sm text-danger-fg">
                    {errors.collected}
                  </p>
                ) : null}
              </fieldset>
            ) : null}
            {drops.length ? (
              <p className="text-sm">
                <span className="font-medium">Leave with the delivery:</span>{" "}
                {drops.map((a) => a.label).join(", ")}
              </p>
            ) : null}
            <Field label="Notes" hint="Optional">
              <Textarea
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. One stillage left; customer still using it"
              />
            </Field>
          </>
        ) : (
          <>
            {collects.length ? (
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">
                  Collected{collectionOnly ? " *" : ""}
                </legend>
                {collects.map((a) => (
                  <Checkbox
                    key={a.id}
                    size="lg"
                    checked={collected.has(a.id)}
                    onCheckedChange={(v) => {
                      setCollected((c) => {
                        const next = new Set(c);
                        if (v === true) next.add(a.id);
                        else next.delete(a.id);
                        return next;
                      });
                      setErrors((e) => ({ ...e, collected: undefined }));
                    }}
                    label={a.label}
                  />
                ))}
                {errors.collected ? (
                  <p role="alert" className="text-sm text-danger-fg">
                    {errors.collected}
                  </p>
                ) : null}
              </fieldset>
            ) : null}
            {drops.length ? (
              <p className="text-sm">
                <span className="font-medium">Leave with the delivery:</span>{" "}
                {drops.map((a) => a.label).join(", ")}
              </p>
            ) : null}
            <Field label="Received by" required error={errors.receivedBy}>
              <Input
                value={receivedBy}
                maxLength={120}
                autoComplete="off"
                list={contactsList}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder={noSignature ? "e.g. Left in the porch" : "Their name"}
              />
            </Field>
            <datalist id={contactsList}>
              {stop.contacts.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>

            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                Signature <span aria-hidden>*</span>
                <span className="sr-only">(required)</span>
              </legend>
              {noSignature ? null : (
                <SignaturePad
                  ref={pad}
                  label="Signature"
                  invalid={Boolean(errors.signature)}
                  describedBy={errors.signature ? signatureHint : undefined}
                  onChange={(s) => {
                    setSigned(s);
                    if (s) setErrors((e) => ({ ...e, signature: undefined }));
                  }}
                />
              )}
              <Checkbox
                checked={noSignature}
                onCheckedChange={(v) => {
                  setNoSignature(v === true);
                  setErrors((e) => ({ ...e, signature: undefined }));
                }}
                label="Nobody available to sign"
                description="Left as instructed. Take a photo of where you left it."
              />
              {errors.signature ? (
                <p id={signatureHint} role="alert" className="text-sm text-danger-fg">
                  {errors.signature}
                </p>
              ) : null}
            </fieldset>

            {outcome === "part_delivered" ? (
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-1 text-sm font-medium">Quantity delivered</legend>
                {lines.map((l) => (
                  <Field key={l.id} label={`${l.ref} · ${l.unitName} (of ${l.quantity})`}>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={l.quantity}
                      value={quantities[l.id] ?? l.quantity}
                      onChange={(e) =>
                        setQuantities((q) => ({ ...q, [l.id]: Number(e.target.value) }))
                      }
                    />
                  </Field>
                ))}
                {errors.quantities ? (
                  <p role="alert" className="text-sm text-danger-fg">
                    {errors.quantities}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            <Field label="Damage or shortage notes" hint="Optional">
              <Textarea
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. One frame scuffed on the corner"
              />
            </Field>
          </>
        )}

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              Photos{" "}
              <span className="font-normal text-text-subtle">
                ({photos.length} of {MAX_PHOTOS})
              </span>
            </span>
            <Button
              size="md"
              onClick={() => fileInput.current?.click()}
              disabled={photos.length >= MAX_PHOTOS}
            >
              <Camera aria-hidden />
              Add photo
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              aria-label="Add photos"
              onChange={(e) => void addPhotos(e.target.files)}
            />
          </div>
          {photos.length ? (
            <ul aria-label="Photos" className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <li key={p.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img
                    src={p.url}
                    alt={`Photo ${i + 1}`}
                    className="size-thumb rounded-md border border-border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPhotos((all) => all.filter((x) => x !== p));
                    }}
                    className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-border bg-surface-raised text-text shadow-overlay focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {errors.photos ? (
            <p role="alert" className="text-sm text-danger-fg">
              {errors.photos}
            </p>
          ) : null}
        </div>

        <p className="flex items-center gap-2 text-xs text-text-subtle">
          <MapPin className="size-icon-sm shrink-0" aria-hidden />
          {location === "pending"
            ? "Finding your location…"
            : location === "unavailable"
              ? "Location not available. It will save without it."
              : "Your location will be saved with this delivery."}
        </p>
      </div>
    </Modal>
  );
}
