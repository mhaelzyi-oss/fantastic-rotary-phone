import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("UI network boundary", () => {
  it("does not import hls.js or call fetch from UI modules", () => {
    const files = walk("src/ui").filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(".test."));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/hls\.js/);
      expect(text, file).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
