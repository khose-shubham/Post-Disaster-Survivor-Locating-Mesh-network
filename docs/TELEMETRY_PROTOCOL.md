# TRACE Telemetry Protocol Specification (v2.4)

## 1. Overview

The TRACE (Triangulated Rescue Aid via Crowd-Signal Estimation) system ingests telemetry packets emitted by sensor sniffers and edge gateways. This document formalizes the versioned JSON packet envelope, field constraints, validation boundaries, and deduplication rules enforced at the backend ingestion boundary (`POST /api/telemetry/ingest` and `POST /api/v1/telemetry/packet`).

---

## 2. Packet Envelope Format

```json
{
  "version": "2.4",
  "msgId": "PKT-ESP32-1729228800000-0042",
  "deviceId": "NODE_SNIFFER_01",
  "gatewayId": "GW_LORA_01",
  "seq": 42,
  "deviceTimestamp": 1729228799500,
  "serverReceiveTimestamp": 1729228800100,
  "msgType": "observation",
  "source": "live_hardware",
  "radio": {
    "band": "2.4GHz_BLE",
    "frequencyMhz": 2402,
    "txPowerDbm": 14,
    "antennaType": "omnidirectional_whip"
  },
  "measurements": {
    "targetMacHash": "e3b0c44298fc",
    "signalType": "BLE",
    "rssi": -68.5,
    "snr": 9.2,
    "channel": 37,
    "acousticDb": 42.1,
    "vibrationG": 0.04
  },
  "coordinates": {
    "lat": 19.89682,
    "lon": 74.47891,
    "elevationM": 512.4,
    "accuracyM": 2.5,
    "provenance": "MEASURED_GPS"
  }
}
```

---

## 3. Field Definitions & Constraints

| Field                    | Type    | Required    | Constraints / Validation Range                        | Description                                          |
| :----------------------- | :------ | :---------- | :---------------------------------------------------- | :--------------------------------------------------- |
| `version`                | String  | Yes         | Exact match: `"2.4"`                                  | Protocol version. Outdated versions are rejected.    |
| `msgId`                  | String  | Yes         | 8–64 alphanumeric characters                          | Globally unique message ID for deduplication.        |
| `deviceId`               | String  | Yes         | Regex: `^[A-Za-z0-9_-]{3,32}$`                        | ID of the reporting sniffer or gateway station.      |
| `gatewayId`              | String  | No          | Regex: `^[A-Za-z0-9_-]{3,32}$`                        | LoRa/Mesh concentrator relaying the packet.          |
| `seq`                    | Integer | Yes         | $\ge 0$                                               | Monotonically increasing sequence number per node.   |
| `deviceTimestamp`        | Integer | Yes         | Epoch ms; $\pm 300\text{ s}$ from server receive time | Local timestamp measured on the microcontroller.     |
| `serverReceiveTimestamp` | Integer | Auto        | UTC Epoch ms                                          | Stamped by the ingestion server upon arrival.        |
| `msgType`                | String  | Yes         | `"observation"`, `"heartbeat"`, `"status"`            | Telemetry classification.                            |
| `source`                 | String  | Yes         | `"live_hardware"`, `"simulation"`, `"manual"`         | Strict data provenance isolation flag.               |
| `measurements.rssi`      | Float   | Yes         | $-125.0 \le \text{RSSI} \le -10.0\text{ dBm}$         | Filtered signal strength of detected civilian frame. |
| `measurements.snr`       | Float   | No          | $-20.0 \le \text{SNR} \le 30.0\text{ dB}$             | Signal-to-noise ratio.                               |
| `coordinates.lat`        | Float   | Conditional | $-90.0 \le \text{lat} \le 90.0$                       | Sniffer latitude (WGS84).                            |
| `coordinates.lon`        | Float   | Conditional | $-180.0 \le \text{lon} \le 180.0$                     | Sniffer longitude (WGS84). Zero is accepted.         |
| `coordinates.provenance` | String  | Conditional | `"MEASURED_GPS"`, `"CONFIGURED_SURVEY"`               | Distinguishes dynamic GPS from survey stakes.        |

---

## 4. Ingestion Validation & Rejection Rules

1. **Schema & JSON Conformance**: Malformed JSON or payloads missing `version`, `msgId`, `deviceId`, or `measurements.rssi` return HTTP `400 Bad Request`.
2. **Duplicate Detection**: The ingestion engine buffers incoming `msgId` values with a 15-minute sliding window. Duplicate packet IDs are safely acknowledged with `{"accepted": false, "reason": "duplicate_packet"}` without corrupting the observation buffer.
3. **Out-of-Range RSSI**: Values outside $[-125, -10]\text{ dBm}$ indicate RF front-end clipping or malformed decodes and are rejected.
4. **Stale Timestamps**: Observations with `serverReceiveTimestamp - deviceTimestamp > 60000\text{ ms}` are rejected from multilateration to prevent mobile survivor tracking distortion.
5. **Data Provenance Preservation**: Packets marked `"simulation"` are strictly routed to the synthetic sandbox and can never trigger live hardware alerts or alter live calibration profiles.
