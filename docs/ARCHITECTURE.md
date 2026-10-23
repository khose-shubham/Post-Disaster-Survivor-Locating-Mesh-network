# TRACE System Architecture & Pipeline Specification

## 1. End-to-End System Pipeline

The TRACE platform implements an asynchronous, decoupled pipeline designed for rapid RF signal acquisition, empirical path-loss calibration, multi-station multilateration, and operational 2D/3D visualization:

```text
       ESP32 SENSOR NODES (Promiscuous BLE / Wi-Fi / Acoustic)
                               │
                               ▼
            ACTUAL AVAILABLE SENSOR / RADIO OBSERVATIONS
                               │
                               ▼
                 SUPPORTED NODE-TO-GATEWAY TRANSPORT
                      (LoRa 868.1 MHz / Wi-Fi)
                               │
                               ▼
             GATEWAY / USB SERIAL / NETWORK BRIDGE
           (scripts/trace_gateway_daemon.py @ 115200)
                               │
                               ▼
                   BACKEND PACKET VALIDATION
       (Schema validation, timestamp checks, deduplication)
                               │
                               ▼
                      PERSISTENT DATABASE
             (SQLite WAL mode with 17 relational tables)
                               │
                               ▼
               SIGNAL FILTERING AND CALIBRATION
     (Moving-average / Kalman filtering, log-distance A0, n)
                               │
                               ▼
                      LOCALIZATION ENGINE
         (Local metric projection, WLS multilateration, GDOP)
                               │
                               ▼
                    SEARCH AREA ESTIMATION
           (Uncertainty circle derivation, residual error)
                               │
                               ▼
                    ALERT AND EVENT ENGINE
            (Offline detection, high variance, thresholding)
                               │
                               ▼
                   REAL-TIME API / SSE STREAM
              (/api/events/stream server-sent events)
                               │
                               ▼
               COMMAND CENTER + 2D MAP + 3D VIEW
      (TanStack router, React 19, Lucide, Recharts, Three.js)
```

---

## 2. Component Subsystems

### A. Microcontroller IoT Firmware Tier (`/firmware`)
- Written in C++ for Arduino IDE and PlatformIO.
- **`trace_gateway.ino`**: Manages Semtech SX1262 LoRa SPI transceiver, receives raw frames, performs preamble and CRC checks, and serializes packets to USB UART.
- **`trace_sniffer.ino`**: Implements FreeRTOS tasks for promiscuous 2.4 GHz scanning and sub-GHz LoRa transmission.
- **`trace_beacon.ino`**: Generates calibrated +3 dBm reference transmissions for empirical RF baseline profiling.

### B. Ingestion & Transport Bridge (`/scripts`)
- **`trace_gateway_daemon.py`**: Python daemon with `pyserial` and `requests`. Features automatic COM port enumeration (`--list-ports`), non-blocking buffer management, frame framing, and automatic reconnect with exponential backoff.
- Directly ingests frames to `/api/telemetry/ingest` and `/api/v1/telemetry/packet`.

### C. Backend & Persistence Layer (`/src/server`)
- Embedded inside Vite dev server and Node.js production runtime.
- **Database Engine**: `better-sqlite3` operating in Write-Ahead Logging (`WAL`) mode with foreign key enforcement and indexed queries.
- **Data Isolation**: Strict partition between live hardware telemetry (`source = 'live'`) and synthetic simulation (`source = 'simulation'`).
- **Real-Time Push**: Server-Sent Events (`SSE`) endpoint `/api/events/stream` broadcasting telemetry arrival, search zone calculations, and operational alerts.

### D. Mathematics & Localization Engine (`src/lib/kavach/engine.ts`)
- **RF Path-Loss Calibration**: Closed-form Ordinary Least Squares (`OLS`) linear regression solving:
  $$\text{RSSI}(d) = A_0 - 10 \cdot n \cdot \log_{10}(d/d_0) + \varepsilon$$
  Yields reference RSSI ($A_0$), site attenuation exponent ($n$), Goodness-of-Fit ($R^2$), and Root-Mean-Square Error ($\text{RMSE}$).
- **Equirectangular Projection**: Local metric conversions relative to `SITE_ORIGIN` avoiding degree-as-meter distortion.
- **Weighted Least Squares Multilateration**: Matrix solver for target transmitter location with Geometric Dilution of Precision (`GDOP`) calculation and collinearity rejection.

### E. Tactical Operations Frontend (`/src`)
- **Framework**: React 19, TypeScript 5.8, TanStack Router with 6 primary routes.
- **Visual Aesthetic**: Deep midnight navy background (`#0B1120`), dark slate-blue panels (`#111C2F`), cyan accents (`#38BDF8`/`#00E5FF`).
- **2D Tactical Vector Map**: SVG canvas with zoom, pan, layer toggles, range rings, and interactive node positioning.
- **3D Procedural Scene**: Three.js / `@react-three/fiber` visualizing structural building models, rubble elevations, and search zones.
