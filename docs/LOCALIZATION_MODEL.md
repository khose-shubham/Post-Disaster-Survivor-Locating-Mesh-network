# TRACE 2D Multilateration & Localization Model

## 1. Overview & System Assumptions

The TRACE localization engine estimates the 2D spatial coordinate of civilian crowd signals using RSSI-derived ranges from distributed sniffer anchors. Because RF signals in collapsed structural environments suffer from severe shadowing, multipath reflections, and non-line-of-sight (NLOS) attenuation, TRACE treats all calculated positions as **probabilistic search-priority areas**, never as confirmed survivor locations.

---

## 2. Mathematical Formulation

### A. Distance Inversion from RSSI

For each reporting sniffer anchor $i \in \{1, \dots, M\}$ with observed RSSI $\rho_i$, the estimated distance $r_i$ is inverted from the active calibration profile $(A_0, n)$:

$$r_i = d_0 \cdot 10^{\frac{A_0 - \rho_i}{10 \cdot n}}$$

### B. Linearized Matrix Multilateration

Each anchor $i$ at known local coordinates $(x_i, y_i)$ defines a circular locus:

$$(x - x_i)^2 + (y - y_i)^2 = r_i^2$$

Expanding and subtracting the equation of a reference anchor $k$ (typically the anchor with the highest RSSI) yields a linear system:

$$2(x_i - x_k)x + 2(y_i - y_k)y = (r_k^2 - r_i^2) + (x_i^2 - x_k^2) + (y_i^2 - y_k^2)$$

Expressed in matrix form:

$$\mathbf{A} \mathbf{p} = \mathbf{b}$$

Where:
$$\mathbf{A} = \begin{bmatrix} 2(x_1 - x_k) & 2(y_1 - y_k) \\ \vdots & \vdots \\ 2(x_M - x_k) & 2(y_M - y_k) \end{bmatrix}, \quad \mathbf{p} = \begin{bmatrix} x \\ y \end{bmatrix}$$

$$\mathbf{b} = \begin{bmatrix} r_k^2 - r_1^2 + (x_1^2 - x_k^2) + (y_1^2 - y_k^2) \\ \vdots \\ r_k^2 - r_M^2 + (x_M^2 - x_k^2) + (y_M^2 - y_k^2) \end{bmatrix}$$

### C. Weighted Least Squares (WLS) Solution

Because closer anchors with higher RSSI have lower variance, observations are weighted by:

$$w_i = \left(\frac{\rho_i - \rho_{\text{min}}}{\rho_{\text{max}} - \rho_{\text{min}}}\right)^2$$

The optimal estimate $\hat{\mathbf{p}}$ is solved via:

$$\hat{\mathbf{p}} = (\mathbf{A}^T \mathbf{W} \mathbf{A})^{-1} \mathbf{A}^T \mathbf{W} \mathbf{b}$$

---

## 3. Geometric Dilution of Precision (GDOP) & Collinearity

When sniffer anchors are arranged along a straight line (collinear configuration), the matrix $\mathbf{A}^T \mathbf{W} \mathbf{A}$ becomes ill-conditioned ($\det \to 0$). In this situation:

- Position uncertainty along the orthogonal axis approaches infinity.
- The engine computes a triangle area / spatial divergence metric:
  $$\text{Coverage} = \frac{4 \cdot \text{Area}(\triangle N_1 N_2 N_3)}{\sum \text{EdgeLength}^2}$$
- If $\text{Coverage} < 0.25$, the localization run is flagged as `COLLINEAR_ANCHORS` and rejected.

---

## 4. Operational Status Codes

| Engine Status        | Meaning                                                      | Rescue Operator Action                                             |
| :------------------- | :----------------------------------------------------------- | :----------------------------------------------------------------- |
| `ESTIMATE_AVAILABLE` | Non-degenerate 2D fix with acceptable residual.              | Dispatch search team to investigate indicated search zone.         |
| `INSUFFICIENT_NODES` | Fewer than 3 active sniffers reported the target.            | Deploy additional sniffer anchors to establish perimeter coverage. |
| `POOR_GEOMETRY`      | Anchor positions are nearly collinear ($\text{GDOP} > 6.0$). | Reposition at least one anchor out of the straight line.           |
| `STALE_DATA`         | Measurements exceed maximum age ($> 60\text{ s}$).           | Re-acquire fresh crowd signal packets.                             |
| `HIGH_RESIDUAL`      | Solution root-mean-square residual $> 15\text{ m}$.          | Re-calibrate RF path loss model or inspect for heavy shielding.    |
