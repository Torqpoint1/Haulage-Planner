/**
 * Shared shape of a rules-engine warning (spec 7.1). The checks themselves
 * arrive in Stage 5; the UI is built against this contract from Stage 0.
 */

export type Severity = "blocking" | "check" | "info";

export type WarningEntity = {
  type: "load" | "stop" | "order";
  id: string;
};

export type WarningFix = {
  /** Stable id for the action handler, e.g. "switch-vehicle". */
  id: string;
  /** Button text, e.g. "Switch to curtainsider". */
  label: string;
  /** Optional payload for the handler, e.g. the vehicle to switch to. */
  params?: Record<string, string | number | boolean>;
};

export type Warning = {
  code: string;
  severity: Severity;
  title: string;
  /** Plain English, naming the actual items. */
  detail: string;
  entity: WarningEntity;
  fixes: WarningFix[];
};

export const SEVERITY_ORDER: Record<Severity, number> = { blocking: 0, check: 1, info: 2 };

export const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: "Blocking",
  check: "Check",
  info: "Info",
};
