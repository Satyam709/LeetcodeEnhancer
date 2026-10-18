import { parse } from "csv-parse/sync";

/**
 * Parse a company-wise CSV file into rows, header row included.
 *
 * - BOM is stripped; values are trimmed.
 * - Malformed (short) rows pass through as short arrays — the transform
 *   stage validates them and rejects with a reason.
 */
export function parseCsv(text: string): string[][] {
  return parse(text, {
    bom: true,
    trim: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
}
