# TRACE Hardware Integration Guide

## 1. Physical Architecture & Data Flow

```text
PHYSICAL TRANSMITTER (Mobile BLE / Wi-Fi Device)
                    │
                    ▼  2.4 GHz RF (BLE Advertising / Wi-Fi Probe Requests)
   [ESP32 SNIFFER NODES: NODE_01, NODE_02, NODE_03]
                    │
                    ▼  LoRa 868.1 MHz Uplink (SX1262 / SX1276 Module)
        [ESP32 GATEWAY CONCENTRATOR (GW01)]
                    │
                    ▼  USB UART Serial Bridge (115200 baud)
  [HOST MACHINE: scripts/trace_gateway_daemon.py]
                    │
                    ▼  HTTP POST (JSON Telemetry Protocol v2.4)
     [TRACE BACKEND: /api/telemetry/ingest]
                    │
                    ▼  SQLite Persistent Storage & Multilateration Engine
    [TRACE WEB CONSOLE & TACTICAL MAP DISPLAY]
```

---

## 2. Hardware Verification Status

| Component                                                    | Status                       | Verification Notes                                                                                              |
| :----------------------------------------------------------- | :--------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **Backend Ingestion API (`/api/telemetry/ingest`)**          | `IMPLEMENTED AND VERIFIED`   | Tested with 82 automated test suites. Validates schema, deduplicates packets, rejects out-of-bounds RSSI.       |
| **Gateway Serial Bridge Daemon (`trace_gateway_daemon.py`)** | `IMPLEMENTED AND VERIFIED`   | Python daemon with auto-reconnect, JSON frame parsing, line buffering, and HTTP post-back.                      |
| **RF Calibration Profile System**                            | `IMPLEMENTED AND VERIFIED`   | OLS regression solver, SQLite database storage, dynamic engine reload.                                          |
| **Physical ESP32 Firmware Upload**                           | `REQUIRES PHYSICAL HARDWARE` | Firmware sketches provided in `docs/ARDUINO_SETUP.md`. Awaiting physical board connection on target deployment. |

---

## 3. Gateway Daemon Quickstart

The Python serial bridge daemon connects the physical USB gateway to the local TRACE backend.

### Prerequisites

- Python 3.9+
- `pyserial` and `requests` packages:
  ```bash
  pip install pyserial requests
  ```

### Running the Daemon

```bash
# Auto-detect USB serial port (or scan available ports):
python scripts/trace_gateway_daemon.py --list-ports

# Connect to physical serial gateway (Windows):
python scripts/trace_gateway_daemon.py --port COM3 --baud 115200 --api-key trace_dev_gateway_secret_2026

# Connect to physical serial gateway (Linux / macOS):
python scripts/trace_gateway_daemon.py --port /dev/ttyUSB0 --baud 115200 --api-key trace_dev_gateway_secret_2026

# Run automated multi-station simulation (when no physical hardware attached):
python scripts/trace_gateway_daemon.py --simulate --rate 1.0 --api-key trace_dev_gateway_secret_2026
```

### Command-Line Arguments

- `--port`: Serial port of the connected ESP32 gateway (`COM3`, `/dev/ttyUSB0`, etc. Auto-detected if omitted).
- `--baud`: Serial baud rate (standard `115200`).
- `--endpoint`: Backend ingestion endpoint (default `http://localhost:8080/api/telemetry/ingest`).
- `--api-key`: Optional gateway authentication secret.
- `--simulate`: Stream realistic multi-node RF telemetry without requiring physical hardware.
- `--rate`: Transmit frequency in Hz (default: 1.0 Hz).
- `--list-ports`: Scan and display all detected host COM/UART ports.
- `--max-packets`: Transmit N packets and exit (useful for automated integration testing).

---

## 4. Hardware Pinout Reference (ESP32-WROOM-32 + SX1262)

| ESP32 Pin | SX1262 Pin | Description                          |
| :-------- | :--------- | :----------------------------------- |
| `GPIO 18` | `SCK`      | SPI Clock                            |
| `GPIO 19` | `MISO`     | SPI Master-In Slave-Out              |
| `GPIO 23` | `MOSI`     | SPI Master-Out Slave-In              |
| `GPIO 5`  | `NSS / CS` | SPI Chip Select                      |
| `GPIO 26` | `RST`      | Hardware Reset                       |
| `GPIO 14` | `DIO1`     | Packet Received Interrupt            |
| `GPIO 2`  | `BUSY`     | Radio Busy Signal                    |
| `3V3`     | `VCC`      | 3.3V DC Power Supply (Do NOT use 5V) |
| `GND`     | `GND`      | Ground Reference                     |

---

## 5. Serial Connection Troubleshooting

1. **Permission Denied / Port In Use**: Ensure no other serial monitor (e.g., Arduino IDE Serial Monitor, PuTTY) has the port open.
2. **Garbage Characters in Output**: Verify that your baud rate is set to exactly `115200`.
3. **No Packets Received**:
   - Check that the sniffer nodes and gateway share the exact same LoRa frequency (`868.1 MHz`), spreading factor (`SF7`), and bandwidth (`125 kHz`).
   - Inspect sniffer antenna connections. Operating a LoRa transmitter without an antenna can damage the RF power amplifier.
