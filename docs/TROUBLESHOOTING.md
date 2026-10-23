# TRACE Troubleshooting & Diagnostic Guide

## 1. Map & Coordinate Diagnostics

### Problem: Map markers or search zones appear stretched into ovals

- **Cause**: Non-uniform aspect ratio scaling ($S_x \ne S_y$) was previously used.
- **Resolution**: TRACE v2.4 employs uniform metric scaling based on local latitude ($S_x = S_y = S$), guaranteeing true geometric circular uncertainty regions.

### Problem: Map displays "Incident coordinates not configured"

- **Cause**: The active incident record lacks configured latitude and longitude.
- **Resolution**: Open **Incident History** (`/history`), select the incident, or configure GPS coordinates in the database. TRACE automatically falls back to the reporting nodes' centroid so tactical operations can continue.

### Problem: Zero coordinates (0.0, 0.0) discarded

- **Cause**: Falsy checks (`if (lat)`) instead of `typeof lat === "number" && Number.isFinite(lat)`.
- **Resolution**: TRACE explicitly treats `(0.0, 0.0)` as a valid geographic point (Null Island).

---

## 2. Hardware Connectivity & Gateway

### Problem: Gateway Status displays "OFFLINE / DISCONNECTED"

- **Check 1**: Is the ESP32 gateway plugged in via USB?
  ```powershell
  # List active COM ports in PowerShell
  [System.IO.Ports.SerialPort]::GetPortNames()
  ```
- **Check 2**: Is the serial bridge daemon running?
  ```bash
  python scripts/trace_gateway_daemon.py --port COM3 --baud 115200
  ```
- **Check 3**: Did another application lock the COM port (e.g., Arduino IDE Serial Monitor, Cura)? Close conflicting serial monitors.

### Problem: Serial Daemon reports "JSONDecodeError"

- **Cause**: Baud rate mismatch or electrical noise on UART lines.
- **Resolution**: Confirm that both the microcontroller firmware `Serial.begin(115200)` and the daemon `--baud 115200` match.

---

## 3. RF Calibration & Localization

### Problem: Calibration Wizard shows "Insufficient distinct reference distances"

- **Cause**: All calibration samples were collected at the exact same distance (e.g., $1.0\text{ m}$).
- **Resolution**: Record samples at at least 3 distinct measured distances (e.g., $1.0\text{ m}, 3.0\text{ m}, 5.0\text{ m}, 10.0\text{ m}$) to allow linear regression.

### Problem: "Insufficient Anchor Coverage (1/3 Online)"

- **Cause**: Multilateration requires at least 3 reporting stations to resolve a 2D spatial coordinate.
- **Resolution**: Deploy at least 2 additional sniffer stations around the disaster perimeter.
