# TRACE REST API & Real-Time SSE Specification

All TRACE endpoints use JSON request and response payloads with standard HTTP status codes.

---

## 1. System Health & OpenAPI Spec

### `GET /api/health`
Returns server operational health status, database connection, uptime, and mode.
```json
{
  "status": "ok",
  "version": "8.0.0",
  "uptime_s": 341.2,
  "database": "connected",
  "timestamp": "2026-10-21T15:30:00.000Z"
}
```

### `GET /api/ready`
Readiness probe for orchestration checks. Returns `200 OK` when the database is initialized.

### `GET /api/docs/openapi.json`
Returns the complete OpenAPI 3.1 schema specification for the TRACE API surface.

---

## 2. Authentication & Session Management

### `POST /api/auth/login`
Authenticates an operator and issues a session cookie.
- **Request Body:**
  ```json
  {
    "username": "admin",
    "password": "trace_password_2026"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "user": {
      "id": "USR-01",
      "username": "admin",
      "role": "Administrator",
      "full_name": "Chief Incident Commander"
    }
  }
  ```

### `GET /api/auth/me`
Retrieves the currently authenticated operator profile.

### `POST /api/auth/logout`
Terminates the active session and clears authentication cookies.

---

## 3. IoT Telemetry Ingestion (Hardware & Daemon Bridge)

### `POST /api/telemetry/ingest`
Primary ingestion endpoint for physical USB serial gateways (`trace_gateway_daemon.py`) or network sniffers.
- **Headers:** `Content-Type: application/json`, `X-API-Key: trace_dev_gateway_secret_2026` (optional)
- **Request Body (Versioned Telemetry Envelope):**
  ```json
  {
    "protocol_version": "v2.0",
    "message_id": "pkt-849201",
    "node_id": "NODE-N01",
    "gateway_id": "GW-01",
    "sequence": 1420,
    "timestamp_ms": 1792683492000,
    "type": "ble",
    "identifier": "target-4a:82:11:c3:90:02",
    "rssi_dbm": -64,
    "snr_db": 8.5,
    "battery_percent": 88,
    "latitude": null,
    "longitude": null,
    "source_mode": "live",
    "radio_config_id": "lora_sf7_bw125"
  }
  ```
- **Validation Rules:**
  - Duplicate `message_id` within 60s returns `200 OK` with `{ "status": "duplicate_ignored" }`.
  - RSSI outside physical bounds $[-135, 0]\text{ dBm}$ returns `400 Bad Request`.
  - Non-finite coordinates return `400 Bad Request`.
  - Auto-registers unknown `gateway_id` and `node_id`.

---

## 4. RF Calibration API

### `GET /api/calibration/profiles`
Returns all persisted RF path-loss profiles from `data/trace.db`.

### `POST /api/calibration/profiles`
Saves and activates a fitted log-distance model profile.
- **Request Body:**
  ```json
  {
    "name": "Site Cal - Structural Rubble",
    "ref_rssi": -47.8,
    "path_loss_exponent": 3.42,
    "rmse": 2.1,
    "r2": 0.91,
    "environment": "Reinforced Concrete Rubble",
    "is_active": 1
  }
  ```

---

## 5. Mathematical Localization Pipeline

### `POST /api/localization/run` or `POST /api/v1/estimation/pipeline`
Executes server-side Weighted Least Squares multilateration across recent telemetry observations.
- **Request Body:**
  ```json
  {
    "incident_id": "INC-ALPHA",
    "target_id": "target-4a:82:11:c3:90:02",
    "min_nodes": 3,
    "max_age_s": 30
  }
  ```
- **Response:**
  ```json
  {
    "status": "ESTIMATE_AVAILABLE",
    "zone": {
      "lat": 18.52048,
      "lon": 73.85679,
      "radius_m": 14.8,
      "gdop": 1.42,
      "residual_error": 1.15,
      "contributing_nodes": 3,
      "provenance": "LIVE HARDWARE"
    }
  }
  ```

---

## 6. Real-Time Server-Sent Events (SSE)

### `GET /api/events/stream`
Establishes a persistent SSE connection (`text/event-stream`). Broadcasts events:
- `telemetry_packet`: Ingested packet arrival.
- `search_zone_updated`: New or updated multilateration search area.
- `alert_raised`: Hardware disconnect or threshold alert.
- `node_status`: Node heartbeat or state change.
