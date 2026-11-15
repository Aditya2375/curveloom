import assert from "node:assert/strict";
import { run, fit, eigen, generate, DEFAULT } from "../web/src/model.js";
let count = 0;
const ok = (b) => {
    count++;
    assert(b);
  },
  eq = (a, b, t = 1e-10) =>
    ok(Math.abs(a - b) <= t * Math.max(1, Math.abs(a), Math.abs(b)));
for (let i = 0; i < 96; i++) {
  const p = {
      level: i % 13,
      slope: i % 9,
      curve: i % 7,
      ripple: (i % 13) / 4,
      train: i % 2 ? 48 : 72,
      keep: 1 + (i % 6),
    },
    r = run(p),
    f = r.fit;
  eq(f.eigen.residual, 0, 1e-9);
  eq(f.eigen.orthogonality, 0, 1e-12);
  for (let t = 0; t < 96; t++)
    for (let j = 0; j < 6; j++)
      eq(r.changes[t][j], f.reconstructed[t][j] + f.residual[t][j]);
  const d = r.changes.map((row, t) =>
      row.map((v, j) => v + (t >= p.train ? 40 * Math.cos(t + j) : 0)),
    ),
    g = fit(d, p.train, p.keep);
  ok(JSON.stringify(g.mean) === JSON.stringify(f.mean));
  ok(JSON.stringify(g.eigen.vectors) === JSON.stringify(f.eigen.vectors));
  const full = fit(r.changes, p.train, 6);
  eq(full.trainSse, 0, 1e-18);
  eq(full.heldoutSse, 0, 1e-18);
  const reduced = fit(r.changes, p.train, 1);
  ok(reduced.trainSse >= f.trainSse - 1e-8);
  let discarded = f.eigen.values.slice(p.keep).reduce((a, b) => a + b, 0);
  eq(f.trainSse, (p.train - 1) * discarded, 1e-8);
  const copy = structuredClone(r.changes);
  fit(r.changes, p.train, p.keep);
  ok(JSON.stringify(copy) === JSON.stringify(r.changes));
}
for (const [k, vals] of Object.entries({
  level: [NaN, Infinity, -1, 13],
  slope: [-1, 9],
  curve: [-1, 7],
  ripple: [-1, 4],
  train: [0, 49, 96, NaN],
  keep: [0, 7, 1.1, NaN],
}))
  for (const v of vals) {
    assert.throws(() => run({ ...DEFAULT, [k]: v }));
    count++;
  }
for (const a of [
  null,
  [],
  Array(2),
  [
    [1, ,],
    [, 1],
  ],
  [
    [1, 2],
    [3, 1],
  ],
  [[NaN]],
  [[100001]],
]) {
  assert.throws(() => eigen(a));
  count++;
}
for (const bad of [NaN, Infinity, -Infinity, 101]) {
  const d = generate(DEFAULT);
  d[90][2] = bad;
  assert.throws(() => fit(d, 72, 3));
  count++;
}
assert.throws(() => fit(Array(96), 72, 3));
count++;
const known = eigen([
  [2, 1],
  [1, 2],
]);
eq(known.values[0], 3);
eq(known.values[1], 1);
eq(known.vectors[0][0], 1 / Math.sqrt(2));
const zero = run({ ...DEFAULT, level: 0, slope: 0, curve: 0, ripple: 0 });
ok(zero.fit.captured === null && zero.fit.shares.every((v) => v === null));
console.log(`${count} JS domain assertions passed`);
