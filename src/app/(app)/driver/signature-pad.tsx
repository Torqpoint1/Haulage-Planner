"use client";

import { Eraser } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type SignaturePadHandle = {
  /** The signature as a PNG, or null if nothing has been drawn. */
  toBlob: () => Promise<Blob | null>;
};

/**
 * Sign with a finger or stylus. Always black ink on white, like paper, so it
 * reads the same in dark mode and on a black-and-white printout.
 */
export function SignaturePad({
  ref,
  label,
  invalid,
  describedBy,
  onChange,
}: {
  ref: React.Ref<SignaturePadHandle>;
  label: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (signed: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [signed, setSigned] = useState(false);

  // Size the drawing surface to the element at the device's pixel density.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = el.clientWidth * ratio;
    el.height = el.clientHeight * ratio;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, el.clientWidth, el.clientHeight);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useImperativeHandle(ref, () => ({
    toBlob: () =>
      new Promise((resolve) => {
        if (!signed || !canvas.current) return resolve(null);
        canvas.current.toBlob(resolve, "image/png");
      }),
  }));

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1, 0, Math.PI * 2);
      ctx.fillStyle = "#111111";
      ctx.fill();
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = point(e);
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!signed) {
      setSigned(true);
      onChange(true);
    }
  }

  function end() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, el.clientWidth, el.clientHeight);
    setSigned(false);
    onChange(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <canvas
        ref={canvas}
        role="img"
        aria-label={signed ? `${label}: signed` : `${label}: not signed yet`}
        aria-describedby={describedBy}
        className={cn(
          "h-signature w-full cursor-crosshair touch-none rounded-md border",
          invalid ? "border-danger" : "border-border-strong",
        )}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-subtle">Sign inside the box</span>
        <Button size="sm" variant="ghost" onClick={clear} disabled={!signed}>
          <Eraser aria-hidden />
          Clear signature
        </Button>
      </div>
    </div>
  );
}
