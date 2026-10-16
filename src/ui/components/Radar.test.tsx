import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "../../shared/types";
import { Radar } from "./Radar";

function item(n: number, over: Partial<MediaItem> = {}): MediaItem {
  const url = `https://cdn.example.com/v${n}.mp4`;
  return {
    url,
    kind: "progressive",
    originHost: "cdn.example.com",
    title: `Clip ${n}`,
    pageUrl: "https://example.com",
    source: "dom",
    encrypted: false,
    variants: [{ url, label: "720p", height: 720, encrypted: false, kind: "progressive" }],
    subtitles: [],
    ...over,
  };
}

describe("Radar", () => {
  it("shows a scanning state with no blips when nothing is found", () => {
    render(<Radar sources={[]} selectedIndex={null} onPick={() => {}} />);
    expect(screen.getByTestId("radar")).toHaveAttribute("data-state", "scanning");
    expect(screen.queryAllByTestId("radar-blip")).toHaveLength(0);
    expect(screen.getByRole("group", { name: "Scanning" })).toBeInTheDocument();
  });

  it("plots one blip per stream and reports the count", () => {
    render(<Radar sources={[item(1), item(2), item(3)]} selectedIndex={null} onPick={() => {}} />);
    expect(screen.getByTestId("radar")).toHaveAttribute("data-state", "found");
    expect(screen.getAllByTestId("radar-blip")).toHaveLength(3);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "3 streams" })).toBeInTheDocument();
  });

  it("marks DRM streams as locked and says so to assistive tech", () => {
    render(<Radar sources={[item(1), item(2, { encrypted: true })]} selectedIndex={null} onPick={() => {}} />);
    const blips = screen.getAllByTestId("radar-blip");
    expect(blips.filter((b) => b.getAttribute("data-locked") === "true")).toHaveLength(1);
  });

  it("selects a stream when its blip is clicked", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Radar sources={[item(1), item(2)]} selectedIndex={1} onPick={onPick} />);
    const blips = screen.getAllByTestId("radar-blip");
    expect(blips[1]).toHaveAttribute("data-selected", "true");
    await user.click(blips[0]!);
    expect(onPick).toHaveBeenCalledWith(0);
  });

  it("keeps blips in the same place across renders", () => {
    const sources = [item(1), item(2), item(3)];
    const { rerender } = render(<Radar sources={sources} selectedIndex={null} onPick={() => {}} />);
    const first = screen.getAllByTestId("radar-blip").map((b) => b.getAttribute("style"));
    rerender(<Radar sources={sources} selectedIndex={2} onPick={() => {}} />);
    const second = screen.getAllByTestId("radar-blip").map((b) => b.getAttribute("style"));
    expect(second).toEqual(first);
  });
});
