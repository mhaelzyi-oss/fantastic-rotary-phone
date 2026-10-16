import { describe, expect, it } from "vitest";
import { hostAllowed, hostFromUrl, hostMatches } from "./hosts";

describe("hostAllowed", () => {
  it("blocks matching hosts even when allow is empty", () => {
    expect(hostAllowed("https://mail.google.com/mail", [], ["google.com"])).toBe(false);
  });

  it("requires allow list when it is non-empty", () => {
    expect(hostAllowed("https://vimeo.com/x", ["vimeo.com"], [])).toBe(true);
    expect(hostAllowed("https://example.com/x", ["vimeo.com"], [])).toBe(false);
  });

  it("allows everyone when both lists are empty", () => {
    expect(hostAllowed("https://example.com/watch", [], [])).toBe(true);
  });
});

describe("host helpers", () => {
  it("reads hostname and matches subdomains", () => {
    expect(hostFromUrl("https://www.Vimeo.com/x")).toBe("vimeo.com");
    expect(hostMatches("player.vimeo.com", "vimeo.com")).toBe(true);
  });
});
