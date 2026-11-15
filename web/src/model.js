export const ROWS = 96,
  DIM = 6,
  DEFAULT = Object.freeze({
    level: 8,
    slope: 4,
    curve: 2,
    ripple: 1,
    train: 72,
    keep: 3,
  });
export const tenors = () => [0.25, 1, 2, 5, 10, 30];
export function validate(p) {
  if (
    !p ||
    !Number.isFinite(p.level) ||
    p.level < 0 ||
    p.level > 12 ||
    !Number.isFinite(p.slope) ||
    p.slope < 0 ||
    p.slope > 8 ||
    !Number.isFinite(p.curve) ||
    p.curve < 0 ||
    p.curve > 6 ||
    !Number.isFinite(p.ripple) ||
    p.ripple < 0 ||
    p.ripple > 3 ||
    ![48, 72].includes(p.train) ||
    !Number.isInteger(p.keep) ||
    p.keep < 1 ||
    p.keep > 6
  )
    throw Error(
      "Amplitudes: level 0..12, slope 0..8, curve 0..6, ripple 0..3 bps; fit48/72; keep1..6.",
    );
}
export function generate(p) {
  validate(p);
  const amp = [
    p.level,
    p.slope,
    p.curve,
    0.75 * p.ripple,
    0.5 * p.ripple,
    0.25 * p.ripple,
  ];
  return Array.from({ length: 96 }, (_, i) =>
    Array.from({ length: 6 }, (_, j) => {
      const t = i + 1;
      let z = 0.05 * (j - 2.5);
      for (let k = 0; k < 6; k++) {
        const v =
            k === 0
              ? 1 / Math.sqrt(6)
              : Math.sqrt(2 / 6) * Math.cos((Math.PI * k * (j + 0.5)) / 6),
          s =
            Math.sin((0.31 + 0.23 * k) * t + 0.4 * k) +
            0.35 * Math.cos((0.13 + 0.17 * k) * t - 0.2 * k);
        z += amp[k] * s * v;
      }
      return z;
    }),
  );
}
export function eigen(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 1 || matrix.length > 6)
    throw Error("Matrix1..6 square required.");
  const n = matrix.length;
  let scale = 1;
  const a = Array.from(matrix, (row) => {
      if (!Array.isArray(row) || row.length !== n)
        throw Error("Square matrix required.");
      return Array.from(row, (z) => {
        if (!Number.isFinite(z) || Math.abs(z) > 100000)
          throw Error("Bounded finite matrix required.");
        scale = Math.max(scale, Math.abs(z));
        return z;
      });
    }),
    v = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    );
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (Math.abs(a[i][j] - a[j][i]) > 1e-12 * scale)
        throw Error("Symmetric matrix required.");
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++) a[i][j] = a[j][i] = (a[i][j] + a[j][i]) / 2;
  let rotations = 0;
  for (;;) {
    let p = 0,
      q = 0,
      max = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(a[i][j]) > max) {
          max = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
    if (max <= 1e-13 * scale) break;
    if (rotations++ >= 2000) throw Error("Jacobi did not converge.");
    const tau = (a[q][q] - a[p][p]) / (2 * a[p][q]),
      t =
        tau >= 0
          ? 1 / (tau + Math.hypot(1, tau))
          : -1 / (-tau + Math.hypot(1, tau)),
      c = 1 / Math.sqrt(1 + t * t),
      s = t * c,
      apq = a[p][q];
    a[p][p] -= t * apq;
    a[q][q] += t * apq;
    a[p][q] = a[q][p] = 0;
    for (let r = 0; r < n; r++) {
      if (r !== p && r !== q) {
        const ap = a[r][p],
          aq = a[r][q];
        a[r][p] = a[p][r] = c * ap - s * aq;
        a[r][q] = a[q][r] = s * ap + c * aq;
      }
      const vp = v[r][p],
        vq = v[r][q];
      v[r][p] = c * vp - s * vq;
      v[r][q] = s * vp + c * vq;
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort(
      (i, j) => a[j][j] - a[i][i],
    ),
    values = order.map((i) => a[i][i]),
    vectors = order.map((col) => {
      let pivot = 0;
      for (let j = 0; j < n; j++)
        if (Math.abs(v[j][col]) > Math.abs(v[pivot][col]) + 1e-12) pivot = j;
      const sign = v[pivot][col] < 0 ? -1 : 1;
      return v.map((row) => row[col] * sign);
    });
  let residual = 0,
    orthogonality = 0;
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++) {
      let z = 0,
        dot = 0;
      for (let r = 0; r < n; r++) {
        z += matrix[j][r] * vectors[k][r];
        dot += vectors[k][r] * vectors[j][r];
      }
      residual = Math.max(residual, Math.abs(z - values[k] * vectors[k][j]));
      orthogonality = Math.max(
        orthogonality,
        Math.abs(dot - (k === j ? 1 : 0)),
      );
    }
  return { values, vectors, residual, orthogonality, rotations };
}
export function fit(data, train, keep) {
  if (
    !Array.isArray(data) ||
    data.length < 3 ||
    data.length > 96 ||
    !Number.isInteger(train) ||
    train < 2 ||
    train >= data.length ||
    !Number.isInteger(keep) ||
    keep < 1 ||
    keep > 6
  )
    throw Error("Fit dimensions invalid.");
  for (const row of Array.from(data)) {
    if (
      !Array.isArray(row) ||
      row.length !== 6 ||
      Array.from(row).some((z) => !Number.isFinite(z) || Math.abs(z) > 100)
    )
      throw Error("Six finite changes |bps|<=100 required.");
  }
  const n = data.length,
    mean = Array(6).fill(0);
  for (let i = 0; i < train; i++)
    for (let j = 0; j < 6; j++) mean[j] += data[i][j] / train;
  const covariance = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (let j = 0; j < 6; j++)
    for (let k = 0; k <= j; k++) {
      let z = 0;
      for (let i = 0; i < train; i++)
        z += (data[i][j] - mean[j]) * (data[i][k] - mean[k]);
      covariance[j][k] = covariance[k][j] = z / (train - 1);
    }
  const eig = eigen(covariance),
    total = eig.values.reduce((a, b) => a + b, 0),
    shares = eig.values.map((val) => {
      if (val < -1e-9 * Math.max(1, total)) throw Error("Non-PSD covariance.");
      return total <= 1e-20 ? null : Math.max(0, val) / total;
    }),
    captured =
      total <= 1e-20 ? null : shares.slice(0, keep).reduce((a, b) => a + b, 0),
    scores = Array.from({ length: n }, () => Array(6).fill(0)),
    reconstructed = Array.from({ length: n }, () => Array(6).fill(0)),
    residual = Array.from({ length: n }, () => Array(6).fill(0));
  let trainSse = 0,
    heldoutSse = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++)
      for (let j = 0; j < 6; j++)
        scores[i][k] += (data[i][j] - mean[j]) * eig.vectors[k][j];
    for (let j = 0; j < 6; j++) {
      reconstructed[i][j] = mean[j];
      for (let k = 0; k < keep; k++)
        reconstructed[i][j] += scores[i][k] * eig.vectors[k][j];
      residual[i][j] = data[i][j] - reconstructed[i][j];
      if (i < train) trainSse += residual[i][j] ** 2;
      else heldoutSse += residual[i][j] ** 2;
    }
  }
  return {
    mean,
    covariance,
    eigen: eig,
    scores,
    reconstructed,
    residual,
    shares,
    captured,
    trainRmse: Math.sqrt(trainSse / (train * 6)),
    heldoutRmse: Math.sqrt(heldoutSse / ((n - train) * 6)),
    trainSse,
    heldoutSse,
  };
}
export function run(p) {
  validate(p);
  const changes = generate(p),
    levels = [tenors().map((t) => 3 + 0.2 * Math.log1p(t))];
  for (let i = 0; i < 96; i++)
    levels.push(levels[i].map((v, j) => v + changes[i][j] / 100));
  return { changes, levels, fit: fit(changes, p.train, p.keep) };
}
