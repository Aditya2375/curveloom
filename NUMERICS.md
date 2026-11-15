# Numerical contract

## Panel and units

96 deterministic synthetic change observations, six tenors [0.25,1,2,5,10,30] years. No dates, business calendar, market data, downloaded yields or day-count convention. A row is an invented daily-shaped change, not a calibrated daily risk distribution. Changes use bps; levels use percent; 1 bp = 0.01 percentage point. No change standardization or maturity-spacing weights. Covariance PCA weights every tenor equally, so spacing and feature choice affect the result.

Generating controls: level amplitude L in [0,12], slope S in [0,8], curve C in [0,6], ripple R in [0,3], all bps, finite. Training prefix exactly 48 or 72, retained component count integer 1..6. Defaults L8/S4/C2/R1/n72/k3. Amplitudes are not standard deviations or factor variances. Parameter names describe generating shapes, not estimated PCA directions.

For observation t=1..96 and tenor index j=0..5, define an orthonormal discrete cosine basis:

```
v[0,j] = 1 / sqrt(6)
v[k,j] = sqrt(2/6) cos(pi k (j+0.5)/6), k=1..5
A = [L,S,C,0.75R,0.5R,0.25R]
z[t,k] = sin((0.31+0.23k)t + 0.4k) + 0.35 cos((0.13+0.17k)t - 0.2k)
x[t,j] = 0.05(j-2.5) + sum[k=0..5] A[k] z[t,k] v[k,j]
```

Basis shapes use tenor **index**, not a polynomial of years. The plotted maturity axis uses actual linear years. The generated time patterns can be correlated over a finite prefix, so PCA may mix the known shapes. No random generator or iid/distribution assumption. No regime claim.

Illustrative initial yields y[0,j] = 3 + 0.2 log(1 + tenor[j]) percent. y[t,j] = y[t-1,j] + x[t,j]/100. These levels are display-only context and not fit inputs. No cash flow, price, return, duration, no-arbitrage or economic calibration. Changing training prefix does not alter the generated data.

## Fit and projection

Mean mu[j] = sum first n x[t,j] / n. Centered training X[t,j] = x[t,j] - mu[j]. Sample covariance C = XᵀX/(n-1), bps². No correlation matrix, demeaning of held-out rows by their own mean, whitening or variance scaling.

Eigenvalues lambda sorted descending, unit eigenvectors V[k,j] stored as component rows. Scores s[t,k] = sum[j] (x[t,j]-mu[j])V[k,j], bps. Reconstruction xhat[t,j] = mu[j] + sum[k<keep] s[t,k]V[k,j]. Residual = x - xhat. Mean is always included, not counted as a component. An omitted component's score can be nonzero; it is excluded from reconstruction.

For held-out rows, use the training means and vectors unchanged but compute scores from that row's **observed full six-tenor changes**. This is conditional reconstruction/compression, not ex-ante forecasting or a tradable test. All-six-component exact reconstruction holds on held-out rows because the basis spans the input space. No claim of future predictive skill follows.

Training score covariance is diagonal up to numerical error; this does not imply independence, causality or that held-out scores remain uncorrelated. Eigenvector signs are arbitrary. For reproducible display, the largest absolute component is positive, preferring the first index when the absolute difference is at most 1e-12. Negating one eigenvector and its scores leaves the reconstruction unchanged. Repeated eigenvalues allow arbitrary rotations within the eigenspace; near-degeneracy can make single-vector interpretations unstable. No economic label is automatically assigned to fitted PCs.

## Eigensolver

Own largest-off-diagonal-pivot Jacobi, with symmetric plane rotations A <- JᵀAJ and accumulated vectors. t = sign(tau)/(|tau| + hypot(1,tau)), tau=(Aqq-App)/(2Apq), sign(0)=+1; c=1/sqrt(1+t²), s=t c. Update diagonals App -= t Apq, Aqq += t Apq; off-diagonal pair set to zero. For r outside p,q, Arp=c oldArp-s oldArq, Arq=s oldArp+c oldArq; mirror symmetric positions. Vector columns rotate the same way. Sort final diagonal and matching vector columns.

Stop when largest absolute off-diagonal <=1e-13 × max(1, largest original absolute entry). Cap 2000 rotations, then refuse rather than return an unconverged answer. `eigen` accepts square dimensions 1..6, finite entries <=100000 in absolute value, symmetry within 1e-12 times that scale; average accepted near-symmetric pairs. It copies inputs. It may solve indefinite symmetric matrices; PSD is checked in the covariance-fit path, not a general eigen helper precondition. Diagnostic eigen residual uses the original accepted matrix, including any allowed asymmetry.

`fit` accepts 3..96 rows of exactly six finite changes |x|<=100bps, prefix integer2..rows-1 and retained integer1..6. Generated UI uses only the narrower supported training prefixes. Missing/sparse rows or entries are rejected. No external import route. Compute non-PSD refusal if any eigenvalue < -1e-9 × max(1, trace). Very small negative eigenvalues from rounding are set to zero only in variance shares, not hidden in the raw eigenvalues or discarded-eigenvalue identity. The displayed six-decimal eigenvalue can round to zero.

An absolute floor in the stopping scale means no high-relative-accuracy guarantee for tiny eigenvalues; covariance formation also loses information at extreme conditioning. This is bounded teaching code, not a substitute for tested SVD libraries on arbitrary data. Close/repeated eigenvectors are not identified economic factors.

## Diagnostics

Total training variance = trace(C) = sum lambda, bps². Share[k] = max(0,lambda[k])/trace. If trace<=1e-20, shares and captured fraction are NaN Java/null JS/N/A UI; data with zero variance has no variance ranking. Captured = sum shares of retained components. Shares can differ from exact unit total by floating-point noise.

SSE = sum residual² over every row and tenor in the given split, bps². RMSE = sqrt(SSE/(split row count × 6)), bps per tenor-observation, not the Euclidean error of an entire curve and not a standard error. Training SSE = (n−1) sum discarded eigenvalues, up to rounding. Additional components cannot increase Euclidean reconstruction error for a fixed row under the same orthonormal basis. This is geometric compression, not evidence that future forecasts improve.

Max eigen residual = max |C v - lambda v|, bps². Orthogonality diagnostic = max |V Vᵀ - I|, unitless. These check numerical algebra, not fit adequacy, Gaussianity, factor stability, inference or causality. No confidence intervals, risk estimates, hedge or investment recommendation.

Plots connect six measured tenor coordinates on **linear years**, not equal categories or model interpolation between maturities. Loading plot shows first three eigenvectors even if fewer are kept; all six are in the table. Reconstruction plot uses actual observed and compressed changes. All tables use six decimals, with absolute values below half a millionth displayed as zero; calculations use full precision. Diagnostics use scientific notation near zero. Editing controls leaves applied results unchanged until submit; invalid input retains results; resizing and inspector use applied state.

## Tests

Java checks eigensystem residuals, orthogonality, sorted spectrum, trace, exact full-rank reconstruction, residual identities, sample covariance/discarded-eigenvalue normalization, score centering, bps-to-percent levels, known 2×2 eigenvalues3/1, repeated-eigenvalue basis, zero-variance handling, invalid bounds/matrices/rows and immutable matrix inputs. Altering all held-out changes leaves training means/eigenvalues/eigenvectors byte-identical. Java/JS parity compares the complete generated panel, levels, eigensystem, covariance, scores, reconstructions, residuals and summaries over nondegenerate cases plus the constant panel.

Independent Python stdlib reference computes covariance with fsum, then eigenvalues with 55-digit Decimal LDL-inertia bisection, not Jacobi. A separate known block-diagonal fixture checks that reference. It tests eigenvalues, covariance recovery, eigen equations, orthogonality and full generator/level data. Reconstruction uses an independent projection matrix rather than the production score-addition loop. It checks production eigenvectors by equations, not by adopting their eigenvalues as truth. No external numerical packages are required. Reference comparisons are for the fixed generated panels, not a claim of general near-degenerate identification.

Chrome tests all six eigenvalue/share rows, all36loadingcells, scores, all selected contribution cells, all576ledgerrows, every plotted coordinate, headings/identities/numericalchecks, constantN/A, keep6/fullreconstruction, extremes, blank/invalidretention, unappliedresize, widths768/390/360/320, two-axis ledger scrolling, errors/offorigin requests/storage/CSP. Near-zero eigen/orthogonality diagnostics use tolerances rather than exact last-bit strings across V8 engines. Native Safari/Android untested. Tests and static scans are evidence, not a formal proof.
