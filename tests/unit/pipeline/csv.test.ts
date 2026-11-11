import { describe, expect, it } from "vitest";
import { parseCsv } from "../../../tools/sync-data/csv";

describe("parseCsv", () => {
  it("keeps the header row and returns all rows", () => {
    const rows = parseCsv("Difficulty,Title\nEASY,Two Sum\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["Difficulty", "Title"]);
  });

  it("parses quoted fields containing commas", () => {
    const rows = parseCsv('Difficulty,Title\nEASY,"Two, Sum"\n');
    expect(rows[1][1]).toBe("Two, Sum");

    const quoted = parseCsv('Difficulty,Title,Topics\nMEDIUM,X,"Array, Hash Table"');
    expect(quoted[1][2]).toBe("Array, Hash Table");
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    const rows = parseCsv('Title\n"He said ""hi"""\n');
    expect(rows[1][0]).toBe('He said "hi"');
  });

  it("handles CRLF and a BOM", () => {
    const rows = parseCsv("\uFEFFA,B\r\n1,2\r\n");
    expect(rows[0][0]).toBe("A");
    expect(rows[1][1]).toBe("2");
  });

  it("trims surrounding whitespace from values", () => {
    const rows = parseCsv("A,B\n 1 , 2 \n");
    expect(rows[1]).toEqual(["1", "2"]);
  });

  it("passes short rows through as short arrays", () => {
    const rows = parseCsv("A,B,C\n1,2\n");
    expect(rows[1]).toHaveLength(2);
  });

  it("skips empty lines", () => {
    const rows = parseCsv("A,B\n\n1,2\n\n");
    expect(rows).toHaveLength(2);
  });
});
