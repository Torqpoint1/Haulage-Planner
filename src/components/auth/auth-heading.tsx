export function AuthHeading({
  title,
  description,
}: {
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description ? <p className="text-sm text-text-muted">{description}</p> : null}
    </div>
  );
}

/** Form-level error, announced to screen readers. */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
    >
      {children}
    </p>
  );
}
