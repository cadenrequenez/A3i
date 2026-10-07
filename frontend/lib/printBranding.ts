// Verified against the hospital calendars supplied by Daniel's office.
export const isDriscoll = (facility: string) => /driscoll/i.test(facility);
export const rioCallContacts = (facility: string) =>
  facility === "Rio Grande Regional Hospital"
    ? { first: "(956) 468-5019", second: "(956) 468-5018" }
    : null;

// Match Driscoll's posted MD names while retaining full names in the workspace.
// Unknown names stay exactly as entered; do not guess their surname.
export function postedMdName(name: string) {
  const names: Record<string, string> = {
    "manny cavazos": "CAVAZOS",
    "daniel ruiz": "RUIZ",
    "camille graham": "GRAHAM",
    "david mann": "MANN",
    "daniel requenez": "D. REQUENEZ",
    "edward requenez": "E. REQUENEZ",
    "ricky salinas": "SALINAS",
    "mike gorena": "GORENA",
    "maria lozano": "LOZANO",
    "erika schwegler": "SCHWEGLER",
    euleche: "EULECHE",
    alanmanou: "ALANMANOU",
  };
  return names[name.trim().toLowerCase()] || name;
}
