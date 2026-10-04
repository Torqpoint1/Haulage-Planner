"use client";

import { CircleAlert, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { FormState } from "@/lib/settings/result";
import { cancelDeletion, requestDeletion } from "./actions";

/** Ask for the organisation to be deleted, or cancel a pending request (spec 12). */
export function DeletionRequest({
  organisationName,
  request,
}: {
  organisationName: string;
  request: { id: string; created_at: string; reason: string } | null;
}) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const due = request ? new Date(new Date(request.created_at).getTime() + 30 * 86_400_000) : null;

  return (
    <Card>
      <CardHeader className="flex-col justify-start gap-1">
        <CardTitle>Delete your organisation</CardTitle>
        <CardDescription>
          Everything is deleted 30 days after you ask: users, settings, customers, orders, loads,
          proof of delivery and files. Until then you can cancel. Export your data first if you need
          a copy.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}
        {request && due ? (
          <div className="flex flex-col items-start gap-3" role="status">
            <Badge tone="danger" icon={<CircleAlert aria-hidden />}>
              Deletion requested
            </Badge>
            <p className="text-sm">
              Requested on <span className="num">{formatDate(request.created_at)}</span>.{" "}
              {organisationName} and all its data will be deleted on or after{" "}
              <span className="num">{formatDate(due)}</span>.
            </p>
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  setState(await cancelDeletion(request.id));
                })
              }
            >
              Cancel the deletion request
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            action={(formData) =>
              start(async () => {
                setState(await requestDeletion(formData));
              })
            }
          >
            <Field label="Reason" hint="Optional. Helps us improve." error={state.errors?.reason}>
              <Textarea name="reason" rows={3} maxLength={2000} />
            </Field>
            <Field
              label={`Type ${organisationName} to confirm`}
              error={state.errors?.confirm}
              required
            >
              <Input name="confirm" autoComplete="off" />
            </Field>
            <div>
              <Button type="submit" variant="danger" loading={pending}>
                <Trash2 aria-hidden />
                Request deletion
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
