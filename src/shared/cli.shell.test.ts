// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildBatchScript, buildCliCommand, CLI_TOOLS, quoteArg, type CliInput, type CliShell } from "./cli";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

/**
 * Real-shell round trip: build a command, run it through the actual shell against a probe
 * program that prints its argv, and require the arguments to arrive exactly as intended.
 * Many probe invocations share one shell session so the suite stays fast.
 */

const isWin = process.platform === "win32";

function has(cmd: string, args: string[]): boolean {
  try {
    return spawnSync(cmd, args, { encoding: "utf8", timeout: 20000 }).status === 0;
  } catch {
    return false;
  }
}

const HAS_PS = isWin && has("powershell.exe", ["-NoProfile", "-Command", "exit 0"]);
const HAS_CMD = isWin && has("cmd.exe", ["/d", "/c", "exit 0"]);
const HAS_BASH = !isWin && has("bash", ["-c", "exit 0"]);

let dir = "";
let probe = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "gws-cli-"));
  probe = join(dir, "argv.mjs");
  writeFileSync(
    probe,
    'process.stdout.write(JSON.stringify(process.argv.slice(2)).replace(/[\\u0080-\\uffff]/g, (c) => "\\\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) + "\\n");\n',
  );
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function parseLines(stdout: string): string[][] {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as string[]);
}

/** Run several command lines in one real shell session; returns argv for each. */
type Runner = (lines: string[]) => string[][];

const runPowerShell: Runner = (lines) => {
  const encoded = Buffer.from(lines.join("\n"), "utf16le").toString("base64");
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    encoding: "utf8",
    timeout: 90000,
  });
  if (r.status !== 0) throw new Error(`powershell failed: ${r.stderr || r.stdout}`);
  return parseLines(r.stdout);
};

// One command per cmd.exe session, like typing at the prompt. Chaining many `&`-joined lines that
// contain ^ and ( makes cmd.exe's parser blow up exponentially (5 chained lines never finish), which
// is a cmd quirk and not a quoting problem; the .bat runner below covers the multi-line case.
const runCmd: Runner = (lines) =>
  lines.flatMap((line) => {
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
      encoding: "utf8",
      timeout: 20000,
      windowsVerbatimArguments: true,
    });
    if (r.status !== 0) throw new Error(`cmd failed (${r.error ?? r.signal ?? r.status}): ${r.stderr || r.stdout}`);
    return parseLines(r.stdout);
  });

const runCmdBatch: Runner = (lines) => {
  const file = join(dir, `run-${Math.random().toString(36).slice(2)}.bat`);
  writeFileSync(file, `@echo off\r\nchcp 65001 >nul\r\n${lines.join("\r\n")}\r\n`);
  const r = spawnSync("cmd.exe", ["/d", "/c", file], { encoding: "utf8", timeout: 90000 });
  if (r.status !== 0) throw new Error(`batch failed: ${r.stderr || r.stdout}`);
  return parseLines(r.stdout);
};

const runBash: Runner = (lines) => {
  const r = spawnSync("bash", ["-c", lines.join("\n")], { encoding: "utf8", timeout: 90000 });
  if (r.status !== 0) throw new Error(`bash failed: ${r.stderr || r.stdout}`);
  return parseLines(r.stdout);
};

function withProbe(shell: CliShell, argLine: string, batch = false): string {
  const p = quoteArg(shell, probe, { cmdBatch: batch });
  if (p == null) throw new Error("probe path not quotable");
  return shell === "powershell" ? `& node ${p} ${argLine}` : `node ${p} ${argLine}`;
}

const CORPUS = [
  "plain",
  "with space",
  "it's",
  "a'b'c",
  "$(calc)",
  "`whoami`",
  "$env:TEMP and $HOME",
  ";rm -rf /",
  "&calc",
  "a&b|c",
  "a<b>c",
  "(group)",
  "*",
  "?",
  "~",
  "{a,b}",
  "a,b",
  "#hash",
  "!bang",
  "a=b",
  "--flag=value with space",
  "-leading",
  "back\\slash",
  "C:\\dir\\file name.mp4",
  "\u00e9\u65e5\u672c\u8a9e\ud83d\ude00",
  "\u2018smart\u2019 \u201Cdouble\u201D",
  "%PATH%",
  "%COMSPEC%",
  "%comspec% and %COMSPECX%x",
  "%ZZ%%x%",
  "100%",
  "%",
  "^caret^",
  "https://cdn.example.com/a b.mp4?x=$(calc)&y=1;z=`id`#frag",
];

function expectedNull(shell: CliShell, arg: string, batch: boolean): boolean {
  if (arg.includes('"')) return true;
  if (shell === "powershell" && /\s/.test(arg) && /\\$/.test(arg)) return true;
  if (shell === "cmd" && !batch && arg.includes("%")) return true;
  return false;
}

function roundTrip(shell: CliShell, run: Runner, batch = false) {
  const usable: string[] = [];
  for (const arg of CORPUS) {
    const q = quoteArg(shell, arg, { cmdBatch: batch });
    if (expectedNull(shell, arg, batch)) {
      expect(q, `should refuse ${JSON.stringify(arg)}`).toBeNull();
    } else {
      expect(q, `quote ${JSON.stringify(arg)}`).not.toBeNull();
      usable.push(arg);
    }
  }
  const lines = usable.map((a) => withProbe(shell, quoteArg(shell, a, { cmdBatch: batch })!, batch));
  const got = run(lines);
  expect(got).toHaveLength(usable.length);
  usable.forEach((arg, i) => {
    expect(got[i], `${shell} round-trip of ${JSON.stringify(arg)} via ${quoteArg(shell, arg, { cmdBatch: batch })}`).toEqual([arg]);
  });
  // All of them again on ONE command line, as real commands carry many arguments.
  const one = usable.map((a) => quoteArg(shell, a, { cmdBatch: batch })!).join(" ");
  expect(run([withProbe(shell, one, batch)])).toEqual([usable]);
}

describe.skipIf(!HAS_PS)("PowerShell round trip (real powershell.exe)", () => {
  it("delivers every argument exactly", () => roundTrip("powershell", runPowerShell));
  it("does not execute injected expressions", () => {
    const marker = join(dir, "pwned-ps.txt");
    const payload = `$(New-Item -ItemType File -Path '${marker.replace(/\\/g, "/")}' | Out-Null)`;
    const got = runPowerShell([withProbe("powershell", quoteArg("powershell", payload)!)]);
    expect(got[0]).toEqual([payload]);
    expect(existsSync(marker)).toBe(false);
  });
});

describe.skipIf(!HAS_CMD)("cmd.exe round trip (real cmd.exe, interactive)", () => {
  it("delivers every argument exactly, including % and ^", () => roundTrip("cmd", runCmd));
  it("refuses percent text instead of letting cmd expand or freeze on it", () => {
    for (const text of ["%COMSPEC% %USERPROFILE%", "%PATH%", "%COMSPECX%x", "50%"]) {
      expect(quoteArg("cmd", text)).toBeNull();
    }
  });
  it("does not run injected commands", () => {
    const marker = join(dir, "pwned-cmd.txt");
    expect(quoteArg("cmd", `x" & echo hacked > "${marker}" & "`)).toBeNull();
    const text = `x & echo hacked > ${marker} & y`;
    const got = runCmd([withProbe("cmd", quoteArg("cmd", text)!)]);
    expect(got).toEqual([[text]]);
    expect(existsSync(marker)).toBe(false);
  });
});

describe.skipIf(!HAS_CMD)("cmd.exe round trip (real .bat file)", () => {
  it("delivers every argument exactly with doubled percents", () => roundTrip("cmd", runCmdBatch, true));
  it("keeps %COMSPEC%-style text literal and never freezes", () => {
    const text = "%COMSPEC% %USERPROFILE% %comspec% %COMSPECX%x";
    expect(runCmdBatch([withProbe("cmd", quoteArg("cmd", text, { cmdBatch: true })!, true)])).toEqual([[text]]);
  });
});

describe.skipIf(!HAS_BASH)("bash round trip (real bash)", () => {
  it("delivers every argument exactly", () => roundTrip("bash", runBash));
  it("does not execute injected substitutions", () => {
    const marker = join(dir, "pwned-bash.txt");
    const payload = `$(touch '${marker}')`;
    expect(runBash([withProbe("bash", quoteArg("bash", payload)!)])[0]).toEqual([payload]);
    expect(existsSync(marker)).toBe(false);
  });
});

/** Whole pipeline: real builder output, with the binary swapped for the argv probe. */
const HOSTILE: Omit<CliInput, "tool" | "shell" | "kind"> = {
  url: "https://evil.example/a b.mp4?x=$(calc)&y=`whoami`;z=1#f",
  referer: "https://evil.example/page?'\"\u2018;calc",
  userAgent: "Mozilla \"5.0\" \u2018smart\u2019 $(calc) & | > <",
  filename: "My Clip: 'final' & more.mp4",
};

/** Hostile but percent-free, because the interactive cmd prompt refuses percent signs by design. */
const HOSTILE_NO_PERCENT: Omit<CliInput, "tool" | "shell" | "kind"> = {
  url: "https://evil.example/a.mp4?x=$(calc)&y=`whoami`;z=1&w=(1)^2!#f",
  referer: "https://evil.example/page?;calc&x=$(y)",
  userAgent: "Mozilla 5.0 $(calc) & | > < ^ !",
  filename: "My Clip- final & more.mp4",
};

function pipeline(shell: CliShell, run: Runner, batch = false, input = HOSTILE) {
  const cases: { label: string; rest: string; href: string }[] = [];
  const href = new URL(input.url).href;
  for (const tool of CLI_TOOLS) {
    for (const kind of tool.kinds) {
      const built = buildCliCommand({ ...input, tool: tool.id, shell, kind, cmdBatch: batch });
      expect(built.ok, `${tool.id}/${kind}/${shell}`).toBe(true);
      if (built.ok) cases.push({ label: `${tool.id}/${kind}/${shell}`, rest: built.command.slice(built.command.indexOf(" ") + 1), href });
    }
  }
  // yt-dlp in page mode: the hostile page URL is the target, with a format selector full of shell metacharacters.
  const page = `https://evil.example/watch?v=1&x=$(calc)&y=\`whoami\`;z=(1)^2!#f`;
  const pageBuilt = buildCliCommand({
    ...input,
    tool: "yt-dlp",
    shell,
    kind: "hls",
    cmdBatch: batch,
    ytdlpPage: true,
    pageUrl: page,
    maxHeight: 1080,
    subtitles: true,
  });
  expect(pageBuilt.ok, `yt-dlp/page/${shell}`).toBe(true);
  if (pageBuilt.ok) {
    cases.push({ label: `yt-dlp/page/${shell}`, rest: pageBuilt.command.slice(pageBuilt.command.indexOf(" ") + 1), href: new URL(page).href });
  }
  const got = run(cases.map((c) => withProbe(shell, c.rest, batch)));
  expect(got).toHaveLength(cases.length);
  cases.forEach((c, i) => {
    const argv = got[i]!;
    const href = c.href;
    expect(argv.some((a) => a.includes(href)), `${c.label} URL intact`).toBe(true);
    expect(argv.filter((a) => a.includes(href)), `${c.label} URL in exactly one arg`).toHaveLength(1);
    if (c.label.startsWith("yt-dlp/page")) {
      expect(argv, `${c.label} format selector intact`).toContain("bv*[height<=1080]+ba/b[height<=1080]/b");
      expect(argv, `${c.label} subtitles`).toEqual(expect.arrayContaining(["--write-subs", "--sub-langs", "all"]));
    }
    expect(argv.join("\u0000"), `${c.label} no fan-out`).not.toMatch(/\u0000(calc|whoami|rm)\u0000/);
  });
}

describe.skipIf(!HAS_PS)("full pipeline through real PowerShell", () => {
  it("every tool x kind survives hostile input intact", () => pipeline("powershell", runPowerShell));
});

describe.skipIf(!HAS_CMD)("full pipeline through real cmd.exe", () => {
  it("every tool x kind survives hostile input intact (interactive)", () => pipeline("cmd", runCmd, false, HOSTILE_NO_PERCENT));
  it("every tool x kind survives hostile input intact (.bat)", () => pipeline("cmd", runCmdBatch, true));
});

describe.skipIf(!HAS_BASH)("full pipeline through real bash", () => {
  it("every tool x kind survives hostile input intact", () => pipeline("bash", runBash));
});

describe.skipIf(!HAS_CMD)("generated batch script runs end to end", () => {
  it("runs a multi-stream cmd script with probe binaries", () => {
    const inputs: CliInput[] = [
      { ...HOSTILE, tool: "yt-dlp", shell: "cmd", kind: "hls", filename: "one%PATH%.mp4" },
      { ...HOSTILE, tool: "curl", shell: "cmd", kind: "progressive", url: "https://cdn.example.com/b.mp4?a=1&b=2", filename: "two.mp4" },
    ];
    const { script, count } = buildBatchScript(inputs);
    expect(count).toBe(2);
    const lines = script
      .split("\r\n")
      .filter((l) => l && !l.startsWith("@echo") && !l.startsWith("REM"))
      .map((l) => withProbe("cmd", l.slice(l.indexOf(" ") + 1), true));
    const got = runCmdBatch(lines);
    expect(got).toHaveLength(2);
    expect(got[0]).toContain("one%PATH%.mp4");
    expect(got[1]!.at(-1)).toBe("https://cdn.example.com/b.mp4?a=1&b=2");
  });
});
