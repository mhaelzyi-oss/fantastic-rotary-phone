import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

describe("kui-ui", () => {
  it("does not steal clicks from the run button", () => {
    document.body.innerHTML = `<div id="drop">Drop<input id="file" type="file" /></div><button id="run" type="button">Convert</button><p id="status" class="status"></p>`;
    vm.runInThisContext(readFileSync("web-tools/shared/kui-ui.js", "utf8"));
    const KuiUi = (
      globalThis as {
        KuiUi: {
          bindDrop: (el: Element, onFiles: (files: File[]) => void) => void;
          qs: (sel: string) => HTMLElement;
        };
      }
    ).KuiUi;
    let opened = 0;
    const input = document.querySelector("#file") as HTMLInputElement;
    input.click = () => {
      opened += 1;
    };
    KuiUi.bindDrop(KuiUi.qs("#drop"), () => undefined);
    KuiUi.qs("#run").click();
    expect(opened).toBe(0);
    (KuiUi.qs("#drop") as HTMLElement).click();
    expect(opened).toBe(1);
  });
});
