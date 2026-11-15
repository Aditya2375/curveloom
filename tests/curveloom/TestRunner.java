package curveloom;

public class TestRunner {
  static int count;

  static void ok(boolean b, String m) {
    count++;
    if (!b) throw new AssertionError(m);
  }

  static void eq(double a, double b, double t, String m) {
    ok(
        Math.abs(a - b) <= t * Math.max(1, Math.max(Math.abs(a), Math.abs(b))),
        m + " " + a + " " + b);
  }

  public static void main(String[] args) {
    for (double l : new double[] {0, 3, 12})
      for (double s : new double[] {0, 2, 8})
        for (double c : new double[] {0, 1, 6})
          for (double r : new double[] {0, 1, 3})
            for (int n : new int[] {48, 72}) {
              double old = Double.POSITIVE_INFINITY;
              for (int k = 1; k <= 6; k++) {
                var p = new Engine.Params(l, s, c, r, n, k);
                var out = Engine.run(p);
                var f = out.fit();
                ok(f.trainSse() <= old + 1e-8, "monotone");
                old = f.trainSse();
                eq(f.eigen().residual(), 0, 1e-9, "eigres");
                eq(f.eigen().orthogonality(), 0, 1e-12, "orthogonality");
                double trace = 0, sum = 0, discarded = 0;
                for (int j = 0; j < 6; j++) {
                  trace += f.covariance()[j][j];
                  sum += f.eigen().values()[j];
                  if (j >= k) discarded += f.eigen().values()[j];
                  if (j > 0)
                    ok(f.eigen().values()[j] <= f.eigen().values()[j - 1] + 1e-10, "sorted");
                }
                eq(trace, sum, 1e-12, "trace");
                eq(f.trainSse(), (n - 1) * discarded, 1e-8, "discardedidentity");
                if (l + s + c + r == 0) ok(Double.isNaN(f.captured()), "zerovarianceNA");
                else ok(f.captured() >= -1e-12 && f.captured() <= 1 + 1e-10, "capturedfraction");
                for (int i = 0; i < 96; i++)
                  for (int j = 0; j < 6; j++) {
                    eq(
                        f.reconstructed()[i][j] + f.residual()[i][j],
                        out.changes()[i][j],
                        1e-12,
                        "reconstruction");
                    eq(
                        100 * (out.levels()[i + 1][j] - out.levels()[i][j]),
                        out.changes()[i][j],
                        1e-11,
                        "bpspercent");
                    if (k == 6) eq(f.residual()[i][j], 0, 1e-11, "fullreconstruction");
                  }
                double maxMean = 0;
                for (int j = 0; j < 6; j++) {
                  double z = 0;
                  for (int i = 0; i < n; i++) z += f.scores()[i][j] / n;
                  maxMean = Math.max(maxMean, Math.abs(z));
                }
                eq(maxMean, 0, 1e-12, "scorescentered");
              }
            }
    var fixture = Engine.eigen(new double[][] {{2, 1}, {1, 2}});
    eq(fixture.values()[0], 3, 1e-13, "fixture3");
    eq(fixture.values()[1], 1, 1e-13, "fixture1");
    eq(Math.abs(fixture.vectors()[0][0]), 1 / Math.sqrt(2), 1e-13, "fixturevec");
    var id = Engine.eigen(new double[][] {{2, 0}, {0, 2}});
    eq(id.orthogonality(), 0, 1e-15, "degeneratebasis");
    var p = new Engine.Params(8, 4, 2, 1, 48, 3);
    var data = Engine.generate(p);
    var before = Engine.fit(data, 48, 3);
    for (int i = 48; i < 96; i++) for (int j = 0; j < 6; j++) data[i][j] += 30 * Math.sin(i + j);
    var after = Engine.fit(data, 48, 3);
    for (int j = 0; j < 6; j++) {
      eq(after.mean()[j], before.mean()[j], 0, "frozenmean");
      eq(after.eigen().values()[j], before.eigen().values()[j], 0, "frozeneigen");
      for (int k = 0; k < 6; k++)
        eq(after.eigen().vectors()[j][k], before.eigen().vectors()[j][k], 0, "frozenvectors");
    }
    for (double[][] bad :
        new double[][][] {null, {}, {{1, 2}, {3, 4}}, {{Double.NaN}}, {{100001}}}) {
      try {
        Engine.eigen(bad);
        throw new AssertionError("invalidaccepted");
      } catch (IllegalArgumentException good) {
        count++;
      }
    }

    for (int field = 0; field < 4; field++)
      for (double bad : new double[] {Double.NaN, Double.POSITIVE_INFINITY, -1, 100}) {
        double[] a = {8, 4, 2, 1};
        a[field] = bad;
        try {
          Engine.run(new Engine.Params(a[0], a[1], a[2], a[3], 72, 3));
          throw new AssertionError("badparam");
        } catch (IllegalArgumentException good) {
          count++;
        }
      }
    for (int window : new int[] {-1, 0, 1, 49, 96})
      try {
        Engine.run(new Engine.Params(8, 4, 2, 1, window, 3));
        throw new AssertionError("badwindow");
      } catch (IllegalArgumentException good) {
        count++;
      }
    for (int keep : new int[] {-1, 0, 7})
      try {
        Engine.run(new Engine.Params(8, 4, 2, 1, 72, keep));
        throw new AssertionError("badkeep");
      } catch (IllegalArgumentException good) {
        count++;
      }
    for (double bad : new double[] {Double.NaN, Double.POSITIVE_INFINITY, -101, 101}) {
      var d = Engine.generate(p);
      d[90][2] = bad;
      try {
        Engine.fit(d, 72, 3);
        throw new AssertionError("badrow");
      } catch (IllegalArgumentException good) {
        count++;
      }
    }
    double[][] fixtureCopy = {{3, 1, 0}, {1, 4, 2}, {0, 2, 5}};
    double[][] copy = {{3, 1, 0}, {1, 4, 2}, {0, 2, 5}};
    Engine.eigen(fixtureCopy);
    for (int i = 0; i < 3; i++)
      for (int j = 0; j < 3; j++) eq(fixtureCopy[i][j], copy[i][j], 0, "unmutatedmatrix");
    System.out.println(count + " Java assertions passed");
  }
}
