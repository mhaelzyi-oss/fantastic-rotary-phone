import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "./types";
import { migrateStore, SCHEMA_VERSION } from "./schema";

const keys = { prefs: "p", history: "h", queue: "q", library: "l", schema: "s" };

describe("migrateStore", () => {
  it("initialises an empty store", () => {
    expect(migrateStore({}, keys)).toEqual({ l: [], s: SCHEMA_VERSION });
  });

  it("fills prefs keys added in later versions", () => {
    const { requireAuthority: _a, qualityMode: _b, ...old } = DEFAULT_PREFS;
    const patch = migrateStore({ p: old, l: [], s: 1 }, keys) as { p: typeof DEFAULT_PREFS };
    expect(patch.p.requireAuthority).toBe(false);
    expect(patch.p.qualityMode).toBe("balanced");
  });

  it("repairs corrupt history and queue entries", () => {
    const patch = migrateStore(
      { h: [null, { url: "https://a/x.mp4" }, 5], q: "garbage", l: [], s: SCHEMA_VERSION, p: DEFAULT_PREFS },
      keys,
    );
    expect(patch.h).toEqual([{ url: "https://a/x.mp4" }]);
    expect(patch.q).toEqual([]);
  });

  it("drops queue entries without an id or url", () => {
    const patch = migrateStore({ q: [{ id: "1", url: "https://a/x.mp4" }, { id: 2 }, null], l: [], s: SCHEMA_VERSION }, keys);
    expect(patch.q).toEqual([{ id: "1", url: "https://a/x.mp4" }]);
  });

  it("does nothing on a current store", () => {
    expect(migrateStore({ p: DEFAULT_PREFS, h: [], q: [], l: [], s: SCHEMA_VERSION }, keys)).toEqual({});
  });
});
