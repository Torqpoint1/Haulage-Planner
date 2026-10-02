/** What every settings server action returns to its form. */
export type FormState = {
  ok?: boolean;
  /** Form-level message, e.g. a permission problem. */
  error?: string;
  /** Messages keyed by field name. */
  errors?: Record<string, string>;
  /** Id of the saved row. */
  id?: string;
};

export type DeleteResult = { ok: true } | { ok: false; error: string };
