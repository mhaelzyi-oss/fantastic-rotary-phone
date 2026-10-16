import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sendMessage } from "../test/setup";
import { OptionsApp } from "./OptionsApp";

describe("OptionsApp", () => {
  it("saves prefs through the worker message, not storage APIs", async () => {
    const user = userEvent.setup();
    render(<OptionsApp />);
    await screen.findByText("KUI Video Extractor");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_PREFS" }));
  });

  it("erases everything only after a second confirmation click", async () => {
    const user = userEvent.setup();
    render(<OptionsApp />);
    await screen.findByText("KUI Video Extractor");
    await user.click(screen.getByRole("button", { name: "Erase all data" }));
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ERASE_ALL_DATA" }));
    await user.click(screen.getByRole("button", { name: "Click again to erase everything" }));
    expect(sendMessage).toHaveBeenCalledWith({ type: "ERASE_ALL_DATA" });
    expect(await screen.findByText(/Erased/)).toBeVisible();
  });
});