#!/usr/bin/env python3
"""
TRACE — Triangulated Rescue Aid via Crowd-Signal Estimation
Hardware Gateway Bridge Companion Daemon (TRACE V8.0 Consolidated)

Reads raw telemetry from physical USB/UART LoRa gateways (ESP32 / SX1262 / SX1276)
or simulates field sniffer constellations, formats packets into the strict
TRACE Ingress JSON specification, and streams them over HTTP to the TRACE API.

Zero external dependencies required (uses standard library urllib).
Optional: `pip install pyserial` for physical serial port reading.

Usage:
  # Scan available COM ports:
  python trace_gateway_daemon.py --list-ports

  # Auto-detect or connect to physical serial gateway:
  python trace_gateway_daemon.py --port COM3 --baud 115200 --api-key trace_dev_gateway_secret_2026

  # Synthetic hardware simulation stream (when no physical hardware attached):
  python trace_gateway_daemon.py --simulate --rate 1.0 --api-key trace_dev_gateway_secret_2026
"""

import argparse
import json
import math
import random
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

# Optional serial support
try:
    import serial
    import serial.tools.list_ports
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False


DEFAULT_ENDPOINT = "http://localhost:8080/api/telemetry/ingest"
DEFAULT_BAUD = 115200
DEFAULT_GATEWAY_ID = "GW-PRIMARY-ALPHA"

# Operational baseline coordinates
SITE_LAT = 19.8762
SITE_LON = 74.4785


def list_available_ports() -> List[str]:
    """Scan and list all detected serial COM/UART ports on the host system."""
    if not HAS_SERIAL:
        print("[WARN] pyserial is not installed. To connect physical hardware, run: pip install pyserial")
        return []
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print("[INFO] No USB serial ports detected. Connect an ESP32 via USB or use --simulate.")
        return []
    print("\n--- Detected Serial Ports ---")
    for p in ports:
        print(f"  • {p.device}: {p.description} [{p.hwid}]")
    print("-----------------------------\n")
    return [p.device for p in ports]


def auto_detect_serial_port() -> Optional[str]:
    """Auto-detect the most likely ESP32 / UART bridge COM port."""
    if not HAS_SERIAL:
        return None
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None

    # Priority to CP210x, CH340, FTDI, or USB Serial devices
    for p in ports:
        desc = (p.description or "").lower()
        if any(keyword in desc for keyword in ["cp210", "ch340", "ftdi", "usb serial", "uart", "esp32"]):
            return p.device

    # Fallback to single port if only 1 exists
    if len(ports) == 1:
        return ports[0].device
    return None


class TraceGatewayDaemon:
    def __init__(
        self,
        endpoint: str = DEFAULT_ENDPOINT,
        port: Optional[str] = None,
        baud: int = DEFAULT_BAUD,
        gateway_id: str = DEFAULT_GATEWAY_ID,
        api_key: Optional[str] = None,
        simulate: bool = False,
        rate_hz: float = 1.0,
        max_packets: Optional[int] = None,
    ):
        self.endpoint = endpoint
        self.port = port
        self.baud = baud
        self.gateway_id = gateway_id
        self.api_key = api_key
        self.rate_hz = max(0.1, min(10.0, rate_hz))
        self.max_packets = max_packets

        # Determine mode
        if simulate:
            self.simulate = True
        elif not HAS_SERIAL:
            self.simulate = True
        elif self.port is None:
            detected = auto_detect_serial_port()
            if detected:
                self.port = detected
                self.simulate = False
            else:
                self.simulate = True
        else:
            self.simulate = False

        self.seq = 1000
        self.sent_count = 0
        self.accepted_count = 0
        self.rejected_count = 0
        self.running = True
        self.start_time = time.time()

        # Simulated sniffer stations around disaster site
        self.simulated_nodes = [
            {"id": "NODE-N01", "name": "Sniffer N01 (North East)", "dx": 20, "dy": 25, "battery": 94},
            {"id": "NODE-N02", "name": "Sniffer N02 (North West)", "dx": -25, "dy": 20, "battery": 88},
            {"id": "NODE-N03", "name": "Sniffer N03 (South East)", "dx": 25, "dy": -20, "battery": 91},
            {"id": "NODE-N04", "name": "Sniffer N04 (South West)", "dx": -20, "dy": -25, "battery": 85},
        ]

    def log(self, level: str, msg: str):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level.upper()}] {msg}", flush=True)

    def generate_simulated_packet(self) -> Dict[str, Any]:
        """Generate a realistic synthetic packet from field sniffer stations."""
        node = random.choice(self.simulated_nodes)
        self.seq += 1

        # Simulate casualty signal emitter at void (15m, 10m)
        source_x, source_y = 15.0, 10.0
        dist = math.sqrt((node["dx"] - source_x) ** 2 + (node["dy"] - source_y) ** 2)

        # Log-distance path loss: RSSI = A0 - 10 * n * log10(d) + noise
        n = 3.6  # Structural collapse exponent
        a0 = -46.0
        noise = random.gauss(0, 2.0)
        calc_rssi = a0 - (10.0 * n * math.log10(max(1.0, dist))) + noise
        rssi = round(max(-120.0, min(-40.0, calc_rssi)), 1)

        # Flat-earth approximation for GPS coordinates
        m_per_deg_lat = 111320.0
        m_per_deg_lon = 111320.0 * math.cos(math.radians(SITE_LAT))
        lat = round(SITE_LAT + (node["dy"] / m_per_deg_lat), 6)
        lon = round(SITE_LON + (node["dx"] / m_per_deg_lon), 6)

        node["battery"] = max(10, node["battery"] - random.choice([0, 0, 0, 0.01]))

        return {
            "deviceId": node["id"],
            "gatewayId": self.gateway_id,
            "timestamp": int(time.time() * 1000),
            "seq": self.seq,
            "latitude": lat,
            "longitude": lon,
            "rssi": rssi,
            "sound": round(random.uniform(35.0, 68.0), 1),
            "vibration": round(random.uniform(0.01, 0.15), 3),
            "temperature": round(random.uniform(27.0, 31.5), 1),
            "battery": round(node["battery"], 1),
            "bleDetected": random.choice([1, 1, 2, 3]),
            "wifiDetected": random.choice([0, 1]),
            "loraRssi": round(-75.0 - random.uniform(0, 15), 1),
            "loraSnr": round(8.5 + random.uniform(-2, 3), 1),
            "gpsFix": "3d",
            "hdop": 1.1,
            "source": "sim",
        }

    def parse_serial_line(self, line: str) -> Optional[Dict[str, Any]]:
        """Parse raw serial line (JSON or comma-delimited CSV telemetry)."""
        clean = line.strip()
        if not clean:
            return None

        # Format 1: Direct JSON envelope
        if clean.startswith("{") and clean.endswith("}"):
            try:
                data = json.loads(clean)
                if isinstance(data, dict):
                    # Handle gateway heartbeat message
                    if data.get("type") == "gateway_heartbeat" or data.get("type") == "gateway_boot":
                        self.log("GATEWAY", f"Hardware Heartbeat received: {clean}")
                        return None

                    data.setdefault("gatewayId", self.gateway_id)
                    data.setdefault("timestamp", int(time.time() * 1000))
                    data.setdefault("seq", self.seq)
                    data.setdefault("source", "live")
                    self.seq += 1
                    return data
            except json.JSONDecodeError:
                self.log("WARN", f"Malformed JSON serial line: {clean[:50]}...")
                return None

        # Format 2: CSV line: deviceId,rssi,lat,lon,battery,sound,vibration,temp
        parts = clean.split(",")
        if len(parts) >= 2:
            try:
                self.seq += 1
                return {
                    "deviceId": parts[0].strip(),
                    "gatewayId": self.gateway_id,
                    "rssi": float(parts[1].strip()),
                    "latitude": float(parts[2].strip()) if len(parts) > 2 else SITE_LAT,
                    "longitude": float(parts[3].strip()) if len(parts) > 3 else SITE_LON,
                    "battery": float(parts[4].strip()) if len(parts) > 4 else 90.0,
                    "sound": float(parts[5].strip()) if len(parts) > 5 else 40.0,
                    "vibration": float(parts[6].strip()) if len(parts) > 6 else 0.04,
                    "temperature": float(parts[7].strip()) if len(parts) > 7 else 28.0,
                    "timestamp": int(time.time() * 1000),
                    "seq": self.seq,
                    "source": "live",
                }
            except (ValueError, IndexError):
                self.log("WARN", f"Unrecognized CSV serial telemetry line: {clean[:40]}")
                return None

        return None

    def post_telemetry(self, packet: Dict[str, Any]) -> bool:
        """Post telemetry JSON to the TRACE Ingress API."""
        payload_bytes = json.dumps(packet).encode("utf-8")
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "TRACE-Gateway-Daemon/8.0",
            "X-Trace-Gateway-Id": self.gateway_id,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["X-Trace-Gateway-Secret"] = self.api_key

        req = urllib.request.Request(
            self.endpoint,
            data=payload_bytes,
            headers=headers,
            method="POST",
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                elapsed_ms = round((time.time() - start) * 1000, 1)
                body = resp.read().decode("utf-8")
                res_json = json.loads(body)
                packet_id = res_json.get("messageId") or res_json.get("packetId", f"PKT-{packet.get('seq')}")
                self.log(
                    "INFO",
                    f"INGEST ACCEPTED -> [{packet.get('source', 'live').upper()}] {packet['deviceId']} "
                    f"(RSSI: {packet.get('rssi')} dBm, Seq: #{packet.get('seq')}) "
                    f"-> {packet_id} [{elapsed_ms}ms, HTTP {resp.status}]",
                )
                self.accepted_count += 1
                return True
        except urllib.error.HTTPError as e:
            elapsed_ms = round((time.time() - start) * 1000, 1)
            err_body = e.read().decode("utf-8", errors="replace")
            self.log("ERROR", f"HTTP {e.code} Rejection from {self.endpoint}: {err_body[:80]} [{elapsed_ms}ms]")
            self.rejected_count += 1
            return False
        except Exception as e:
            elapsed_ms = round((time.time() - start) * 1000, 1)
            self.log("WARN", f"Failed to reach TRACE endpoint ({self.endpoint}): {e} [{elapsed_ms}ms]")
            self.rejected_count += 1
            return False

    def run(self):
        self.log("INIT", "=== TRACE V8.0 Hardware Gateway Companion Daemon ===")
        self.log("INIT", f"Target Ingress API: {self.endpoint}")
        self.log("INIT", f"Gateway Identifier: {self.gateway_id}")

        if self.simulate:
            self.log("MODE", f"Running in SIMULATED HARDWARE MODE at {self.rate_hz} Hz")
            self.run_simulated_loop()
        else:
            self.log("MODE", f"Connecting physical serial port: {self.port} at {self.baud} baud")
            self.run_serial_loop()

    def run_simulated_loop(self):
        delay = 1.0 / self.rate_hz
        try:
            while self.running:
                packet = self.generate_simulated_packet()
                self.sent_count += 1
                self.post_telemetry(packet)

                if self.max_packets and self.sent_count >= self.max_packets:
                    self.log("DONE", f"Reached maximum packet threshold ({self.max_packets}). Stopping.")
                    break

                time.sleep(delay)
        except KeyboardInterrupt:
            self.shutdown()

    def run_serial_loop(self):
        if not HAS_SERIAL:
            self.log("ERROR", "pyserial module not installed. Run 'pip install pyserial'.")
            return

        reconnect_delay = 3.0
        while self.running:
            try:
                self.log("INFO", f"Opening serial connection to {self.port} ({self.baud} baud)...")
                with serial.Serial(self.port, self.baud, timeout=1.5) as ser:
                    self.log("INFO", f"Serial connection OPEN. Listening for live LoRa sniffer frames...")
                    while self.running:
                        raw_bytes = ser.readline()
                        if not raw_bytes:
                            continue

                        line = raw_bytes.decode("utf-8", errors="replace")
                        packet = self.parse_serial_line(line)
                        if packet:
                            self.sent_count += 1
                            self.post_telemetry(packet)

                            if self.max_packets and self.sent_count >= self.max_packets:
                                self.running = False
                                break
            except serial.SerialException as e:
                self.log("WARN", f"Serial connection error on {self.port}: {e}")
                self.log("INFO", f"Attempting reconnection in {reconnect_delay}s (Press Ctrl+C to stop)...")
                try:
                    time.sleep(reconnect_delay)
                except KeyboardInterrupt:
                    break
            except KeyboardInterrupt:
                break

        self.shutdown()

    def shutdown(self):
        self.running = False
        duration = round(time.time() - self.start_time, 1)
        self.log("INFO", "\n=== Daemon Shutdown Summary ===")
        self.log("INFO", f"Uptime: {duration}s")
        self.log("INFO", f"Packets Transmitted: {self.sent_count}")
        self.log("INFO", f"Accepted by TRACE API: {self.accepted_count}")
        self.log("INFO", f"Rejected or Dropped: {self.rejected_count}")


def main():
    parser = argparse.ArgumentParser(description="TRACE V8.0 Hardware Gateway Companion Daemon")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help=f"TRACE API endpoint (default: {DEFAULT_ENDPOINT})")
    parser.add_argument("--port", default=None, help="Serial port device (e.g. /dev/ttyUSB0 or COM3)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help=f"Serial baud rate (default: {DEFAULT_BAUD})")
    parser.add_argument("--gateway-id", default=DEFAULT_GATEWAY_ID, help=f"Gateway Identifier (default: {DEFAULT_GATEWAY_ID})")
    parser.add_argument("--api-key", default=None, help="Gateway Authentication Key or Secret")
    parser.add_argument("--simulate", action="store_true", help="Force synthetic simulation mode even if serial hardware exists")
    parser.add_argument("--rate", type=float, default=1.0, help="Simulation transmit frequency in Hz (default: 1.0)")
    parser.add_argument("--max-packets", type=int, default=None, help="Stop after transmitting N packets (for testing)")
    parser.add_argument("--list-ports", action="store_true", help="List detected serial COM ports and exit")

    args = parser.parse_args()

    if args.list_ports:
        list_available_ports()
        sys.exit(0)

    daemon = TraceGatewayDaemon(
        endpoint=args.endpoint,
        port=args.port,
        baud=args.baud,
        gateway_id=args.gateway_id,
        api_key=args.api_key,
        simulate=args.simulate,
        rate_hz=args.rate,
        max_packets=args.max_packets,
    )
    daemon.run()


if __name__ == "__main__":
    main()
