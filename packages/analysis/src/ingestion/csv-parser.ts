/**
 * Small, dependency-free CSV parser (RFC 4180-ish): handles quoted fields,
 * embedded commas/newlines inside quotes, and escaped quotes (`""`).
 * Good enough for structured transaction exports — not a general-purpose
 * CSV library.
 */
function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // swallow; \r\n line endings are handled by the following \n
    } else {
      field += char;
    }
  }

  // Final row, if the file didn't end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface ParsedCsvRecord {
  readonly row: number;
  readonly raw: Record<string, string>;
}

/**
 * Parses CSV content into an ordered list of candidate records (flat
 * shape only — CSV has no way to represent a nested `attempts` array).
 * The first row is always treated as the header.
 */
export function parseCsvRecords(content: string): readonly ParsedCsvRecord[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return [];

  const header = rows[0];
  if (!header) return [];

  return rows.slice(1).map((cells, index) => {
    const raw: Record<string, string> = {};
    header.forEach((column, columnIndex) => {
      const value = cells[columnIndex];
      if (value !== undefined && value !== "") raw[column] = value;
    });
    return { row: index + 2, raw }; // +2: 1-based, plus the header row itself
  });
}
