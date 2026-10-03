"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIsoDate } from "@/lib/format";
import type { DeliveryOption } from "@/lib/suggestions/options";
import { orderOptionsAction } from "./actions";
import { OptionsList } from "./options-list";

/** Every way to deliver one order on its own, ranked by cost (spec 8.2). */
export function CompareModal({
  orderId,
  orderRef,
  onClose,
}: {
  orderId: string;
  orderRef: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{ date: string; options: DeliveryOption[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await orderOptionsAction(orderId);
      if (r.ok) setResult(r);
      else setError(r.error);
    });
  }, [orderId]);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Options for ${orderRef}`}
      description={
        result ? `On its own, from your default depot on ${formatIsoDate(result.date)}.` : undefined
      }
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {error ? (
        <p className="text-sm text-text-muted">{error}</p>
      ) : result ? (
        <OptionsList options={result.options} label={`Options for ${orderRef}`} />
      ) : (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Working out options">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}
    </Modal>
  );
}
