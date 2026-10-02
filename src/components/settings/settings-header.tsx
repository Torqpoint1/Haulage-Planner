import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page";

/** Back to Settings, then the section's title and description. */
export function SettingsHeader({
  title,
  description,
  actions,
  backHref = "/settings",
  backLabel = "Settings",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ChevronLeft className="size-icon-sm" aria-hidden />
        {backLabel}
      </Link>
      <PageHeader title={title} description={description} actions={actions} />
    </div>
  );
}
