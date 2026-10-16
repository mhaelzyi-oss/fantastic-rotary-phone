import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PREFS, type MediaItem } from "../../shared/types";
import { useFinderStore } from "../state/finderStore";
import { CommandPanel } from "./CommandPanel";

const mp4: MediaItem = {
  url: "https://cdn.example.com/a.mp4",
  kind: "progressive",
  originHost: "cdn.example.com",
  title: "Demo clip",
  pageUrl: "https://example.com/watch?v=1",
  source: "dom",
  encrypted: false,
  variants: [{ url: "https://cdn.example.com/a.mp4", label: "720p", height: 720, encrypted: false, kind: "progressive" }],
  subtitles: [],
};

const hls: MediaItem = {
  ...mp4,
  url: "https://cdn.example.com/live/master.m3u8",
  kind: "hls",
  variants: [{ url: "https://cdn.example.com/live/master.m3u8", label: "1080p", height: 1080, encrypted: false, kind: "hls" }],
};

const drm: MediaItem = {
  ...hls,
  url: "https://cdn.example.com/drm/master.m3u8",
  encrypted: true,
  variants: [{ url: "https://cdn.example.com/drm/master.m3u8", label: "1080p", height: 1080, encrypted: true, kind: "hls" }],
};

function load(sources: MediaItem[], prefs: Partial<typeof DEFAULT_PREFS> = {}) {
  useFinderStore.setState({
    prefs: { ...DEFAULT_PREFS, cliShell: "bash", cliTool: "yt-dlp", ...prefs },
    scan: { pageUrl: mp4.pageUrl, pageTitle: "t", sources },
    selected: [],
    openIndex: 0,
    variantUrl: {},
  });
}

describe("CommandPanel", () => {
  beforeEach(() => load([mp4, hls, drm]));

  it("shows a quoted yt-dlp command for a progressive file", () => {
    render(<CommandPanel index={0} />);
    const code = screen.getByTestId("command-output");
    expect(code).toHaveTextContent("yt-dlp");
    expect(code).toHaveTextContent("https://cdn.example.com/a.mp4");
    expect(code).toHaveTextContent("--referer");
  });

  it("only offers tools that handle the stream kind", () => {
    render(<CommandPanel index={0} />);
    const tools = within(screen.getByRole("tablist", { name: "Tool" }));
    expect(tools.getByRole("tab", { name: "curl" })).toBeEnabled();
    expect(tools.getByRole("tab", { name: "streamlink" })).toBeDisabled();
    expect(tools.getByRole("tab", { name: "N_m3u8DL-RE" })).toBeDisabled();
  });

  it("falls back to a suitable tool when the saved one does not handle the kind", () => {
    load([mp4, hls, drm], { cliTool: "curl" });
    render(<CommandPanel index={1} />);
    expect(screen.getByTestId("command-output")).toHaveTextContent(/^yt-dlp/);
  });

  it("switches tool and shell", async () => {
    const user = userEvent.setup();
    render(<CommandPanel index={0} />);
    await user.click(within(screen.getByRole("tablist", { name: "Tool" })).getByRole("tab", { name: "aria2" }));
    expect(screen.getByTestId("command-output")).toHaveTextContent(/^aria2c -x 16/);
    await user.click(within(screen.getByRole("tablist", { name: "Shell" })).getByRole("tab", { name: "PowerShell" }));
    expect(useFinderStore.getState().prefs.cliShell).toBe("powershell");
    await user.click(within(screen.getByRole("tablist", { name: "Tool" })).getByRole("tab", { name: "curl" }));
    expect(screen.getByTestId("command-output")).toHaveTextContent(/^curl\.exe /);
  });

  it("copies the command", async () => {
    const user = userEvent.setup();
    render(<CommandPanel index={0} />);
    await user.click(screen.getByRole("button", { name: "Copy command" }));
    await expect(navigator.clipboard.readText()).resolves.toMatch(/^yt-dlp /);
  });

  it("copies a runnable script, and a .bat for cmd.exe", async () => {
    const user = userEvent.setup();
    render(<CommandPanel index={0} />);
    await user.click(screen.getByRole("button", { name: "Copy as script" }));
    await expect(navigator.clipboard.readText()).resolves.toMatch(/^#!\/usr\/bin\/env bash/);
    await user.click(within(screen.getByRole("tablist", { name: "Shell" })).getByRole("tab", { name: "cmd.exe" }));
    await user.click(screen.getByRole("button", { name: "Copy .bat" }));
    await expect(navigator.clipboard.readText()).resolves.toMatch(/^@echo off\r\n/);
  });

  it("never produces a command for DRM-protected streams", () => {
    render(<CommandPanel index={2} />);
    expect(screen.queryByTestId("command-output")).not.toBeInTheDocument();
    expect(screen.getByTestId("command-refused")).toHaveTextContent(/DRM|protected|encrypted/i);
    expect(screen.queryByRole("button", { name: /Copy/ })).not.toBeInTheDocument();
  });

  it("omits Referer when the toggle is off", async () => {
    const user = userEvent.setup();
    render(<CommandPanel index={0} />);
    await user.click(screen.getByLabelText("Referer"));
    expect(screen.getByTestId("command-output")).not.toHaveTextContent("--referer");
  });

  it("offers yt-dlp page mode with the quality cap and subtitles, and only for yt-dlp", async () => {
    const user = userEvent.setup();
    load([mp4, hls, drm], { maxHeight: "720", includeSubtitles: true });
    render(<CommandPanel index={1} />);
    await user.click(screen.getByLabelText("Use page URL"));
    const out = screen.getByTestId("command-output");
    expect(out).toHaveTextContent("https://example.com/watch?v=1");
    expect(out).not.toHaveTextContent("master.m3u8");
    expect(out).toHaveTextContent("bv*[height<=720]+ba/b[height<=720]/b");
    expect(out).toHaveTextContent("--write-subs");
    await user.click(within(screen.getByRole("tablist", { name: "Tool" })).getByRole("tab", { name: "ffmpeg" }));
    expect(screen.queryByLabelText("Use page URL")).not.toBeInTheDocument();
    expect(screen.getByTestId("command-output")).toHaveTextContent("master.m3u8");
  });

  it("keeps refusing encrypted streams in yt-dlp page mode", () => {
    load([mp4, hls, drm], { cliYtdlpPage: true });
    render(<CommandPanel index={2} />);
    expect(screen.queryByTestId("command-output")).not.toBeInTheDocument();
    expect(screen.getByTestId("command-refused")).toBeInTheDocument();
  });

  it("explains the cmd.exe percent limit instead of emitting an unsafe line", () => {
    const pct: MediaItem = {
      ...mp4,
      url: "https://cdn.example.com/a%20b.mp4",
      variants: [{ ...mp4.variants[0]!, url: "https://cdn.example.com/a%20b.mp4" }],
    };
    load([pct], { cliShell: "cmd", cliTool: "curl" });
    render(<CommandPanel index={0} />);
    expect(screen.getByTestId("command-refused")).toHaveTextContent(/\.bat/);
    expect(screen.getByRole("button", { name: "Copy .bat" })).toBeEnabled();
  });
});
