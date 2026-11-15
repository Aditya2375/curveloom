package curveloom;

/** Covariance PCA of invented six-tenor yield changes, in basis points. */
public final class Engine {
  private Engine() {}

  public static final int ROWS = 96, DIM = 6;

  public record Params(
      double level, double slope, double curve, double ripple, int train, int keep) {}

  public record Eigen(
      double[] values, double[][] vectors, double residual, double orthogonality, int rotations) {}

  public record Fit(
      double[] mean,
      double[][] covariance,
      Eigen eigen,
      double[][] scores,
      double[][] reconstructed,
      double[][] residual,
      double[] shares,
      double captured,
      double trainRmse,
      double heldoutRmse,
      double trainSse,
      double heldoutSse) {}

  public record Result(double[][] changes, double[][] levels, Fit fit) {}

  public static double[] tenors() {
    return new double[] {.25, 1, 2, 5, 10, 30};
  }

  public static void validate(Params p) {
    if (p == null
        || !Double.isFinite(p.level)
        || p.level < 0
        || p.level > 12
        || !Double.isFinite(p.slope)
        || p.slope < 0
        || p.slope > 8
        || !Double.isFinite(p.curve)
        || p.curve < 0
        || p.curve > 6
        || !Double.isFinite(p.ripple)
        || p.ripple < 0
        || p.ripple > 3
        || (p.train != 48 && p.train != 72)
        || p.keep < 1
        || p.keep > 6)
      throw new IllegalArgumentException(
          "Amplitudes: level0..12, slope0..8, curve0..6, ripple0..3bps; train48/72; keep1..6");
  }

  public static double[][] generate(Params p) {
    validate(p);
    double[][] x = new double[ROWS][DIM];
    double[] amp = {p.level, p.slope, p.curve, .75 * p.ripple, .5 * p.ripple, .25 * p.ripple};
    for (int i = 0; i < ROWS; i++) {
      double t = i + 1;
      for (int j = 0; j < DIM; j++) {
        x[i][j] = .05 * (j - 2.5);
        for (int k = 0; k < DIM; k++) {
          double
              v =
                  k == 0
                      ? 1 / Math.sqrt(6)
                      : Math.sqrt(2.0 / 6) * Math.cos(Math.PI * k * (j + .5) / 6),
              z =
                  Math.sin((.31 + .23 * k) * t + .4 * k)
                      + .35 * Math.cos((.13 + .17 * k) * t - .2 * k);
          x[i][j] += amp[k] * z * v;
        }
      }
    }
    return x;
  }

  /** Largest-pivot Jacobi, eigenvectors stored as [component][tenor]. */
  public static Eigen eigen(double[][] matrix) {
    if (matrix == null || matrix.length < 1 || matrix.length > DIM)
      throw new IllegalArgumentException("Matrix1..6 square required");
    int n = matrix.length;
    double[][] a = new double[n][n], v = new double[n][n];
    double scale = 1;
    for (int i = 0; i < n; i++) {
      if (matrix[i] == null || matrix[i].length != n)
        throw new IllegalArgumentException("Square matrix required");
      for (int j = 0; j < n; j++) {
        double z = matrix[i][j];
        if (!Double.isFinite(z) || Math.abs(z) > 100000)
          throw new IllegalArgumentException("Bounded finite matrix required");
        a[i][j] = z;
        scale = Math.max(scale, Math.abs(z));
      }
      v[i][i] = 1;
    }
    for (int i = 0; i < n; i++)
      for (int j = 0; j < n; j++)
        if (Math.abs(a[i][j] - a[j][i]) > 1e-12 * scale)
          throw new IllegalArgumentException("Symmetric matrix required");
    for (int i = 0; i < n; i++)
      for (int j = 0; j < i; j++) a[i][j] = a[j][i] = (a[i][j] + a[j][i]) / 2;
    int rotations = 0;
    while (true) {
      int p = 0, q = 0;
      double max = 0;
      for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
          if (Math.abs(a[i][j]) > max) {
            max = Math.abs(a[i][j]);
            p = i;
            q = j;
          }
      if (max <= 1e-13 * scale) break;
      if (rotations++ >= 2000) throw new IllegalArgumentException("Jacobi did not converge");
      double tau = (a[q][q] - a[p][p]) / (2 * a[p][q]),
          t = tau >= 0 ? 1 / (tau + Math.hypot(1, tau)) : -1 / (-tau + Math.hypot(1, tau)),
          c = 1 / Math.sqrt(1 + t * t),
          s = t * c,
          apq = a[p][q];
      a[p][p] -= t * apq;
      a[q][q] += t * apq;
      a[p][q] = a[q][p] = 0;
      for (int r = 0; r < n; r++) {
        if (r != p && r != q) {
          double ap = a[r][p], aq = a[r][q];
          a[r][p] = a[p][r] = c * ap - s * aq;
          a[r][q] = a[q][r] = s * ap + c * aq;
        }
        double vp = v[r][p], vq = v[r][q];
        v[r][p] = c * vp - s * vq;
        v[r][q] = s * vp + c * vq;
      }
    }
    Integer[] order = new Integer[n];
    for (int i = 0; i < n; i++) order[i] = i;
    java.util.Arrays.sort(order, (i, j) -> Double.compare(a[j][j], a[i][i]));
    double[] values = new double[n];
    double[][] vectors = new double[n][n];
    for (int k = 0; k < n; k++) {
      int col = order[k], pivot = 0;
      values[k] = a[col][col];
      for (int j = 0; j < n; j++) {
        vectors[k][j] = v[j][col];
        if (Math.abs(v[j][col]) > Math.abs(v[pivot][col]) + 1e-12) pivot = j;
      }
      if (v[pivot][col] < 0) for (int j = 0; j < n; j++) vectors[k][j] *= -1;
    }
    double res = 0, ortho = 0;
    for (int k = 0; k < n; k++)
      for (int j = 0; j < n; j++) {
        double z = 0, dot = 0;
        for (int r = 0; r < n; r++) {
          z += matrix[j][r] * vectors[k][r];
          dot += vectors[k][r] * vectors[j][r];
        }
        res = Math.max(res, Math.abs(z - values[k] * vectors[k][j]));
        ortho = Math.max(ortho, Math.abs(dot - (k == j ? 1 : 0)));
      }
    return new Eigen(values, vectors, res, ortho, rotations);
  }

  public static Fit fit(double[][] data, int train, int keep) {
    if (data == null
        || data.length < 3
        || data.length > ROWS
        || train < 2
        || train >= data.length
        || keep < 1
        || keep > DIM) throw new IllegalArgumentException("Fit dimensions invalid");
    int n = data.length;
    for (var row : data) {
      if (row == null || row.length != DIM)
        throw new IllegalArgumentException("Six tenors required");
      for (double z : row)
        if (!Double.isFinite(z) || Math.abs(z) > 100)
          throw new IllegalArgumentException("Finite changes |bps|<=100 required");
    }
    double[] mean = new double[DIM];
    for (int i = 0; i < train; i++) for (int j = 0; j < DIM; j++) mean[j] += data[i][j] / train;
    double[][] cov = new double[DIM][DIM];
    for (int j = 0; j < DIM; j++)
      for (int k = 0; k <= j; k++) {
        double z = 0;
        for (int i = 0; i < train; i++) z += (data[i][j] - mean[j]) * (data[i][k] - mean[k]);
        cov[j][k] = cov[k][j] = z / (train - 1);
      }
    var e = eigen(cov);
    double total = 0;
    for (double val : e.values) total += val;
    double[] shares = new double[DIM];
    double cap = 0;
    for (int k = 0; k < DIM; k++) {
      if (e.values[k] < -1e-9 * Math.max(1, total))
        throw new IllegalArgumentException("Non-PSD covariance");
      shares[k] = total <= 1e-20 ? Double.NaN : Math.max(0, e.values[k]) / total;
      if (k < keep) cap += shares[k];
    }
    double[][] scores = new double[n][DIM], hat = new double[n][DIM], residual = new double[n][DIM];
    double ss = 0, hs = 0;
    for (int i = 0; i < n; i++) {
      for (int k = 0; k < DIM; k++)
        for (int j = 0; j < DIM; j++) scores[i][k] += (data[i][j] - mean[j]) * e.vectors[k][j];
      for (int j = 0; j < DIM; j++) {
        hat[i][j] = mean[j];
        for (int k = 0; k < keep; k++) hat[i][j] += scores[i][k] * e.vectors[k][j];
        residual[i][j] = data[i][j] - hat[i][j];
        if (i < train) ss += residual[i][j] * residual[i][j];
        else hs += residual[i][j] * residual[i][j];
      }
    }
    return new Fit(
        mean,
        cov,
        e,
        scores,
        hat,
        residual,
        shares,
        cap,
        Math.sqrt(ss / (train * DIM)),
        Math.sqrt(hs / ((n - train) * DIM)),
        ss,
        hs);
  }

  public static Result run(Params p) {
    validate(p);
    var x = generate(p);
    double[][] y = new double[ROWS + 1][DIM];
    var ten = tenors();
    for (int j = 0; j < DIM; j++) y[0][j] = 3 + .2 * Math.log1p(ten[j]);
    for (int i = 0; i < ROWS; i++)
      for (int j = 0; j < DIM; j++) y[i + 1][j] = y[i][j] + x[i][j] / 100;
    return new Result(x, y, fit(x, p.train, p.keep));
  }
}
