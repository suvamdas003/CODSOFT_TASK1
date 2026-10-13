/**
 * Build RFC 4180 CSV. Text cells that a spreadsheet would interpret as a formula
 * (starting with = + - @ tab or CR) are prefixed with an apostrophe to prevent
 * CSV/formula injection when exported data is opened in Excel or Sheets.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
