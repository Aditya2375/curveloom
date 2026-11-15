import { spawnSync } from "node:child_process";
import { run, DEFAULT } from "../web/src/model.js";
let count = 0,
  max = 0;
const eq = (a, b) => {
  count++;
  if (b === null) {
    if (!Number.isNaN(a)) throw Error("ExpectedNA");
    return;
  }
  let d = Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
  max = Math.max(max, d);
  if (!Number.isFinite(d) || d > 3e-9) throw Error(`${a} vs ${b}`);
};
for (let z = 0; z < 48; z++) {
  const p =
      z === 0
        ? { ...DEFAULT, level: 0, slope: 0, curve: 0, ripple: 0 }
        : {
            level: 2 + (z % 6) * 2,
            slope: 1 + (z % 8),
            curve: 0.5 + (z % 6),
            ripple: 0.25 + (z % 12) / 4,
            train: z % 2 ? 48 : 72,
            keep: 1 + (z % 6),
          },
    r = run(p),
    f = r.fit;
  const out = spawnSync(
    process.env.JAVA || "java",
    ["-cp", "build/classes", "Dump", ...Object.values(p).map(String)],
    { encoding: "utf8" },
  );
  if (out.status) throw Error(out.stderr);
  for (const row of out.stdout.trim().split("\n")) {
    const [tag, ...text] = row.split(","),
      v = text.map(Number);
    if (tag === "H")
      [
        f.captured,
        f.trainRmse,
        f.heldoutRmse,
        f.trainSse,
        f.heldoutSse,
      ].forEach((n, i) => eq(v[i], n));
    if (tag === "E")
      [f.eigen.values[v[0]], f.shares[v[0]], f.mean[v[0]]].forEach((n, i) =>
        eq(v[i + 1], n),
      );
    if (tag === "V") {
      eq(v[2], f.eigen.vectors[v[0]][v[1]]);
      eq(v[3], f.covariance[v[0]][v[1]]);
    }
    if (tag === "X")
      [
        r.changes[v[0]][v[1]],
        r.levels[v[0] + 1][v[1]],
        f.scores[v[0]][v[1]],
        f.reconstructed[v[0]][v[1]],
        f.residual[v[0]][v[1]],
      ].forEach((n, i) => eq(v[i + 2], n));
  }
}
console.log(`${count} Java/JS comparisons passed, max scaled ${max}`);
