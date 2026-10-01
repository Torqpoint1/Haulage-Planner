import { cn } from "@/lib/cn";

/** Page padding: 24 on desktop and tablet, 16 on phones (10.2). */
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-content min-w-0 flex-1 flex-col gap-6 p-4 md:p-6",
        className,
      )}
      {...props}
    />
  );
}

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  /** Primary actions, right-aligned on wide screens. */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
