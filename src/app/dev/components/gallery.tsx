"use client";

import {
  ArrowRight,
  Download,
  Inbox,
  Monitor,
  Moon,
  Plus,
  Rows3,
  Rows4,
  Search,
  Sun,
  Trash2,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { MapLegend, MapPanel } from "@/components/map/map-panel";
import { loadColour, type MapPin, type MapRoute } from "@/components/map/types";
import { useTheme, type Density, type ThemePreference } from "@/components/theme/theme-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CapacityBar } from "@/components/ui/capacity-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { PanelSection, SidePanel } from "@/components/ui/side-panel";
import { Skeleton, SkeletonCard, SkeletonTable, SkeletonText } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { SegmentedControl, Toggle } from "@/components/ui/toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { Truncate } from "@/components/ui/truncate";
import { WarningItem, WarningsBadge } from "@/components/ui/warning-item";
import { accentCss, DEFAULT_ACCENT } from "@/lib/color";
import { formatGbp, formatKg, formatLocalDate, formatMiles } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Sample data (fictional)                                             */
/* ------------------------------------------------------------------ */

const SITES: ComboboxOption[] = [
  {
    value: "s1",
    label: "Hillside Builders – Stroud yard",
    description: "Stroud · GL5 3AA",
    keywords: ["HB001"],
  },
  { value: "s2", label: "Marlow Joinery", description: "Gloucester · GL1 2BB" },
  {
    value: "s3",
    label: "Severn Timber Merchants – Chepstow depot",
    description: "Chepstow · NP16 5CC",
  },
  {
    value: "s4",
    label: "Oakfield Homes – Plot 14, Meadow View development",
    description: "Swindon · SN1 4DD",
  },
  { value: "s5", label: "Brecon Doors & Windows", description: "Brecon · LD3 7EE" },
];

const VEHICLE_OPTIONS = [
  { value: "luton", label: "Luton with tail lift (750 kg)" },
  { value: "75t", label: "7.5t curtainsider" },
  { value: "18t", label: "18t curtainsider" },
  { value: "haulier", label: "Outside haulier", disabled: true },
];

type OrderRow = {
  id: string;
  ref: string;
  customer: string;
  postcode: string;
  units: string;
  weightKg: number;
  required: Date;
  readiness: "Ready" | "Part ready" | "In production" | "Not started";
};

const ORDERS: OrderRow[] = [
  {
    id: "1",
    ref: "ORD-10421",
    customer: "Hillside Builders",
    postcode: "GL5 3AA",
    units: "6 door packs",
    weightKg: 840,
    required: new Date(2026, 9, 5),
    readiness: "Ready",
  },
  {
    id: "2",
    ref: "ORD-10422",
    customer: "Oakfield Homes – Meadow View development, Plot 14",
    postcode: "SN1 4DD",
    units: "2 Euro pallets",
    weightKg: 520,
    required: new Date(2026, 9, 6),
    readiness: "Part ready",
  },
  {
    id: "3",
    ref: "ORD-10423",
    customer: "Marlow Joinery",
    postcode: "GL1 2BB",
    units: "1 long length",
    weightKg: 95,
    required: new Date(2026, 9, 2),
    readiness: "In production",
  },
  {
    id: "4",
    ref: "ORD-10424",
    customer: "Severn Timber Merchants",
    postcode: "NP16 5CC",
    units: "12 door packs",
    weightKg: 1680,
    required: new Date(2026, 9, 7),
    readiness: "Not started",
  },
  {
    id: "5",
    ref: "ORD-10425",
    customer: "Brecon Doors & Windows",
    postcode: "LD3 7EE",
    units: "4 UK pallets",
    weightKg: 1120,
    required: new Date(2026, 9, 5),
    readiness: "Ready",
  },
];

const READINESS_TONE = {
  Ready: "success",
  "Part ready": "warning",
  "In production": "info",
  "Not started": "neutral",
} as const;

const ORDER_COLUMNS: Column<OrderRow>[] = [
  {
    id: "ref",
    header: "Order ref",
    cell: (r) => <span className="font-medium">{r.ref}</span>,
    sortValue: (r) => r.ref,
    hideable: false,
  },
  {
    id: "customer",
    header: "Customer",
    cell: (r) => <Truncate>{r.customer}</Truncate>,
    sortValue: (r) => r.customer,
    className: "max-w-menu",
  },
  { id: "postcode", header: "Postcode", cell: (r) => r.postcode, sortValue: (r) => r.postcode },
  { id: "units", header: "Units", cell: (r) => r.units, defaultHidden: true },
  {
    id: "weight",
    header: "Weight",
    cell: (r) => formatKg(r.weightKg),
    sortValue: (r) => r.weightKg,
    align: "right",
  },
  {
    id: "required",
    header: "Required",
    cell: (r) => formatLocalDate(r.required),
    sortValue: (r) => r.required,
    align: "right",
  },
  {
    id: "readiness",
    header: "Readiness",
    cell: (r) => <Badge tone={READINESS_TONE[r.readiness]}>{r.readiness}</Badge>,
    sortValue: (r) => r.readiness,
  },
];

const PINS: MapPin[] = [
  { id: "depot", lat: 51.745, lng: -2.217, label: "Depot – Stroud", colour: "neutral" },
  { id: "p1", lat: 51.864, lng: -2.244, label: "Marlow Joinery, Gloucester", colour: "load-1" },
  { id: "p2", lat: 51.899, lng: -2.078, label: "Cheltenham drop", colour: "load-1" },
  { id: "p3", lat: 51.641, lng: -2.673, label: "Severn Timber, Chepstow", colour: "load-2" },
  { id: "p4", lat: 51.558, lng: -1.781, label: "Oakfield Homes, Swindon", colour: "load-3" },
  { id: "p5", lat: 51.947, lng: -3.391, label: "Brecon Doors & Windows", colour: "load-2" },
];

const ROUTES: MapRoute[] = [
  {
    id: "r1",
    colour: "load-1",
    points: [
      [51.745, -2.217],
      [51.864, -2.244],
      [51.899, -2.078],
    ],
  },
  {
    id: "r2",
    colour: "load-2",
    points: [
      [51.745, -2.217],
      [51.641, -2.673],
      [51.947, -3.391],
    ],
  },
  {
    id: "r3",
    colour: "load-3",
    points: [
      [51.745, -2.217],
      [51.558, -1.781],
    ],
  },
];

const ACCENTS = [
  { value: DEFAULT_ACCENT, label: "Deep blue (default)" },
  { value: "#0f766e", label: "Teal" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#e11d48", label: "Rose" },
  { value: "#facc15", label: "Yellow (auto-adjusted)" },
  { value: "#f97316", label: "Orange (auto-adjusted)" },
];

const SECTIONS = [
  ["foundations", "Foundations"],
  ["accent", "Accent colour"],
  ["button", "Button"],
  ["input", "Input"],
  ["select", "Select"],
  ["combobox", "Combobox"],
  ["date-picker", "Date picker"],
  ["checkbox", "Checkbox"],
  ["toggle", "Toggle"],
  ["badge", "Chip / Badge"],
  ["card", "Card"],
  ["table", "Table"],
  ["side-panel", "Side panel"],
  ["modal", "Modal"],
  ["tabs", "Tabs"],
  ["toast", "Toast"],
  ["empty-state", "Empty state"],
  ["skeleton", "Skeleton loader"],
  ["capacity-bar", "Capacity bar"],
  ["warning-item", "Warning item"],
  ["map-panel", "Map panel"],
  ["avatar", "Avatar"],
  ["tooltip", "Tooltip"],
] as const;

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-header flex-col gap-4 border-t border-border pt-8 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function State({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className ?? ""}`}>
      <p className="text-xs font-medium text-text-subtle">{label}</p>
      {children}
    </div>
  );
}

function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-2 xl:grid-cols-3",
    4: "md:grid-cols-2 xl:grid-cols-4",
  }[cols];
  return <div className={`grid gap-6 ${c}`}>{children}</div>;
}

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="size-control shrink-0 rounded-md border border-border"
        style={{ background: `var(${varName})` }}
        aria-hidden
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <code className="truncate text-xs text-text-subtle">{varName}</code>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */

export function Gallery() {
  const { theme, setTheme, density, setDensity } = useTheme();
  const [accent, setAccent] = useState(DEFAULT_ACCENT);

  const [selectValue, setSelectValue] = useState<string | undefined>("75t");
  const [site, setSite] = useState<string | null>("s4");
  const [date, setDate] = useState<Date | null>(new Date(2026, 9, 1));
  const [checks, setChecks] = useState({ a: false, b: true });
  const [toggles, setToggles] = useState({ upright: true, stackable: false });
  const [view, setView] = useState<"week" | "day">("week");
  const [chips, setChips] = useState(["GL", "NP", "SN"]);
  const [selectedRow, setSelectedRow] = useState<string | null>("2");
  const [selectedPin, setSelectedPin] = useState<string | null>("p3");
  const [overridden, setOverridden] = useState<{ by: string; reason: string } | undefined>();
  const [dismissed, setDismissed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  function applyAccent(value: string) {
    setAccent(value);
    const style = document.getElementById("org-accent");
    if (style) style.textContent = accentCss(value);
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex min-w-0 flex-col">
            <h1 className="text-lg font-semibold">Component gallery</h1>
            <p className="text-xs text-text-subtle">Development only · spec section 10</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<ThemePreference>
              aria-label="Theme"
              value={theme}
              onValueChange={setTheme}
              options={[
                { value: "system", label: "System", icon: <Monitor aria-hidden />, iconOnly: true },
                { value: "light", label: "Light", icon: <Sun aria-hidden />, iconOnly: true },
                { value: "dark", label: "Dark", icon: <Moon aria-hidden />, iconOnly: true },
              ]}
            />
            <SegmentedControl<Density>
              aria-label="Density"
              value={density}
              onValueChange={setDensity}
              options={[
                {
                  value: "comfortable",
                  label: "Comfortable",
                  icon: <Rows3 aria-hidden />,
                  iconOnly: true,
                },
                { value: "compact", label: "Compact", icon: <Rows4 aria-hidden />, iconOnly: true },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-content gap-8 px-4 py-6 md:px-6">
        <nav aria-label="Components" className="hidden w-menu shrink-0 xl:block">
          <ul className="flex flex-col gap-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-md px-3 py-1 text-sm text-text-muted hover:bg-surface-muted hover:text-text"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-8">
          {/* ---------------- Foundations ---------------- */}
          <Section
            id="foundations"
            title="Foundations"
            description="Tokens from globals.css. Only these values exist as utilities."
          >
            <State label="Surfaces and text">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Swatch name="Background" varName="--bg" />
                <Swatch name="Surface" varName="--surface" />
                <Swatch name="Surface muted" varName="--surface-muted" />
                <Swatch name="Border" varName="--border" />
                <Swatch name="Text" varName="--text" />
                <Swatch name="Text muted" varName="--text-muted" />
                <Swatch name="Text subtle" varName="--text-subtle" />
                <Swatch name="Accent" varName="--accent" />
              </div>
            </State>
            <State label="Status colours (meaning only)">
              <div className="flex flex-wrap gap-2">
                <Badge tone="danger" size="md">
                  Blocking
                </Badge>
                <Badge tone="warning" size="md">
                  Check
                </Badge>
                <Badge tone="success" size="md">
                  Ready
                </Badge>
                <Badge tone="info" size="md">
                  Info
                </Badge>
              </div>
            </State>
            <State label="Load palette (map)">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className="flex h-control-sm min-w-control items-center justify-center rounded-md px-2 text-xs font-medium text-white"
                    style={{ background: `var(--load-${i + 1})` }}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </State>
            <State label="Type scale · 400 / 500 / 600">
              <div className="flex flex-col gap-2">
                <p className="text-2xl font-semibold">32 · Page headline</p>
                <p className="text-xl font-semibold">24 · Section title</p>
                <p className="text-lg font-semibold">20 · Panel title</p>
                <p className="text-base">16 · Body text in standard views</p>
                <p className="text-sm font-medium">14 · Labels and dense views (medium)</p>
                <p className="text-xs text-text-muted">12 · Captions and meta</p>
                <p className="num text-sm">Tabular figures: 1,111 kg · 8,888 kg · £1,234.50</p>
              </div>
            </State>
            <State label="Spacing scale (px)">
              <div className="flex flex-wrap items-end gap-4">
                {(["w-1", "w-2", "w-3", "w-4", "w-6", "w-8", "w-12", "w-16"] as const).map(
                  (w, i) => (
                    <div key={w} className="flex flex-col items-center gap-1">
                      <span className={`h-4 rounded-sm bg-accent ${w}`} />
                      <span className="num text-xs text-text-subtle">
                        {[4, 8, 12, 16, 24, 32, 48, 64][i]}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </State>
          </Section>

          {/* ---------------- Accent ---------------- */}
          <Section
            id="accent"
            title="Accent colour"
            description="One accent per organisation. Contrast is checked and adjusted automatically in both themes."
          >
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <Chip
                  key={a.value}
                  selected={accent === a.value}
                  onClick={() => applyAccent(a.value)}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onKeyDown={(e) => e.key === "Enter" && applyAccent(a.value)}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: a.value }}
                    aria-hidden
                  />
                  {a.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary">Primary action</Button>
              <a
                href="#accent"
                className="text-sm font-medium text-accent-text underline underline-offset-2"
              >
                A link in accent text
              </a>
              <Checkbox label="Selected" checked />
              <Toggle checked aria-label="Accent toggle" />
            </div>
          </Section>

          {/* ---------------- Button ---------------- */}
          <Section
            id="button"
            title="Button"
            description="Primary, secondary, ghost and danger in three sizes."
          >
            {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
              <State key={variant} label={variant}>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant={variant} size="sm">
                    Small
                  </Button>
                  <Button variant={variant}>Medium</Button>
                  <Button variant={variant} size="lg">
                    Large
                  </Button>
                  <Button variant={variant}>
                    <Plus aria-hidden />
                    With icon
                  </Button>
                  <Button variant={variant} iconOnly aria-label="Delete">
                    <Trash2 aria-hidden />
                  </Button>
                  <Button variant={variant} loading>
                    Saving
                  </Button>
                  <Button variant={variant} disabled>
                    Disabled
                  </Button>
                </div>
              </State>
            ))}
          </Section>

          {/* ---------------- Input ---------------- */}
          <Section id="input" title="Input">
            <Grid>
              <Field label="Default">
                <Input placeholder="Customer PO number" />
              </Field>
              <Field label="With value">
                <Input defaultValue="PO-88231" />
              </Field>
              <Field label="Search">
                <Input leadingIcon={<Search />} placeholder="Search orders" />
              </Field>
              <Field label="With unit" hint="Typical weight per unit.">
                <Input defaultValue="140" trailing="kg" inputMode="numeric" className="num" />
              </Field>
              <Field label="Disabled">
                <Input defaultValue="Locked value" disabled />
              </Field>
              <Field label="Error" error="Enter a valid UK postcode, e.g. GL5 3AA." required>
                <Input defaultValue="GL5" />
              </Field>
              <Field
                label="Notes"
                hint="Printed on the run sheet."
                className="md:col-span-2 xl:col-span-3"
              >
                <Textarea defaultValue="Ring 30 minutes before arrival. Gate code 4471." />
              </Field>
            </Grid>
          </Section>

          {/* ---------------- Select ---------------- */}
          <Section id="select" title="Select">
            <Grid>
              <Field label="Placeholder">
                <Select options={VEHICLE_OPTIONS} placeholder="Choose a vehicle" />
              </Field>
              <Field label="Selected">
                <Select
                  options={VEHICLE_OPTIONS}
                  value={selectValue}
                  onValueChange={setSelectValue}
                />
              </Field>
              <Field label="Disabled">
                <Select options={VEHICLE_OPTIONS} defaultValue="18t" disabled />
              </Field>
              <Field label="Error" error="Choose a vehicle before confirming.">
                <Select options={VEHICLE_OPTIONS} placeholder="Choose a vehicle" />
              </Field>
            </Grid>
          </Section>

          {/* ---------------- Combobox ---------------- */}
          <Section
            id="combobox"
            title="Combobox"
            description="Searchable; matches name, town, postcode and account ref."
          >
            <Grid>
              <Field label="Empty">
                <Combobox options={SITES} placeholder="Choose a site" />
              </Field>
              <Field label="Selected (long name truncates)">
                <Combobox options={SITES} value={site} onValueChange={setSite} />
              </Field>
              <Field label="Disabled">
                <Combobox options={SITES} value="s2" disabled />
              </Field>
              <Field label="Error" error="Choose the delivery site.">
                <Combobox options={SITES} placeholder="Choose a site" />
              </Field>
            </Grid>
          </Section>

          {/* ---------------- Date picker ---------------- */}
          <Section
            id="date-picker"
            title="Date picker"
            description="Type dd/mm/yyyy or pick from the calendar (Monday first)."
          >
            <Grid>
              <Field label="Empty">
                <DatePicker value={null} onValueChange={() => {}} />
              </Field>
              <Field
                label="With value"
                hint={date ? `Selected ${formatLocalDate(date)}` : "No date"}
              >
                <DatePicker value={date} onValueChange={setDate} />
              </Field>
              <Field label="Weekdays only">
                <DatePicker
                  value={null}
                  onValueChange={() => {}}
                  isDateDisabled={(d) => d.getDay() === 0 || d.getDay() === 6}
                />
              </Field>
              <Field label="Disabled">
                <DatePicker value={new Date(2026, 9, 5)} onValueChange={() => {}} disabled />
              </Field>
              <Field label="Error" error="Required date can't be before the earliest date.">
                <DatePicker value={new Date(2026, 8, 28)} onValueChange={() => {}} />
              </Field>
            </Grid>
          </Section>

          {/* ---------------- Checkbox ---------------- */}
          <Section id="checkbox" title="Checkbox">
            <Grid>
              <State label="Unchecked">
                <Checkbox
                  label="Tail lift required"
                  checked={checks.a}
                  onCheckedChange={(v) => setChecks((c) => ({ ...c, a: v === true }))}
                />
              </State>
              <State label="Checked">
                <Checkbox
                  label="Booking required"
                  checked={checks.b}
                  onCheckedChange={(v) => setChecks((c) => ({ ...c, b: v === true }))}
                />
              </State>
              <State label="Indeterminate">
                <Checkbox label="All lines picked" checked="indeterminate" />
              </State>
              <State label="Disabled">
                <Checkbox label="Crane drop allowed" disabled />
              </State>
              <State label="Disabled checked">
                <Checkbox label="Handball allowed" checked disabled />
              </State>
              <State label="With description">
                <Checkbox
                  label="Site contact must be present"
                  description="Driver can't unload without them."
                  defaultChecked
                />
              </State>
              <State label="Large (warehouse tablets)">
                <Checkbox size="lg" label="ORD-10421 · 6 door packs · loaded" defaultChecked />
              </State>
            </Grid>
          </Section>

          {/* ---------------- Toggle ---------------- */}
          <Section id="toggle" title="Toggle">
            <Grid>
              <State label="On">
                <Toggle
                  label="Must stay upright"
                  description="Can't travel flat or use a tail lift."
                  checked={toggles.upright}
                  onCheckedChange={(v) => setToggles((t) => ({ ...t, upright: v }))}
                />
              </State>
              <State label="Off">
                <Toggle
                  label="Stackable"
                  checked={toggles.stackable}
                  onCheckedChange={(v) => setToggles((t) => ({ ...t, stackable: v }))}
                />
              </State>
              <State label="Disabled">
                <Toggle label="Returnable asset" disabled />
              </State>
              <State label="Disabled on">
                <Toggle label="Fragile" checked disabled />
              </State>
              <State label="Segmented control">
                <SegmentedControl
                  aria-label="Plan view"
                  value={view}
                  onValueChange={setView}
                  options={[
                    { value: "week", label: "Week" },
                    { value: "day", label: "Day" },
                  ]}
                />
              </State>
              <State label="Segmented control (small)">
                <SegmentedControl
                  size="sm"
                  aria-label="Plan view small"
                  value={view}
                  onValueChange={setView}
                  options={[
                    { value: "week", label: "Week" },
                    { value: "day", label: "Day" },
                  ]}
                />
              </State>
            </Grid>
          </Section>

          {/* ---------------- Badge ---------------- */}
          <Section
            id="badge"
            title="Chip / Badge"
            description="Badges show status with colour, icon and label. Chips are neutral tags and filters."
          >
            <State label="Status badges (small and medium)">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="danger">Blocking</Badge>
                <Badge tone="warning">Part ready</Badge>
                <Badge tone="success">Ready</Badge>
                <Badge tone="info">In production</Badge>
                <Badge tone="neutral">Not started</Badge>
                <Badge tone="danger" size="md">
                  Failed
                </Badge>
                <Badge tone="success" size="md">
                  Delivered
                </Badge>
                <Badge tone="neutral" size="md" icon={<Truck aria-hidden />}>
                  Out for delivery
                </Badge>
              </div>
            </State>
            <State label="Chips: colour tags, selected, removable">
              <div className="flex flex-wrap items-center gap-2">
                <Chip colour="load-1">Door pack</Chip>
                <Chip colour="load-2">Euro pallet</Chip>
                <Chip colour="load-3">UK pallet</Chip>
                <Chip colour="load-4">Long length</Chip>
                <Chip selected>Thursday</Chip>
                {chips.map((c) => (
                  <Chip
                    key={c}
                    onRemove={() => setChips((all) => all.filter((x) => x !== c))}
                    removeLabel={`Remove ${c} filter`}
                  >
                    Postcode {c}
                  </Chip>
                ))}
              </div>
            </State>
          </Section>

          {/* ---------------- Card ---------------- */}
          <Section
            id="card"
            title="Card"
            description="16 padding, 12 radius, 1px border. Shadow only when raised."
          >
            <Grid>
              <Card>
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-1">
                    <CardTitle>18t curtainsider</CardTitle>
                    <CardDescription>Dave Hughes · 5 drops</CardDescription>
                  </div>
                  <Badge tone="info">Planned</Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <CapacityBar label="Space" used={14} capacity={16} unit="pallet spaces" />
                  <CapacityBar label="Weight" used={6200} capacity={9500} format={formatKg} />
                </CardContent>
                <CardFooter className="justify-between">
                  <WarningsBadge counts={{ check: 1 }} />
                  <span className="num text-sm text-text-muted">
                    {formatMiles(142)} · {formatGbp(318.4)}
                  </span>
                </CardFooter>
              </Card>
              <Card interactive>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">Interactive card</p>
                  <p className="text-sm text-text-muted">Hover to see the border strengthen.</p>
                </CardContent>
              </Card>
              <Card selected>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">Selected card</p>
                  <p className="text-sm text-text-muted">Matches a selected map pin.</p>
                </CardContent>
              </Card>
              <Card raised>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">Raised card</p>
                  <p className="text-sm text-text-muted">While being dragged.</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Truncate as="p" className="text-sm font-semibold">
                    Oakfield Homes – Meadow View development, Plot 14, Swindon – deliveries via
                    north gate only
                  </Truncate>
                  <p className="text-sm text-text-muted">
                    Long names truncate with full text on hover or tap.
                  </p>
                </CardContent>
              </Card>
            </Grid>
          </Section>

          {/* ---------------- Table ---------------- */}
          <Section
            id="table"
            title="Table"
            description="Sortable, sticky header, column chooser. Row height follows density."
          >
            <State label="Data, sortable, selectable, column chooser">
              <DataTable
                label="Orders"
                columns={ORDER_COLUMNS}
                rows={ORDERS}
                getRowId={(r) => r.id}
                initialSort={{ columnId: "required", direction: "asc" }}
                onRowClick={(r) => setSelectedRow(r.id)}
                selectedRowId={selectedRow}
                columnChooser
                toolbar={
                  <Input
                    leadingIcon={<Search />}
                    placeholder="Search orders"
                    aria-label="Search orders"
                    className="md:w-popover"
                  />
                }
                scrollClassName="max-h-panel"
              />
            </State>
            <Grid cols={2}>
              <State label="Loading">
                <DataTable
                  label="Loading orders"
                  columns={ORDER_COLUMNS.slice(0, 4)}
                  rows={[]}
                  getRowId={(r) => r.id}
                  loading
                />
              </State>
              <State label="Empty">
                <DataTable
                  label="No orders"
                  columns={ORDER_COLUMNS.slice(0, 4)}
                  rows={[]}
                  getRowId={(r) => r.id}
                  empty={
                    <EmptyState
                      compact
                      icon={Inbox}
                      title="No orders match"
                      description="Try a different search or clear the filters."
                      action={<Button size="sm">Clear filters</Button>}
                    />
                  }
                />
              </State>
            </Grid>
          </Section>

          {/* ---------------- Side panel ---------------- */}
          <Section
            id="side-panel"
            title="Side panel"
            description="Opens over the current screen; full screen on phones."
          >
            <div>
              <SidePanel
                open={panelOpen}
                onOpenChange={setPanelOpen}
                trigger={<Button>Open load panel</Button>}
                title="Load 3 · 18t curtainsider"
                subtitle="Thu 01/10/2026 · Dave Hughes · 5 drops"
                headerAside={<Badge tone="info">Planned</Badge>}
                footer={
                  <>
                    <Button variant="secondary" onClick={() => setPanelOpen(false)}>
                      Close
                    </Button>
                    <Button variant="primary">Mark confirmed</Button>
                  </>
                }
              >
                <PanelSection title="Capacity">
                  <CapacityBar label="Space" used={14} capacity={16} unit="pallet spaces" />
                  <CapacityBar label="Weight" used={8800} capacity={9500} format={formatKg} />
                </PanelSection>
                <PanelSection title="Warnings">
                  <WarningItem
                    warning={{
                      severity: "blocking",
                      title: "Doors must travel upright",
                      detail:
                        "ORD-10421 (6 door packs) must stay upright, the Luton can only unload by tail lift, and Marlow Joinery has no forklift.",
                      fixes: [{ id: "switch", label: "Switch to curtainsider" }],
                    }}
                    onOverride={() => {}}
                  />
                </PanelSection>
                <PanelSection
                  title="Stops"
                  action={
                    <Button size="sm" variant="ghost">
                      Reorder
                    </Button>
                  }
                >
                  <SkeletonText lines={4} />
                </PanelSection>
              </SidePanel>
            </div>
          </Section>

          {/* ---------------- Modal ---------------- */}
          <Section id="modal" title="Modal">
            <div className="flex flex-wrap gap-2">
              <Modal
                trigger={<Button>Open modal</Button>}
                title="Cancel order ORD-10424?"
                description="It will be removed from the plan. This is recorded in the order's history."
                footer={
                  <>
                    <Button variant="secondary">Keep order</Button>
                    <Button variant="danger">Cancel order</Button>
                  </>
                }
              />
              <Modal
                trigger={<Button variant="secondary">Modal with form</Button>}
                title="Record delivery confirmation"
                footer={<Button variant="primary">Save</Button>}
              >
                <div className="flex flex-col gap-4">
                  <Field label="Confirmed by">
                    <Input placeholder="Name" />
                  </Field>
                  <Field label="Method">
                    <Select
                      options={[
                        { value: "email", label: "Email" },
                        { value: "phone", label: "Phone" },
                        { value: "portal", label: "Portal" },
                      ]}
                      placeholder="How was it confirmed?"
                    />
                  </Field>
                  <Field label="Note">
                    <Textarea />
                  </Field>
                </div>
              </Modal>
            </div>
          </Section>

          {/* ---------------- Tabs ---------------- */}
          <Section id="tabs" title="Tabs">
            <Tabs defaultValue="sites">
              <TabsList aria-label="Customer">
                <TabsTrigger value="sites" count={3}>
                  Sites
                </TabsTrigger>
                <TabsTrigger value="contacts" count={5}>
                  Contacts
                </TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="notes" disabled>
                  Notes
                </TabsTrigger>
              </TabsList>
              <TabsContent value="sites">
                <p className="text-sm text-text-muted">Three delivery sites.</p>
              </TabsContent>
              <TabsContent value="contacts">
                <p className="text-sm text-text-muted">Five contacts.</p>
              </TabsContent>
              <TabsContent value="orders">
                <p className="text-sm text-text-muted">Order history.</p>
              </TabsContent>
              <TabsContent value="assets">
                <p className="text-sm text-text-muted">Returnable assets on site.</p>
              </TabsContent>
            </Tabs>
          </Section>

          {/* ---------------- Toast ---------------- */}
          <Section id="toast" title="Toast" description="Errors stay until dismissed.">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  toast.success("Load confirmed", {
                    description: "Load 3 is ready for the warehouse.",
                  })
                }
              >
                Success
              </Button>
              <Button
                onClick={() =>
                  toast.info("Road distances are estimates", {
                    description: "Routing is unavailable; using straight-line distance × 1.3.",
                  })
                }
              >
                Info
              </Button>
              <Button
                onClick={() =>
                  toast.warning("Booking needed within 24 hours", {
                    action: { label: "Add booking", onClick: () => {} },
                  })
                }
              >
                Warning
              </Button>
              <Button
                onClick={() =>
                  toast.error("Couldn't save the load", {
                    description: "Your changes are kept. Check your connection and try again.",
                    action: { label: "Retry", onClick: () => {} },
                  })
                }
              >
                Error
              </Button>
            </div>
          </Section>

          {/* ---------------- Empty state ---------------- */}
          <Section
            id="empty-state"
            title="Empty state"
            description="Every empty screen offers a next action; errors offer a retry."
          >
            <Grid cols={2}>
              <Card>
                <EmptyState
                  icon={Truck}
                  title="No vehicles yet"
                  description="Add your own vans and lorries so the app can check capacity and access."
                  action={
                    <Button variant="primary">
                      <Plus aria-hidden />
                      Add vehicle
                    </Button>
                  }
                  secondaryAction={
                    <Button>
                      <Download aria-hidden />
                      Import CSV
                    </Button>
                  }
                />
              </Card>
              <div className="flex flex-col gap-6">
                <Card>
                  <EmptyState
                    compact
                    icon={Inbox}
                    title="No unplanned orders"
                    description="Everything is on a load."
                  />
                </Card>
                <Card>
                  <ErrorState compact onRetry={() => toast.info("Retrying…")} />
                </Card>
              </div>
            </Grid>
          </Section>

          {/* ---------------- Skeleton ---------------- */}
          <Section id="skeleton" title="Skeleton loader" description="Skeletons, not spinners.">
            <Grid>
              <State label="Text">
                <SkeletonText lines={4} />
              </State>
              <State label="Card">
                <SkeletonCard />
              </State>
              <State label="Shapes">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-avatar rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              </State>
            </Grid>
            <State label="Table">
              <SkeletonTable rows={3} />
            </State>
          </Section>

          {/* ---------------- Capacity bar ---------------- */}
          <Section
            id="capacity-bar"
            title="Capacity bar"
            description="Amber near the limit (90% by default), red over it, including while dragging."
          >
            <Grid>
              <State label="Comfortable">
                <CapacityBar label="Space" used={8} capacity={16} unit="pallet spaces" />
              </State>
              <State label="Near limit">
                <CapacityBar label="Weight" used={8700} capacity={9500} format={formatKg} />
              </State>
              <State label="Over capacity">
                <CapacityBar label="Space" used={18} capacity={16} unit="pallet spaces" />
              </State>
              <State label="Dragging (pending, still fits)">
                <CapacityBar
                  label="Space"
                  used={8}
                  capacity={16}
                  pending={4}
                  unit="pallet spaces"
                />
              </State>
              <State label="Dragging (pending, would overflow)">
                <CapacityBar
                  label="Weight"
                  used={8000}
                  capacity={9500}
                  pending={2000}
                  format={formatKg}
                />
              </State>
              <State label="Small, empty">
                <CapacityBar size="sm" label="Space" used={0} capacity={12} unit="spaces" />
              </State>
            </Grid>
          </Section>

          {/* ---------------- Warning item ---------------- */}
          <Section
            id="warning-item"
            title="Warning item"
            description="Says what is wrong, names the items, and offers fixes."
          >
            <div className="flex flex-col gap-3">
              <WarningItem
                warning={{
                  code: "UPRIGHT_TAIL_LIFT",
                  severity: "blocking",
                  title: "Doors must travel upright",
                  detail:
                    "ORD-10421 (6 door packs) must stay upright. The Luton's only unloading method is a tail lift, and Marlow Joinery has no forklift and doesn't allow handballing.",
                  fixes: [
                    { id: "switch-vehicle", label: "Switch to 7.5t curtainsider" },
                    { id: "use-haulier", label: "Send with a haulier" },
                  ],
                }}
                onFix={(f) => toast.info(`Fix chosen: ${f.label}`)}
                onOverride={(reason) => setOverridden({ by: "Demo Planner", reason })}
                overridden={overridden}
              />
              {!dismissed ? (
                <WarningItem
                  warning={{
                    code: "UPRIGHT_HANDBALL",
                    severity: "check",
                    title: "Two people needed to handball",
                    detail:
                      "Hillside Builders allows handballing. 6 door packs need 2 people; 1 is assigned.",
                    fixes: [{ id: "add-crew", label: "Assign second crew member" }],
                  }}
                  onDismiss={() => setDismissed(true)}
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setDismissed(false)}
                >
                  Show dismissed check
                </Button>
              )}
              <WarningItem
                warning={{
                  code: "SITE_INFO_STALE",
                  severity: "info",
                  title: "Site details may be out of date",
                  detail:
                    "Severn Timber Merchants – Chepstow depot was last verified on 12/02/2026, over 180 days ago.",
                  fixes: [{ id: "verify", label: "Review site" }],
                }}
                onDismiss={() => {}}
              />
              <WarningItem
                warning={{
                  severity: "blocking",
                  title: "Load weight exceeds payload",
                  detail: "Load 2 weighs 7,820 kg; the 7.5t curtainsider's payload is 2,600 kg.",
                  fixes: [],
                }}
                overridden={{
                  by: "Sam Patel",
                  reason: "Weights on ORD-10424 are wrong; checked with production.",
                }}
              />
              <State label="Warnings badge (load cards)">
                <div className="flex flex-wrap items-center gap-4">
                  <WarningsBadge counts={{ blocking: 2, check: 1 }} />
                  <WarningsBadge counts={{ check: 3, info: 1 }} />
                  <WarningsBadge counts={{}} />
                </div>
              </State>
            </div>
          </Section>

          {/* ---------------- Map panel ---------------- */}
          <Section
            id="map-panel"
            title="Map panel"
            description="Pins by load colour with route lines. Select a pin or a chip to highlight it."
          >
            <div className="flex flex-wrap gap-2">
              {PINS.map((p) => (
                <Chip
                  key={p.id}
                  selected={selectedPin === p.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setSelectedPin(p.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedPin(p.id)}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
            <MapPanel
              title="Thursday's loads"
              pins={PINS}
              routes={ROUTES}
              selectedId={selectedPin}
              onSelect={setSelectedPin}
              legend={
                <MapLegend
                  items={[
                    { colour: loadColour(0), label: "Load 1 · Luton" },
                    { colour: loadColour(1), label: "Load 2 · 18t" },
                    { colour: loadColour(2), label: "Load 3 · Haulier" },
                    { colour: "neutral", label: "Depot" },
                  ]}
                />
              }
              className="h-panel"
            />
            <State label="Empty">
              <MapPanel title="No pins" pins={[]} className="h-panel" />
            </State>
          </Section>

          {/* ---------------- Avatar ---------------- */}
          <Section id="avatar" title="Avatar">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name="Sam Patel" size="sm" />
              <Avatar name="Dave Hughes" />
              <Avatar name="Rhiannon Price-Llewellyn" size="lg" />
              <Avatar name="Warehouse" />
              <Avatar name="Broken Image" src="/does-not-exist.png" />
            </div>
          </Section>

          {/* ---------------- Tooltip ---------------- */}
          <Section
            id="tooltip"
            title="Tooltip"
            description="On hover and keyboard focus. Truncated text reveals its full value on hover, focus or tap."
          >
            <div className="flex flex-wrap items-center gap-4">
              <Tooltip content="Add the selected orders to this load">
                <Button>
                  Add to load
                  <ArrowRight aria-hidden />
                </Button>
              </Tooltip>
              <Tooltip content="Delete load" side="bottom">
                <Button variant="ghost" iconOnly aria-label="Delete load">
                  <Trash2 aria-hidden />
                </Button>
              </Tooltip>
              <div className="w-menu rounded-md border border-border p-2 text-sm">
                <Truncate>Severn Timber Merchants – Chepstow depot (rear entrance)</Truncate>
              </div>
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
