import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { sendMessage } from "../test/setup";
import { useFinderStore } from "../state/finderStore";
import { FinderApp } from "./FinderApp";

describe("FinderApp tools surface", () => {
  beforeEach(() => {
    sendMessage.mockClear();
    useFinderStore.setState({ tab: "streams", hydrated: false });
  });

  it("keeps page-scan as the default surface and opens Tools without rescanning", async () => {
    const user = userEvent.setup();
    render(<FinderApp layout="popup" />);
    expect(screen.getByRole("heading", { name: "KUI Video Extractor" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Streams/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("tools-panel")).not.toBeInTheDocument();
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: "GET_SCAN" }));
    const scans = sendMessage.mock.calls.filter((c) => c[0]?.type === "GET_SCAN" || c[0]?.type === "RESAN").length;
    await user.click(screen.getByRole("tab", { name: /Tools/ }));
    expect(screen.getByTestId("tools-panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Converter" })).toBeInTheDocument();
    const after = sendMessage.mock.calls.filter((c) => c[0]?.type === "GET_SCAN" || c[0]?.type === "RESAN").length;
    expect(after).toBe(scans);
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "RESAN" });
  });
});
