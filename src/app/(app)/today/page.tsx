import {
  Boxes,
  CalendarDays,
  ClipboardList,
  OctagonAlert,
  CircleAlert,
  ShieldCheck,
  Truck,
  User,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SpaceBar, WeightBar } from "@/app/(app)/plan/load-card";
import { ReadinessBadge } from "@/components/orders/badges";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { Badge, type StatusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGroup } from "@/components/ui/stat";
import { requireArea } from "@/lib/auth/session";
import {
  formatDateLong,
  formatIsoDate,
  formatLocalDayShort,
  fromIsoDate,
  plural,
} from "@/lib/format";
import { optionFor } from "@/lib/orders/options";
import { LOAD_STATUSES } from "@/lib/planning/types";
import { loadToday, type AttentionGroup } from "@/lib/today/data";

export const metadata: Metadata = { title: "Today" };

function Attention({
  groups,
  severity,
  today,
}: {
  groups: AttentionGroup[];
  severity: "blocking" | "check";
  today: string;
}) {
  if (!groups.length) return null;
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const Icon = severity === "blocking" ? OctagonAlert : CircleAlert;
  const label = severity === "blocking" ? "Blocking" : "Checks";
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-3">
      <h3
        className={
          severity === "blocking"
            ? "flex items-center gap-2 text-sm font-semibold text-danger-fg"
            : "flex items-center gap-2 text-sm font-semibold text-warning-fg"
        }
      >
        <Icon className="size-icon-sm" aria-hidden />
        {label} ({count})
      </h3>
      <ul className="flex min-w-0 flex-col gap-3">
        {groups.map((g) => (
          <li key={g.loadId} className="flex min-w-0 flex-col gap-2">
            <p className="truncate text-xs font-semibold text-text-muted uppercase">
              {g.title} · {g.date === today ? "Today" : formatLocalDayShort(fromIsoDate(g.date))}
            </p>
            <ul aria-label={`${label} for ${g.title}`} className="flex min-w-0 flex-col gap-2">
              {g.items.map((w) => (
                <li
                  key={w.key}
                  className={
                    severity === "blocking"
                      ? "flex min-w-0 flex-col gap-2 rounded-md border border-danger-border bg-danger-bg p-3 md:flex-row md:items-start md:justify-between"
                      : "flex min-w-0 flex-col gap-2 rounded-md border border-warning-border bg-warning-bg p-3 md:flex-row md:items-start md:justify-between"
                  }
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium break-words">{w.title}</span>
                    <span className="text-sm break-words text-text-muted">{w.detail}</span>
                  </div>
                  <Button asChild size="sm" className="shrink-0 self-start">
                    <Link href={w.href} aria-label={`Fix: ${w.title}`}>
                      Fix
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function TodayPage() {
  await requireArea("today");
  await connection(); // "today" must be worked out per request
  const t = await loadToday();
  const attention = t.blocking.length + t.checks.length;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="Today"
        description={formatDateLong(fromIsoDate(t.today))}
        actions={
          <Button asChild variant="primary">
            <Link href="/plan">
              <CalendarDays aria-hidden />
              Open plan
            </Link>
          </Button>
        }
      />

      <StatGroup aria-label="Today at a glance">
        <Stat label="Loads" value={t.stats.loads} />
        <Stat label="Vehicles out" value={t.stats.vehiclesOut} />
        <Stat label="Drops" value={t.stats.drops} />
        <Stat
          label="Overdue assets"
          value={
            <Link
              href="/history/assets?status=overdue"
              className={
                t.stats.overdueAssets ? "text-warning-fg hover:underline" : "hover:underline"
              }
            >
              {t.stats.overdueAssets}
            </Link>
          }
        />
      </StatGroup>

      <Card>
        <CardHeader className="flex-col justify-start gap-1">
          <CardTitle>Needs attention</CardTitle>
          <p className="text-sm text-text-muted">
            Loads from today to {formatIsoDate(t.until)} ({plural(t.lookAheadDays, "working day")}{" "}
            ahead).
          </p>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-6">
          {attention ? (
            <>
              <Attention groups={t.blocking} severity="blocking" today={t.today} />
              <Attention groups={t.checks} severity="check" today={t.today} />
            </>
          ) : (
            <EmptyState
              compact
              icon={ShieldCheck}
              title="Nothing needs attention"
              description="Blocking warnings appear here first, then checks, grouped by load, each with a link to the fix."
            />
          )}
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s loads</CardTitle>
          </CardHeader>
          <CardContent>
            {t.loads.length ? (
              <ul aria-label="Today's loads" className="flex min-w-0 flex-col gap-3">
                {t.loads.map((l) => {
                  const status = optionFor(LOAD_STATUSES, l.status);
                  return (
                    <li key={l.id}>
                      <Link
                        href={l.href}
                        className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <Truck
                              className="mt-1 size-icon-sm shrink-0 text-text-muted"
                              aria-hidden
                            />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-semibold">{l.title}</span>
                              <span className="truncate text-xs text-text-muted">{l.subtitle}</span>
                            </div>
                          </div>
                          <Badge tone={status.tone as StatusTone}>{status.label}</Badge>
                        </div>
                        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                          <span className="flex items-center gap-1">
                            <User className="size-icon-sm" aria-hidden />
                            {l.drivers || "No driver"}
                          </span>
                          <span className="num">{plural(l.stops, "stop")}</span>
                          {l.blocking ? (
                            <Badge tone="danger">{plural(l.blocking, "blocking warning")}</Badge>
                          ) : null}
                          {l.checks ? (
                            <Badge tone="warning">{plural(l.checks, "check")}</Badge>
                          ) : null}
                        </p>
                        <div className="flex min-w-0 flex-col gap-2">
                          <SpaceBar metrics={l.metrics} nearLimit={t.nearLimit} />
                          <WeightBar metrics={l.metrics} nearLimit={t.nearLimit} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Truck}
                title="No loads planned for today"
                description="Loads you plan for today will show here with their vehicle, driver, stops and capacity."
                action={
                  <Button asChild>
                    <Link href="/plan">Plan a load</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-col justify-start gap-1">
            <CardTitle>Due in the next {plural(t.lookAheadDays, "working day")}</CardTitle>
            <p className="text-sm text-text-muted">Unplanned or not ready yet, oldest first.</p>
          </CardHeader>
          <CardContent>
            {t.dueOrders.length ? (
              <ul
                aria-label="Orders due soon"
                className="flex min-w-0 flex-col divide-y divide-border"
              >
                {t.dueOrders.map((o) => (
                  <li key={o.id} className="flex min-w-0 flex-col gap-1 py-2">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <Link
                        href={`/orders/${o.id}`}
                        className="shrink-0 text-sm font-semibold hover:underline"
                      >
                        {o.ref}
                      </Link>
                      <span className="min-w-0 flex-1 truncate text-sm">{o.customer}</span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className={
                          o.requiredDate < t.today
                            ? "num text-xs text-danger-fg"
                            : "num text-xs text-text-muted"
                        }
                      >
                        {o.requiredDate < t.today ? "Overdue " : "Due "}
                        {formatIsoDate(o.requiredDate)}
                      </span>
                      {o.status === "unplanned" ? <Badge tone="info">Unplanned</Badge> : null}
                      <ReadinessBadge value={o.readiness as "ready"} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={ClipboardList}
                title="No orders waiting"
                description="Orders that are unplanned or not ready yet are listed here so nothing is missed."
                action={
                  <Button asChild>
                    <Link href="/orders">View orders</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {t.stats.overdueAssets ? (
        <p className="flex items-center gap-2 text-sm">
          <Boxes className="size-icon-sm shrink-0 text-warning-fg" aria-hidden />
          <Link
            href="/history/assets?status=overdue"
            className="font-medium text-accent-text hover:underline"
          >
            {plural(t.stats.overdueAssets, "returnable asset")} overdue back from customers
          </Link>
        </p>
      ) : null}
    </PageContainer>
  );
}
