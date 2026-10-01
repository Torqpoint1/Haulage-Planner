import { MapPinOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        icon={MapPinOff}
        title="Page not found"
        description="This address doesn't match any page. It may have moved, or the link may be wrong."
        action={
          <Button asChild variant="primary">
            <Link href="/today">Go to Today</Link>
          </Button>
        }
      />
    </main>
  );
}
