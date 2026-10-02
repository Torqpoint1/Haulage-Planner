"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EntityForm, FormField } from "@/components/settings/entity-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  DEFAULT_THRESHOLDS,
  SITE_STALE_FIELD,
  THRESHOLD_FIELDS,
  type Thresholds,
} from "@/lib/settings/thresholds";
import { saveThresholds } from "./actions";

const FIELDS = [...THRESHOLD_FIELDS, SITE_STALE_FIELD];

export function ThresholdsForm({
  values,
  siteStaleDays,
}: {
  values: Thresholds;
  siteStaleDays: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [current, setCurrent] = useState<Record<string, number>>({
    ...values,
    site_info_stale_days: siteStaleDays,
  });

  return (
    <Card className="max-w-panel">
      <CardContent>
        <EntityForm
          key={formKey}
          id="thresholds-form"
          action={(fd) => saveThresholds(null, fd)}
          onPendingChange={setSaving}
          onSaved={() => {
            toast.success("Thresholds saved");
            router.refresh();
          }}
        >
          <div className="flex flex-col gap-6">
            {FIELDS.map((f) => {
              const fallback =
                f.key === SITE_STALE_FIELD.key
                  ? SITE_STALE_FIELD.default
                  : DEFAULT_THRESHOLDS[f.key as keyof Thresholds];
              return (
                <FormField
                  key={f.key}
                  name={f.key}
                  label={f.label}
                  hint={`${f.help} Default ${fallback}${f.unit === "%" ? "%" : ` ${f.unit}`}.`}
                >
                  <Input
                    name={f.key}
                    inputMode="numeric"
                    defaultValue={current[f.key]}
                    trailing={
                      f.unit === "working days" ? "days" : f.unit === "hours" ? "hrs" : f.unit
                    }
                    className="num md:w-menu"
                  />
                </FormField>
              );
            })}
          </div>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              onClick={() => {
                setCurrent({
                  ...DEFAULT_THRESHOLDS,
                  site_info_stale_days: SITE_STALE_FIELD.default,
                });
                setFormKey((k) => k + 1);
              }}
            >
              Reset to defaults
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save thresholds
            </Button>
          </div>
        </EntityForm>
      </CardContent>
    </Card>
  );
}
