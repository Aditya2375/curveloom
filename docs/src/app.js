import { DEFAULT, validate, run, tenors } from "./model.js";
const $ = (id) => document.getElementById(id),
  NS = "http://www.w3.org/2000/svg",
  keys = ["level", "slope", "curve", "ripple", "train", "keep"],
  f = (n) =>
    n === null ? "N/A" : Math.abs(n) < 0.0000005 ? "0.000000" : n.toFixed(6);
let applied = { ...DEFAULT },
  result;
const el = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = String(text);
  return e;
};
function table(id, rows) {
  $(id).tBodies[0].replaceChildren(
    ...rows.map((a) => {
      const tr = el("tr");
      a.forEach((v) => tr.append(el("td", v)));
      return tr;
    }),
  );
}
function svg(tag, a, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
function plot(id, series) {
  const e = $(id),
    w = Math.max(260, e.getBoundingClientRect().width),
    h = 260,
    L = 44,
    R = w - 14,
    T = 20,
    B = 225,
    all = series.flat(),
    lo = Math.min(0, ...all),
    hi = Math.max(0, ...all),
    pad = Math.max((hi - lo) * 0.1, id === "loadChart" ? 0.05 : 0.25),
    min = lo - pad,
    max = hi + pad,
    x = (t) => L + ((R - L) * (t - 0.25)) / 29.75,
    y = (v) => B - ((B - T) * (v - min)) / (max - min);
  e.setAttribute("viewBox", `0 0 ${w} ${h}`);
  e.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const z = min + ((max - min) * i) / 2;
    e.append(
      svg("line", { x1: L, x2: R, y1: y(z), y2: y(z) }),
      svg(
        "text",
        { x: L - 4, y: y(z) + 4, "text-anchor": "end" },
        z.toFixed(2),
      ),
    );
  }
  e.append(svg("line", { class: "zero", x1: L, x2: R, y1: y(0), y2: y(0) }));
  for (let k = 0; k < series.length; k++)
    e.append(
      svg("polyline", {
        class: ["series primary", "series secondary", "series third"][k],
        points: series[k].map((v, j) => `${x(tenors()[j])},${y(v)}`).join(" "),
      }),
    );
  for (const t of [0.25, 5, 10, 30])
    e.append(
      svg("text", { x: x(t), y: 252, "text-anchor": "middle" }, String(t)),
    );
}
function charts() {
  const i = Number($("day").value) - 1;
  plot("loadChart", result.fit.eigen.vectors.slice(0, 3));
  plot("changeChart", [result.changes[i], result.fit.reconstructed[i]]);
}
function inspect() {
  const i = Number($("day").value) - 1,
    g = result.fit,
    raw = result.changes[i],
    mean = g.mean;
  $("daynote").textContent =
    `change ${i + 1} / 96 · ${i < applied.train ? "fit prefix" : "held out, frozen mean and vectors"}`;
  $("chartnote").textContent =
    `Change ${i + 1}, in bps, vs maturity in years. Keep ${applied.keep} component${applied.keep === 1 ? "" : "s"}. Reconstruction uses this row's full observed changes, not a forecast.`;
  table(
    "scores",
    g.scores[i].map((v, k) => [
      `PC${k + 1}`,
      f(v),
      k < applied.keep ? "Yes" : "No",
    ]),
  );
  table(
    "audit",
    tenors().map((t, j) => [
      t,
      f(raw[j]),
      f(mean[j]),
      ...Array.from({ length: 6 }, (_, k) =>
        k < applied.keep
          ? f(g.scores[i][k] * g.eigen.vectors[k][j])
          : "Omitted",
      ),
      f(g.reconstructed[i][j]),
      f(g.residual[i][j]),
      f(result.levels[i][j]),
      f(result.levels[i + 1][j]),
    ]),
  );
  const j = 3;
  $("equation").textContent =
    `5y audit: ${f(raw[j])} bps = mean ${f(mean[j])} + retained contributions ${f(g.reconstructed[i][j] - mean[j])} + residual ${f(g.residual[i][j])}. Yield ${f(result.levels[i][j])}% + change / 100 = ${f(result.levels[i + 1][j])}%.`;
  charts();
}
function render() {
  result = run(applied);
  const g = result.fit;
  $("captured").textContent =
    g.captured === null ? "N/A" : f(100 * g.captured) + "%";
  $("trainRmse").textContent = f(g.trainRmse);
  $("heldoutRmse").textContent = f(g.heldoutRmse);
  $("eigenResidual").textContent = g.eigen.residual.toExponential(2);
  $("fitnote").textContent =
    `fit changes 1 to ${applied.train} · held out ${applied.train + 1} to 96`;
  let cum = 0;
  table(
    "spectrum",
    g.eigen.values.map((v, k) => {
      if (g.shares[k] !== null) cum += g.shares[k];
      return [
        `PC${k + 1}`,
        f(v),
        g.shares[k] === null ? "N/A" : f(100 * g.shares[k]),
        g.shares[k] === null ? "N/A" : f(100 * cum),
        k < applied.keep ? "Yes" : "No",
      ];
    }),
  );
  table(
    "loadings",
    g.eigen.vectors.map((v, k) => [`PC${k + 1}`, ...v.map(f)]),
  );
  table(
    "ledger",
    result.changes.flatMap((row, i) =>
      row.map((v, j) => [
        i + 1,
        i < applied.train ? "Fit" : "Held out",
        tenors()[j],
        f(v),
        f(g.reconstructed[i][j]),
        f(g.residual[i][j]),
        f(result.levels[i][j]),
        f(result.levels[i + 1][j]),
      ]),
    ),
  );
  const discarded = g.eigen.values
    .slice(applied.keep)
    .reduce((a, b) => a + b, 0);
  table("diagnostics", [
    [
      "Covariance trace / bps²",
      f(g.covariance.reduce((a, row, j) => a + row[j], 0)),
    ],
    ["Sum eigenvalues / bps²", f(g.eigen.values.reduce((a, b) => a + b, 0))],
    ["Training SSE / bps²", f(g.trainSse)],
    [
      "(n-1) × discarded eigenvalues / bps²",
      f((applied.train - 1) * discarded),
    ],
    ["Held-out SSE / bps²", f(g.heldoutSse)],
    ["Max |V Vᵀ - I| / unitless", g.eigen.orthogonality.toExponential(2)],
    ["Jacobi rotations", g.eigen.rotations],
  ]);
  $("status").className = "eyebrow";
  $("status").textContent =
    `APPLIED / amplitudes (${applied.level}, ${applied.slope}, ${applied.curve}, ${applied.ripple}) bps · fit ${applied.train} changes · retain ${applied.keep} / 6`;
  inspect();
}
$("controls").noValidate = true;
$("controls").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const p = {};
    for (const k of keys) {
      if ($(k).value.trim() === "") throw Error("All inputs required.");
      p[k] = Number($(k).value);
    }
    validate(p);
    applied = p;
    render();
  } catch (error) {
    $("status").className = "eyebrow invalid";
    $("status").textContent =
      error.message + " Previous decomposition retained.";
  }
});
for (const k of keys)
  $(k).addEventListener("input", () => {
    $("status").textContent =
      "UNAPPLIED / previous decomposition remains visible. Decompose to apply changes.";
  });
$("day").addEventListener("input", inspect);
let timer;
window.addEventListener("resize", () => {
  clearTimeout(timer);
  timer = setTimeout(charts, 80);
});
render();
