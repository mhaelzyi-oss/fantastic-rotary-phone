import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "../../shared/types";
import { useFinderStore } from "../state/finderStore";
import { StreamList } from "./StreamList";

vi.mock("react-window", () => ({
  FixedSizeList: ({
    children: Row,
    itemCount,
    itemData,
  }: {
    children: (props: { index: number; style: object; data: { indexes: number[] } }) => ReactElement;
    itemCount: number;
    itemData: { indexes: number[] };
  }) => (
    <div>
      {Array.from({ length: itemCount }, (_, index) => (
        <Row key={index} index={index} style={{}} data={itemData} />
      ))}
    </div>
  ),
}));

const sample: MediaItem = {
  url: "https://example.com/a.mp4",
  kind: "progressive",
  originHost: "example.com",
  title: "Demo clip",
  pageUrl: "https://example.com/watch",
  source: "dom",
  encrypted: false,
  variants: [{ url: "https://example.com/a.mp4", label: "720p", height: 720, encrypted: false, kind: "progressive" }],
  subtitles: [],
};

describe("StreamList", () => {
  beforeEach(() => {
    useFinderStore.setState({
      scan: { pageUrl: sample.pageUrl, pageTitle: sample.title, sources: [sample] },
      selected: [],
      openIndex: null,
      variantUrl: {},
    });
  });

  it("lists detected streams and expands details without fetching", async () => {
    const user = userEvent.setup();
    render(<StreamList />);
    expect(screen.getByText("a.mp4")).toBeInTheDocument();
    expect(screen.getByText("MP4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /a\.mp4/ }));
    expect(screen.getByText("https://example.com/a.mp4")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("https://example.com/a.mp4");
    expect(screen.getByTestId("command-output")).toHaveTextContent("https://example.com/a.mp4");
  });

  it("opens the command panel from the terminal tile", async () => {
    const user = userEvent.setup();
    render(<StreamList />);
    expect(screen.queryByTestId("command-panel")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show command" }));
    expect(screen.getByTestId("command-panel")).toBeInTheDocument();
  });

  it("offers a batch script and URL list once streams are selected", async () => {
    const user = userEvent.setup();
    render(<StreamList />);
    expect(screen.queryByTestId("batch-bar")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select stream" }));
    expect(screen.getByTestId("batch-bar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy URL list" }));
    await expect(navigator.clipboard.readText()).resolves.toBe("https://example.com/a.mp4\n");
    await user.click(screen.getByRole("button", { name: /Copy script \(1\)/ }));
    await expect(navigator.clipboard.readText()).resolves.toMatch(/yt-dlp .*https:\/\/example\.com\/a\.mp4/);
  });

  it("locks DRM streams out of selection and command generation", () => {
    useFinderStore.setState({
      scan: {
        pageUrl: sample.pageUrl,
        pageTitle: sample.title,
        sources: [{ ...sample, encrypted: true, variants: [{ ...sample.variants[0]!, encrypted: true }] }],
      },
    });
    render(<StreamList />);
    expect(screen.getByRole("button", { name: "Select stream" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show command" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  it("hides the empty quality menu for a locked stream", () => {
    useFinderStore.setState({
      scan: {
        pageUrl: sample.pageUrl,
        pageTitle: sample.title,
        sources: [{ ...sample, encrypted: true, variants: [{ ...sample.variants[0]!, encrypted: true }] }],
      },
      openIndex: 0,
    });
    render(<StreamList />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("command-refused")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy stream URL" })).not.toBeInTheDocument();
  });

  it("filters to audio and keeps the video row's size and hidden mark", async () => {
    const user = userEvent.setup();
    const audio: MediaItem = {
      ...sample,
      url: "https://example.com/theme.mp3",
      medium: "audio",
      title: "Theme",
      fileName: "theme.mp3",
      variants: [{ url: "https://example.com/theme.mp3", label: "Audio", encrypted: false, kind: "progressive" }],
    };
    useFinderStore.setState({
      scan: {
        pageUrl: sample.pageUrl,
        pageTitle: sample.title,
        sources: [{ ...sample, sizeEstimate: 48 * 1024 * 1024, placement: "hidden" }, audio],
      },
    });
    render(<StreamList />);
    expect(screen.getByText("48.0 MB")).toBeInTheDocument();
    expect(screen.getByText("hidden")).toBeInTheDocument();
    expect(screen.getByText("theme.mp3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Audio", pressed: false }));
    expect(screen.queryByText("a.mp4")).not.toBeInTheDocument();
    expect(screen.getByText("theme.mp3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /theme\.mp3/ }));
    await user.click(screen.getByRole("button", { name: "Copy stream URL" }));
    await expect(navigator.clipboard.readText()).resolves.toBe("https://example.com/theme.mp3");
  });
});
