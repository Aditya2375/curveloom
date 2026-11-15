import curveloom.Engine;

public class Dump {
  public static void main(String[] a) {
    var p =
        new Engine.Params(
            Double.parseDouble(a[0]),
            Double.parseDouble(a[1]),
            Double.parseDouble(a[2]),
            Double.parseDouble(a[3]),
            Integer.parseInt(a[4]),
            Integer.parseInt(a[5]));
    var r = Engine.run(p);
    var f = r.fit();
    System.out.println(
        "H,"
            + f.captured()
            + ","
            + f.trainRmse()
            + ","
            + f.heldoutRmse()
            + ","
            + f.trainSse()
            + ","
            + f.heldoutSse());
    for (int j = 0; j < 6; j++) {
      System.out.println(
          "E," + j + "," + f.eigen().values()[j] + "," + f.shares()[j] + "," + f.mean()[j]);
      for (int k = 0; k < 6; k++)
        System.out.println(
            "V," + j + "," + k + "," + f.eigen().vectors()[j][k] + "," + f.covariance()[j][k]);
    }
    for (int i = 0; i < 96; i++)
      for (int j = 0; j < 6; j++)
        System.out.println(
            "X,"
                + i
                + ","
                + j
                + ","
                + r.changes()[i][j]
                + ","
                + r.levels()[i + 1][j]
                + ","
                + f.scores()[i][j]
                + ","
                + f.reconstructed()[i][j]
                + ","
                + f.residual()[i][j]);
  }
}
