import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { webTools } from "../../shared/webTools";
import { ToolsPanel } from "./ToolsPanel";

describe("ToolsPanel", () => {
  it("lists the seven local-file tools and opens an extension page", async () => {
    const user = userEvent.setup();
    render(<ToolsPanel compact />);
    expect(screen.getByTestId("tools-panel")).toBeInTheDocument();
    for (const tool of webTools) {
      expect(screen.getByRole("link", { name: tool.short })).toHaveAttribute(
        "href",
        `chrome-extension://test/tools/${tool.slug}/index.html`,
      );
    }
    expect(screen.queryByText("Detect")).not.toBeInTheDocument();
    expect(screen.queryByText("Analyze")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Converter" }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://test/tools/convert/index.html" });
  });

  it("shows full names in the side-panel cards", () => {
    render(<ToolsPanel compact={false} />);
    for (const tool of webTools) {
      expect(screen.getByRole("heading", { name: tool.name })).toBeInTheDocument();
    }
  });
});
