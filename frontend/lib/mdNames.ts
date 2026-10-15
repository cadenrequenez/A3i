// Display preferences never change clinician IDs, qualifications or saved names.
const normalized = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
export function mdSchedulingName(name: string) {
  const names: Record<string, string> = {
    "daniel requenez": "DRQZ", "dan requenez": "DRQZ", drqz: "DRQZ",
    "edward requenez": "ERQZ", "ed requenez": "ERQZ", erqz: "ERQZ",
    "mike gorena": "Michael Gorena", "michael gorena": "Michael Gorena",
  };
  return names[normalized(name)] || name;
}
const preferredOrder = ["Ricky Salinas", "DRQZ", "ERQZ", "Erika Schwegler", "Michael Gorena", "Maria Lozano", "Jaime Garcia", "Clarissa Gutierrez", "Tim Castro", "Manny Cavazos", "Daniel Ruiz"].map(normalized);
export function compareMdNames(a: string, b: string) {
  const first = mdSchedulingName(a), second = mdSchedulingName(b);
  const rank = (name: string) => { const index = preferredOrder.indexOf(normalized(name)); return index < 0 ? preferredOrder.length : index; };
  return rank(first) - rank(second) || first.localeCompare(second);
}
export const staffSchedulingName = (name: string, kind: "md" | "crna") => kind === "md" ? mdSchedulingName(name) : name;

// Shared clinicians may have legacy site keys. Show one Off choice per name,
// retaining the selected key so reopening an earlier day remains safe.
export function mdChoices<T extends { key: string; name: string }>(members: T[], selectedKey: string | null) {
  const byName = new Map<string, T>();
  for (const member of members) {
    const key = normalized(mdSchedulingName(member.name));
    if (!byName.has(key) || member.key === selectedKey) byName.set(key, member);
  }
  return [...byName.values()].sort((a,b)=>compareMdNames(a.name,b.name));
}
