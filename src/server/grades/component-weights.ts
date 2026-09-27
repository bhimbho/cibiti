/**
 * Weight rules for a course's assessment components. A module of its own, with no
 * server imports, because the editor in the browser validates with exactly these
 * rules — importing them from the query layer dragged the server's cookie handling
 * into the client bundle.
 */

/** Weights must add to exactly 100: anything else silently rescales every mark. */
export function weightProblems(components: { name: string; weightPct: number }[]): string[] {
  if (components.length === 0) return [];
  const problems: string[] = [];
  const total = components.reduce((sum, c) => sum + c.weightPct, 0);
  if (total !== 100) problems.push(`Weights add up to ${total}%, not 100%.`);
  const names = new Set<string>();
  for (const component of components) {
    const key = component.name.trim().toLowerCase();
    if (names.has(key)) problems.push(`More than one component is called ${component.name}.`);
    names.add(key);
  }
  return problems;
}
