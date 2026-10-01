"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/auth/auth-heading";
import { signOut } from "@/components/shell/actions";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "./actions";

export function AcceptInvitation({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <FormError>{error}</FormError>
      <Button
        variant="primary"
        size="lg"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        Accept invitation
      </Button>
    </div>
  );
}

export function SignOutButton({ next }: { next: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      loading={pending}
      onClick={() => startTransition(() => signOut(next))}
    >
      Sign out
    </Button>
  );
}
