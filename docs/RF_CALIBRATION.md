# TRACE RF Path-Loss Calibration Guide

## 1. Mathematical Foundation

The TRACE distance estimation engine translates Received Signal Strength Indicator (RSSI) measurements into approximate radial distances using the Log-Distance Path-Loss Model:

$$\text{RSSI}(d) = A_0 - 10 \cdot n \cdot \log_{10}\left(\frac{d}{d_0}\right) + X_\sigma$$

Where:

- $d$: Radial distance from the signal source to the sniffer antenna in meters.
- $d_0$: Reference distance, standardized to $1.0\text{ m}$.
- $A_0$: Fitted signal power at reference distance $d_0$ (expressed in $\text{dBm}$).
- $n$: Path-loss exponent reflecting the structural propagation environment.
- $X_\sigma$: Zero-mean Gaussian random variable representing log-normal shadow fading.

---

## 2. Ordinary Least Squares (OLS) Closed-Form Solver

To determine $A_0$ and $n$ from a collection of $N$ calibration measurements $\{(d_i, \text{RSSI}_i)\}_{i=1}^N$:

1. Transform distances into logarithmic scale:
   $$x_i = 10 \cdot \log_{10}\left(\frac{d_i}{d_0}\right), \quad y_i = \text{RSSI}_i$$

2. Calculate sample means:
   $$\bar{x} = \frac{1}{N}\sum_{i=1}^N x_i, \quad \bar{y} = \frac{1}{N}\sum_{i=1}^N y_i$$

3. Compute covariances and variances:
   $$S_{xx} = \sum_{i=1}^N (x_i - \bar{x})^2, \quad S_{xy} = \sum_{i=1}^N (x_i - \bar{x})(y_i - \bar{y}), \quad S_{yy} = \sum_{i=1}^N (y_i - \bar{y})^2$$

4. Solve for parameters:
   $$\beta = \frac{S_{xy}}{S_{xx}} \implies n = -\beta, \quad A_0 = \bar{y} - \beta \cdot \bar{x}$$

5. Compute goodness-of-fit diagnostics:
   $$\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^N \left(y_i - [A_0 - 10 \cdot n \cdot \log_{10}(d_i / d_0)]\right)^2}$$
   $$R^2 = 1 - \frac{\sum_{i=1}^N (y_i - \hat{y}_i)^2}{S_{yy}}$$

---

## 3. Physical Bound Checks & Diagnostics

| Diagnostic Parameter                       | Acceptance Threshold            | Warning Condition             | Physical Implication                                               |
| :----------------------------------------- | :------------------------------ | :---------------------------- | :----------------------------------------------------------------- |
| **Path-Loss Exponent ($n$)**               | $1.6 \le n \le 4.5$             | $n < 1.4$                     | Waveguide effect / tunnel multipath reflection.                    |
|                                            |                                 | $n > 4.8$                     | Severe concrete / rebar attenuation or deep rubble obstruction.    |
| **Coefficient of Determination ($R^2$)**   | $R^2 \ge 0.65$                  | $R^2 < 0.60$                  | High multipath variance; distance estimates will have wide spread. |
| **Root-Mean-Square Error ($\text{RMSE}$)** | $\text{RMSE} \le 5.0\text{ dB}$ | $\text{RMSE} > 8.0\text{ dB}$ | Erratic RF readings. Require additional sample averaging.          |
| **Distinct Distances**                     | $\ge 3$ distinct distances      | $< 2$ distinct distances      | Degenerate regression. Regression is rejected as invalid.          |

---

## 4. Field Calibration Procedure

1. **Navigate to Devices & Calibration**: Open `http://localhost:3000/devices` and select the **RF Calibration** tab.
2. **Configure Environmental Context**:
   - Environment Name: e.g., _"Collapsed Wing B Concrete Rubble"_
   - Radio Band: `2.4 GHz BLE` or `868 MHz LoRa`
   - Reference Distance: Default `1.0 m`
3. **Record Reference Samples**:
   - Position a test beacon at a measured tape-line distance (e.g., $1.0\text{ m}, 3.0\text{ m}, 5.0\text{ m}, 10.0\text{ m}$).
   - Click **Capture from Live Sniffer** or manually input distance and observed RSSI.
   - Record at least 2 samples per distance to average fast-fading effects.
4. **Inspect Regression Diagnostics**:
   - Review the calculated $A_0, n, \text{RMSE},$ and $R^2$.
   - Confirm that the residual plot displays no severe outliers ($> 15\text{ dB}$).
5. **Save and Activate Profile**:
   - Click **Save & Activate Profile**.
   - The active profile is instantly persisted to the SQLite database and loaded into the live multilateration solver.
