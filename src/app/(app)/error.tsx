"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/shell/page";
import { ErrorState } from "@/components/ui/empty-state";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer>
      <ErrorState
        title="This page didn't load"
        description="Nothing has been lost. Check your connection and try again. If it keeps happening, let your administrator know."
        onRetry={retry}
      />
    </PageContainer>
  );
}
