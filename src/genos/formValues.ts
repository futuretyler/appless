/**
 * Form-state trust boundary. react-lang snapshots the ENTIRE screen state
 * into every action event that doesn't name a form (any chip/list-row tap),
 * which would leak unrelated fields - including password inputs - into the
 * model prompt. extractFormValues is the single gate between renderer
 * action events and generation. Zero imports on purpose: both the UI layer
 * and the shell depend on it.
 */

/**
 * componentType recorded in react-lang form state for password inputs, so
 * their values can be stripped before anything reaches the model.
 */
export const PASSWORD_COMPONENT_TYPE = "Input:password";

/**
 * Reduce a react-lang ActionEvent's formState to the named form's plain
 * values: no formName → no values; named form → that form's slice only,
 * unwrapped to plain `field: value` pairs, with password fields dropped
 * even on real submits (they are marked via PASSWORD_COMPONENT_TYPE).
 */
export function extractFormValues(
  formName: string | undefined,
  formState: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!formName || !formState) return undefined;
  const form = formState[formName];
  if (!form || typeof form !== "object") return undefined;
  const values: Record<string, unknown> = {};
  for (const [field, entry] of Object.entries(form as Record<string, unknown>)) {
    if (entry && typeof entry === "object" && "value" in entry) {
      const { value, componentType } = entry as { value: unknown; componentType?: string };
      if (componentType === PASSWORD_COMPONENT_TYPE) continue;
      if (value !== undefined) values[field] = value;
    } else if (entry !== undefined) {
      values[field] = entry;
    }
  }
  return Object.keys(values).length > 0 ? values : undefined;
}
