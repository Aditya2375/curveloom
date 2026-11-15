import { run, DEFAULT } from "../web/src/model.js";
import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from "node:fs";

const HTTP_PORT = 8992;
const CDP_PORT = 9393;
const SHOTS = process.env.SMOKE_SHOTS === "1";
const root = new URL("..", import.meta.url).pathname;

const profile = mkdtempSync("/tmp/curveloom-chrome-");
const server = spawn(
  "python3",
  [
    "-m",
    "http.server",
    String(HTTP_PORT),
    "--bind",
    "127.0.0.1",
    "--directory",
    `${root}docs`,
  ],
  { stdio: "ignore", detached: true },
);
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const cleanup = async (code) => {
  for (const child of [chrome, server]) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await Promise.all(
    [chrome, server].map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => child.once("exit", r)),
    ),
  );
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
};
const timeout = setTimeout(() => {
  console.error("smoke: timeout");
  cleanup(1);
}, 90000);
process.on("SIGINT", () => cleanup(2));
process.on("uncaughtException", (e) => {
  console.error(e);
  cleanup(1);
});
process.on("unhandledRejection", (e) => {
  console.error(e);
  cleanup(1);
});

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? "ok" : "NOT OK"} - ${name}${detail ? " - " + detail : ""}`,
  );
};

await waitFor(
  async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok,
  "chrome devtools",
);
const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let mid = 0;
const rpcPending = new Map();
const consoleErrors = [];
const requests = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Network.requestWillBeSent")
    requests.push(msg.params.request.url);
  if (msg.id && rpcPending.has(msg.id)) {
    rpcPending.get(msg.id)(msg);
    rpcPending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown")
    consoleErrors.push(
      msg.params.exceptionDetails?.exception?.description ?? "page exception",
    );
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++mid;
    rpcPending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails)
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  await new Promise((r) => setTimeout(r, 900));
  const metrics = await cdp("Page.getLayoutMetrics");
  const size = metrics.result.cssContentSize;
  const r = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  });
  writeFileSync(
    `${root}smoke-${name}.png`,
    Buffer.from(r.result.data, "base64"),
  );
};

await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const url = process.env.SMOKE_URL || `http://127.0.0.1:${HTTP_PORT}/`;
await cdp("Page.navigate", { url });
await waitFor(
  async () =>
    await evaluate(
      `document.querySelectorAll('#ledger tbody tr').length===576`,
    ),
  "rendered",
);
const input = (id, v) =>
    evaluate(
      `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(v))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}));true`,
    ),
  submit = () =>
    evaluate(
      `document.getElementById('controls').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true`,
    ),
  text = (id) =>
    evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`),
  click = (s) =>
    evaluate(`document.querySelector(${JSON.stringify(s)}).click();true`),
  f = (n) =>
    n === null ? "N/A" : Math.abs(n) < 0.0000005 ? "0.000000" : n.toFixed(6),
  eq = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  near = (a, b) => Math.abs(a - b) < 1e-6,
  ten = [0.25, 1, 2, 5, 10, 30];
const snap = () =>
  evaluate(
    `({tables:Object.fromEntries(['spectrum','loadings','scores','audit','ledger','diagnostics'].map(id=>[id,[...document.querySelectorAll('#'+id+' tbody tr')].map(r=>[...r.cells].map(x=>x.textContent))])),day:document.getElementById('daynote').textContent,equation:document.getElementById('equation').textContent,charts:['loadChart','changeChart'].map(id=>({id,width:document.getElementById(id).getBoundingClientRect().width,points:[...document.querySelectorAll('#'+id+' polyline')].map(e=>e.getAttribute('points'))}))})`,
  );
async function verify(p, day, label) {
  const r = run(p),
    g = r.fit,
    i = day - 1,
    v = await snap();
  let cum = 0;
  check(
    label + " sixSpectrumRows",
    eq(
      v.tables.spectrum,
      g.eigen.values.map((z, k) => {
        if (g.shares[k] !== null) cum += g.shares[k];
        return [
          `PC${k + 1}`,
          f(z),
          g.shares[k] === null ? "N/A" : f(100 * g.shares[k]),
          g.shares[k] === null ? "N/A" : f(100 * cum),
          k < p.keep ? "Yes" : "No",
        ];
      }),
    ),
  );
  check(
    label + " all36Loadings",
    eq(
      v.tables.loadings,
      g.eigen.vectors.map((a, k) => [`PC${k + 1}`, ...a.map(f)]),
    ),
  );
  check(
    label + " allScores",
    eq(
      v.tables.scores,
      g.scores[i].map((z, k) => [
        `PC${k + 1}`,
        f(z),
        k < p.keep ? "Yes" : "No",
      ]),
    ),
  );
  check(
    label + " allAuditCells",
    eq(
      v.tables.audit,
      ten.map((t, j) => [
        String(t),
        f(r.changes[i][j]),
        f(g.mean[j]),
        ...Array.from({ length: 6 }, (_, k) =>
          k < p.keep ? f(g.scores[i][k] * g.eigen.vectors[k][j]) : "Omitted",
        ),
        f(g.reconstructed[i][j]),
        f(g.residual[i][j]),
        f(r.levels[i][j]),
        f(r.levels[i + 1][j]),
      ]),
    ),
  );
  check(
    label + " all576LedgerRows",
    eq(
      v.tables.ledger,
      r.changes.flatMap((row, t) =>
        row.map((z, j) => [
          String(t + 1),
          t < p.train ? "Fit" : "Held out",
          String(ten[j]),
          f(z),
          f(g.reconstructed[t][j]),
          f(g.residual[t][j]),
          f(r.levels[t][j]),
          f(r.levels[t + 1][j]),
        ]),
      ),
    ),
  );
  check(
    label + " headlineValues",
    (await text("captured")) ===
      (g.captured === null ? "N/A" : f(g.captured * 100) + "%") &&
      (await text("trainRmse")) === f(g.trainRmse) &&
      (await text("heldoutRmse")) === f(g.heldoutRmse),
  );
  check(
    label + " eigenNumericCheck",
    Number(await text("eigenResidual")) < 1e-9,
  );
  check(
    label + " daySplit",
    v.day.includes(`change ${day} / 96`) &&
      v.day.includes(day <= p.train ? "fit prefix" : "held out"),
  );
  check(
    label + " identityText",
    v.equation.includes(
      `5y audit: ${f(r.changes[i][3])} bps = mean ${f(g.mean[3])}`,
    ) &&
      v.equation.includes(`residual ${f(g.residual[i][3])}`) &&
      v.equation.includes(`${f(r.levels[i + 1][3])}%`),
  );
  const discarded = g.eigen.values.slice(p.keep).reduce((a, b) => a + b, 0);
  check(
    label + " allDiagnosticValues",
    eq(v.tables.diagnostics.slice(0, 5), [
      [
        "Covariance trace / bps²",
        f(g.covariance.reduce((a, row, j) => a + row[j], 0)),
      ],
      ["Sum eigenvalues / bps²", f(g.eigen.values.reduce((a, b) => a + b, 0))],
      ["Training SSE / bps²", f(g.trainSse)],
      ["(n-1) × discarded eigenvalues / bps²", f((p.train - 1) * discarded)],
      ["Held-out SSE / bps²", f(g.heldoutSse)],
    ]),
  );
  check(
    label + " orthogonalityCheck",
    Number(v.tables.diagnostics[5][1]) < 1e-12 &&
      Number.isInteger(Number(v.tables.diagnostics[6][1])),
  );
  for (let chart = 0; chart < 2; chart++) {
    const source =
        chart === 0
          ? g.eigen.vectors.slice(0, 3)
          : [r.changes[i], g.reconstructed[i]],
      c = v.charts[chart],
      all = source.flat(),
      lo = Math.min(0, ...all),
      hi = Math.max(0, ...all),
      pad = Math.max((hi - lo) * 0.1, chart === 0 ? 0.05 : 0.25),
      min = lo - pad,
      max = hi + pad,
      w = Math.max(260, c.width),
      x = (t) => 44 + ((w - 58) * (t - 0.25)) / 29.75,
      y = (z) => 225 - (205 * (z - min)) / (max - min);
    check(
      label + " everyChartPoint" + chart,
      c.points.length === source.length &&
        c.points.every((s, k) => {
          const points = s.split(" ").map((a) => a.split(",").map(Number));
          return (
            points.length === 6 &&
            points.every(
              ([a, b], j) => near(a, x(ten[j])) && near(b, y(source[k][j])),
            )
          );
        }),
    );
  }
}
await verify(DEFAULT, 1, "default");
await shot("default");
for (const d of [48, 72, 73, 96]) {
  await input("day", d);
  await verify(DEFAULT, d, "day" + d);
}
const old = await snap();
for (const [k, bad] of [
  ["level", ""],
  ["level", 13],
  ["slope", -1],
  ["curve", 7],
  ["ripple", 4],
  ["keep", ""],
]) {
  await input(k, bad);
  await submit();
  check(
    "invalid" + k + bad,
    eq((await snap()).tables.audit, old.tables.audit) &&
      (await text("status")).includes("retained"),
  );
  await input(k, DEFAULT[k]);
}
await input("level", 9);
check("dirty", (await text("status")).includes("UNAPPLIED"));
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1000,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await evaluate("new Promise(r=>setTimeout(r,120))");
check("dirtyResize", eq((await snap()).tables.audit, old.tables.audit));
const cases = [
  { level: 0, slope: 0, curve: 0, ripple: 0, train: 48, keep: 1 },
  { level: 12, slope: 8, curve: 6, ripple: 3, train: 48, keep: 6 },
  { level: 12, slope: 8, curve: 6, ripple: 3, train: 72, keep: 1 },
  { ...DEFAULT, train: 48, keep: 2 },
];
for (let j = 0; j < cases.length; j++) {
  const p = cases[j];
  for (const k of Object.keys(p)) await input(k, p[k]);
  await submit();
  await input("day", p.train + 1);
  await verify(p, p.train + 1, "scenario" + j);
  await shot("scenario" + j);
  if (j === 0) check("constantSharesNA", (await text("captured")) === "N/A");
  if (j === 1)
    check(
      "keep6FullReconstruction",
      (await text("trainRmse")) === "0.000000" &&
        (await text("heldoutRmse")) === "0.000000",
    );
}
for (const k of Object.keys(DEFAULT)) await input(k, DEFAULT[k]);
await submit();
await input("day", 73);
for (const width of [768, 390, 360, 320]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate("new Promise(r=>setTimeout(r,120))");
  const b = await evaluate(
    `({width:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('input,select,button,.metrics strong,svg')].map(e=>e.getBoundingClientRect().toJSON())})`,
  );
  check(
    "width" + width + " bounds",
    b.width <= width &&
      b.boxes.every((r) => r.left >= 0 && r.right <= width + 0.5),
  );
  check(
    "width" + width + " metricContainment",
    await evaluate(
      `[...document.querySelectorAll('.metrics strong')].every(e=>e.getBoundingClientRect().right<=e.parentElement.getBoundingClientRect().right+.5)`,
    ),
  );
  await verify(DEFAULT, 73, "width" + width);
  if (width === 320) {
    await shot("mobile-plots");
    await click("summary");
    await shot("mobile-ledger");
    const t = await evaluate(
      `({w:document.querySelector('.ledger').clientWidth,sw:document.querySelector('.ledger').scrollWidth,h:document.querySelector('.ledger').clientHeight,sh:document.querySelector('.ledger').scrollHeight})`,
    );
    check("ledgerBothAxes", t.sw > t.w && t.sh > t.h && t.h <= 420);
    await evaluate(
      `document.querySelector('.ledger').scrollLeft=800;document.querySelector('.ledger').scrollTop=900;true`,
    );
    check(
      "ledgerScrollWorks",
      await evaluate(
        `document.querySelector('.ledger').scrollLeft>0&&document.querySelector('.ledger').scrollTop>0`,
      ),
    );
  }
}
check("noErrors", consoleErrors.length === 0, consoleErrors.join(";"));
const origin = new URL(url).origin;
check(
  "noOffOrigin",
  requests.every((u) => u.startsWith(origin) || u === "about:blank"),
);
check(
  "noStorage",
  await evaluate(
    `!localStorage.length&&!sessionStorage.length&&!document.cookie`,
  ),
);
check(
  "CSP",
  await evaluate(
    `document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'")`,
  ),
);
writeFileSync(root + "browser-checks.json", JSON.stringify(checks, null, 2));
const failed = checks.filter((c) => !c.ok);
console.log(`${checks.length} Chrome checks, ${failed.length} failures`);
clearTimeout(timeout);
await cleanup(failed.length ? 1 : 0);
