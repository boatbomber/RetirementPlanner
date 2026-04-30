import { describe, it, expect } from "vitest";
import { toCsv } from "../csv";

describe("toCsv", () => {
  it("generates header and data rows", () => {
    const csv = toCsv(
      ["Name", "Value"],
      [
        ["Alpha", 100],
        ["Beta", 200],
      ],
    );
    expect(csv).toBe("Name,Value\nAlpha,100\nBeta,200");
  });

  it("escapes fields containing commas", () => {
    const csv = toCsv(["Label"], [["hello, world"]]);
    expect(csv).toBe('Label\n"hello, world"');
  });

  it("escapes fields containing double quotes", () => {
    const csv = toCsv(["Label"], [['say "hi"']]);
    expect(csv).toBe('Label\n"say ""hi"""');
  });

  it("escapes fields containing newlines", () => {
    const csv = toCsv(["Label"], [["line1\nline2"]]);
    expect(csv).toBe('Label\n"line1\nline2"');
  });

  it("handles empty rows", () => {
    const csv = toCsv(["A", "B"], []);
    expect(csv).toBe("A,B");
  });

  it("handles numeric values", () => {
    const csv = toCsv(["X"], [[42]]);
    expect(csv).toBe("X\n42");
  });

  it("defuses leading = + - @ to prevent CSV formula injection", () => {
    const csv = toCsv(["Name"], [['=HYPERLINK("http://evil", "x")'], ["+SUM(A1)"], ["-cmd"], ["@dangerous"]]);
    // Each row is wrapped in quotes (because of the comma in HYPERLINK or as
    // safe-quoted output) and prefixed with ' to defuse formula evaluation.
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'-cmd");
    expect(csv).toContain("'@dangerous");
  });

  it("scenario name with formula trigger is also defused", () => {
    const csv = toCsv(["X"], [["v"]], { scenarioName: "=DANGER", exportedAt: "2026-01-01" });
    expect(csv).toContain("# Scenario: '=DANGER");
  });
});
