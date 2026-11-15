# curveloom

A Java-first yield-change PCA lab with a dependency-free browser mirror. Decompose 96 invented six-tenor yield changes into covariance principal components, retain fewer directions, and audit every reconstruction residual.

## What it does

- Six maturities: 0.25, 1, 2, 5, 10 and 30 years; all changes in basis points.
- Adjustable amplitudes for invented level-, slope-, curve- and ripple-shaped generating moves.
- Fit first 48 or 72 changes, with frozen tenor means and loading vectors thereafter.
- Original largest-pivot Jacobi eigensolver for a 6×6 sample covariance matrix, no runtime numerical library.
- Keep 1 to 6 components; see all eigenvalues, variance shares, unit loading vectors and selected scores.
- Linear-maturity loading and reconstruction charts, six-tenor contribution inspector, and 576-row full audit.
- Illustrative before/after yields in percent; not inputs to PCA, bond prices or returns.

The generator controls are not PC variances or forecasts. Estimated PCs can mix generating shapes, so no automatic level/slope/curvature economic labels are assigned. Signs are arbitrary; repeated eigenvalues make individual eigenvectors non-unique. PCA scores are uncorrelated in the training sample, not independent or causal.

## Run locally

Java 21+:

```sh
javac -d build/classes src/curveloom/*.java tools/*.java tests/curveloom/*.java
java -cp build/classes curveloom.TestRunner
java -cp build/classes Dump 8 4 2 1 72 3
```

Browser demo, Python 3:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Open the printed local address. No installation or runtime packages. `docs/` contains static files built from `web/`.

Build/test tools, Node 22+ and Python 3:

```sh
node tools/build-web.mjs
node tests/parity.mjs
node tests/domain.mjs
python3 tests/reference.py
node tests/browser-smoke.mjs
```

Java must be available as `java`, or set `JAVA` for parity/reference checks. Browser smoke needs Google Chrome as `google-chrome`. Optional `SMOKE_URL` tests a deployed site; `SMOKE_SHOTS=1` saves local screenshots. Build and test artifacts are excluded from source control.

## Interpretation

Covariance PCA of **changes**, not PCA of yield levels. Every tenor has the same bps scale and equal weight. No per-tenor variance standardization or maturity-spacing weights. Sample covariance divides by n−1; RMSE divides by rows × 6. Variance captured is a training share, not a held-out prediction statistic. 1 bp = 0.01 percentage point; illustrative yield levels accumulate change / 100 in percent.

Held-out scores use the entire contemporaneous observed six-tenor change. Frozen means and loading vectors prevent refitting, but reconstruction is still compression of observed data, not a forecast, a hedge or a backtest. Keeping all six components reconstructs even held-out inputs because the basis spans all six dimensions, not because it predicts them. Zero training variance makes variance shares unavailable.

See [NUMERICS.md](NUMERICS.md) for equations, bounds, rotation convention, normalization, diagnostics and reference tests. The eigensolver is bounded educational code, not a general numerical-accuracy guarantee for tiny or closely spaced eigenvalues. No statistical inference, confidence intervals or economic identification. Native Safari/Android are not tested.

No market data, accounts, uploads, browser storage, telemetry, runtime network calls, broker keys, real orders or paid service. Links load only when a visitor follows them. No external code, datasets, papers, fonts or assets are bundled. Educational model, not investment advice.

## Background

- [MIT: yield-change PCA](https://ocw.mit.edu/courses/18-642-topics-in-mathematics-with-applications-in-finance-fall-2024/mit18_642_f24_pset_analysis.pdf).
- [Bank of Canada: yield-curve dynamics](https://www.bankofcanada.ca/wp-content/uploads/2010/06/johnson.pdf).
- [CMU: dimension reduction and hidden structure](https://stat.cmu.edu/~larry/=sml/DimRed.pdf).
- [Dmitry Kobak: covariance and correlation PCA](https://dkobak.github.io/teaching/ml1/kobak_ml1_lecture10_pca_handout.pdf).
- [Institute and Faculty of Actuaries: illustrative yield-curve components](https://www.actuaries.org.uk/system/files/documents/pdf/stresstestworkingparty.pdf).
- [Encyclopedia of Mathematics: rotation method](https://encyclopediaofmath.org/wiki/Rotation_method).
- [Cornell: symmetric eigenvalue methods](https://www.cs.cornell.edu/~bindel/class/cs6210-f16/lec/2016-10-31.pdf).

Original code is available under **MIT OR Apache-2.0**. Choose either [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
