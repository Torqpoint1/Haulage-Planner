import { PrintButton } from "./print-button";

/** Escapes text for a CSS string in the @page rule. */
const cssString = (s: string) =>
  `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\n\r]/g, " ")}"`;

/**
 * A4 sheet frame: toolbar on screen only, organisation header, and page
 * numbers in the page margin (spec 10.8).
 */
export function PrintShell({
  title,
  meta,
  organisation,
  backHref,
  children,
}: {
  title: string;
  meta: string[];
  organisation: { name: string; logo: string | null };
  backHref: string;
  children: React.ReactNode;
}) {
  const footer = cssString(`${organisation.name} · ${title}`);
  const page = `@page { size: A4; margin: 12mm 12mm 16mm;
    @bottom-left { content: ${footer}; font: 8pt sans-serif; color: #333; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #333; } }`;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: page }} />
      <div className="print-toolbar">
        <a href={backHref}>Back</a>
        <PrintButton />
      </div>
      <main className="print-page" aria-label={title}>
        <header className="print-header">
          <div>
            <h1>{title}</h1>
            {meta.filter(Boolean).map((m) => (
              <p key={m} className="meta">
                {m}
              </p>
            ))}
          </div>
          <div className="org">
            {organisation.logo ? (
              // Signed storage URL; next/image can't optimise it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={organisation.logo} alt={`${organisation.name} logo`} />
            ) : (
              <span>{organisation.name}</span>
            )}
          </div>
        </header>
        {children}
      </main>
    </>
  );
}
