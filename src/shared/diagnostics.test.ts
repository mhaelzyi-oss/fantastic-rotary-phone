import { describe, expect, it } from "vitest";
import { addDiagnostic, exportDiagnostics, MAX_DIAGNOSTICS, redact } from "./diagnostics";

describe("diagnostics", () => {
  it("strips URLs and token-like strings", () => {
    const out = redact("failed https://cdn.example.com/a.mp4?token=abcdef0123456789abcdef0123456789 and key abcdef0123456789abcdef0123456789xyz");
    expect(out).not.toMatch(/https?:/);
    expect(out).not.toMatch(/abcdef0123456789abcdef0123456789/);
    expect(out).toContain("[URL]");
    expect(out).toContain("[TOKEN]");
  });

  it("keeps only the newest entries", () => {
    let list: ReturnType<typeof addDiagnostic> = [];
    for (let i = 0; i < MAX_DIAGNOSTICS + 25; i += 1) list = addDiagnostic(list, { code: `C${i}`, message: "m" }, i, `id${i}`);
    expect(list).toHaveLength(MAX_DIAGNOSTICS);
    expect(list[0]?.code).toBe("C25");
    expect(list.at(-1)?.code).toBe(`C${MAX_DIAGNOSTICS + 24}`);
  });

  it("exports readable text without URLs", () => {
    const list = addDiagnostic([], { severity: "error", code: "NETWORK_FAILED", message: "https://x.test/a.mp4 failed", host: "x.test" }, 0, "a");
    const text = exportDiagnostics(list);
    expect(text).toContain("ERROR NETWORK_FAILED (x.test)");
    expect(text).not.toMatch(/https?:/);
    expect(exportDiagnostics([])).toBe("No diagnostics recorded.");
  });
});
