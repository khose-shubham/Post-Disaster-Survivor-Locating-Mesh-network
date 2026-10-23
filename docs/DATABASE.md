# TRACE Database & Persistence Architecture

## 1. Storage Engine Overview

The TRACE persistent storage engine is powered by **SQLite** using Node.js `better-sqlite3` in Write-Ahead Logging (`WAL`) mode, storing the database at `data/trace.db`.

### Key Engine Features:
- **Write-Ahead Logging (`PRAGMA journal_mode = WAL`)**: Concurrent read access during active telemetry writes without locking contention.
- **Foreign Key Constraints (`PRAGMA foreign_keys = ON`)**: Enforces relational referential integrity across incidents, nodes, sessions, and observations.
- **Synchronous Normal (`PRAGMA synchronous = NORMAL`)**: Balances ACID durability with high write throughput (100+ telemetry packets/sec).
- **Audit Logging**: Append-only tables for security events (`audit_events`) and application telemetry state transitions (`application_events`).

---

## 2. Relational Schema Summary (17 Tables)

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | Operator user accounts and roles | `id`, `username`, `email`, `password_hash`, `role` |
| `sessions` | Active JWT/session authentication tokens | `id`, `user_id`, `token_hash`, `expires_at` |
| `incidents` | Disaster response operations & boundaries | `id`, `name`, `status`, `lat`, `lon`, `radius_m` |
| `gateways` | Registered hardware LoRa / serial gateways | `id`, `gateway_id`, `name`, `status`, `last_seen` |
| `sensor_nodes` | ESP32 sniffer stations and anchors | `id`, `node_id`, `gateway_id`, `lat`, `lon`, `battery` |
| `telemetry_messages` | Ingested raw packet envelope archive | `message_id`, `node_id`, `seq`, `timestamp`, `source`, `rssi` |
| `observations` | Extracted signal detections per target | `id`, `incident_id`, `target_mac`, `rssi`, `signal_type` |
| `calibration_profiles`| Fitted RF path-loss model records | `id`, `name`, `ref_rssi` ($A_0$), `path_loss_exponent` ($n$), `is_active` |
| `calibration_samples` | Individual distance/RSSI calibration pairs| `id`, `profile_id`, `distance_m`, `rssi`, `source` |
| `localization_runs` | Mathematical multilateration calculation log | `id`, `incident_id`, `profile_id`, `gdop`, `residual_error` |
| `search_zones` | Derived spatial search priority circles | `id`, `incident_id`, `lat`, `lon`, `radius_m`, `confidence` |
| `survivors` | Casualty records & field evidence items | `id`, `incident_id`, `status`, `assigned_unit` |
| `rescue_operations` | Field tactical missions & responder assignments | `id`, `incident_id`, `status`, `priority`, `team_name` |
| `alerts` | System notifications & hardware alarms | `id`, `incident_id`, `severity`, `title`, `acknowledged` |
| `application_events` | Append-only system state transitions | `id`, `timestamp`, `event_type`, `source`, `payload_json` |
| `audit_events` | Security access & user action audit log | `id`, `user_id`, `action`, `resource`, `ip_address` |
| `schema_migrations` | Database version and migration tracking | `version`, `applied_at`, `description` |

---

## 3. Database Initialization & Seeding

The database auto-initializes on server startup via `initDatabase()` in `src/server/db/database.ts`:
1. Creates directory `data/` if not present.
2. Executes DDL statements from `SCHEMA_SQL` inside a transaction.
3. Applies pending schema migrations.
4. Seeds default baseline calibration profile:
   - `CAL-BASELINE-01`: $A_0 = -48.0\text{ dBm}, n = 2.40, \text{RMSE} = 1.8\text{ dB}, R^2 = 0.94$.
5. Seeds default administrative operator accounts.
