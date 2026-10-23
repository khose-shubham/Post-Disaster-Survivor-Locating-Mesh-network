/**
 * TRACE Production Relational Schema Definition
 * Compliant with Section 3 requirements for SQLite & PostgreSQL compatibility.
 */

export const SCHEMA_SQL = `
-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Administrator', 'Incident Commander', 'Responder', 'Analyst', 'Viewer')),
  full_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

-- 3. Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'contained', 'resolved', 'archived', 'simulated')),
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  description TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  radius_m REAL NOT NULL DEFAULT 500.0,
  commander_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);

-- 4. Gateways
CREATE TABLE IF NOT EXISTS gateways (
  id TEXT PRIMARY KEY,
  gateway_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'lora_serial',
  lat REAL,
  lon REAL,
  status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')),
  api_key_hash TEXT,
  last_seen INTEGER,
  created_at INTEGER NOT NULL
);

-- 5. Sensor Nodes
CREATE TABLE IF NOT EXISTS sensor_nodes (
  id TEXT PRIMARY KEY,
  node_id TEXT UNIQUE NOT NULL,
  gateway_id TEXT REFERENCES gateways(gateway_id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sniffer', 'geophone', 'thermal', 'multisensor')),
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  alt REAL NOT NULL DEFAULT 0.0,
  battery INTEGER,
  status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')),
  last_seen INTEGER,
  created_at INTEGER NOT NULL
);

-- 6. Telemetry Messages
CREATE TABLE IF NOT EXISTS telemetry_messages (
  id TEXT PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  node_id TEXT NOT NULL,
  gateway_id TEXT,
  seq INTEGER NOT NULL,
  protocol_version TEXT NOT NULL DEFAULT 'v2.0',
  timestamp INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'sim')),
  rssi REAL,
  battery INTEGER,
  sound_db REAL,
  vibration_g REAL,
  thermal_c REAL,
  lat REAL,
  lon REAL,
  raw_payload TEXT,
  created_at INTEGER NOT NULL
);

-- 7. Observations
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE SET NULL,
  telemetry_id TEXT REFERENCES telemetry_messages(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  rssi REAL NOT NULL,
  distance_est_m REAL NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  is_usable INTEGER NOT NULL DEFAULT 1,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL
);

-- 8. Detections
CREATE TABLE IF NOT EXISTS detections (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('wifi_probe', 'ble_beacon', 'lora_sos', 'acoustic', 'synthetic')),
  confidence REAL NOT NULL,
  first_detected INTEGER NOT NULL,
  last_detected INTEGER NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('unverified', 'investigating', 'triaged', 'confirmed', 'false_positive')),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 9. Localization Runs
CREATE TABLE IF NOT EXISTS localization_runs (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  algorithm_version TEXT NOT NULL,
  run_at INTEGER NOT NULL,
  usable_nodes_count INTEGER NOT NULL,
  gdop REAL,
  lat_est REAL,
  lon_est REAL,
  uncertainty_radius_m REAL,
  confidence REAL,
  status TEXT NOT NULL CHECK (status IN ('success', 'insufficient_evidence', 'collinear', 'invalid_data', 'failed')),
  warnings TEXT,
  created_at INTEGER NOT NULL
);

-- 10. Search Zones
CREATE TABLE IF NOT EXISTS search_zones (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  localization_run_id TEXT REFERENCES localization_runs(id) ON DELETE CASCADE,
  center_lat REAL NOT NULL,
  center_lon REAL NOT NULL,
  radius_m REAL NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN ('active', 'cleared', 'in_progress', 'deprioritized')),
  shape_geojson TEXT,
  created_at INTEGER NOT NULL
);

-- 11. Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  acknowledged_at INTEGER
);

-- 12. Application Events
CREATE TABLE IF NOT EXISTS application_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  details TEXT,
  actor_id TEXT,
  created_at INTEGER NOT NULL
);

-- 13. Simulation Runs
CREATE TABLE IF NOT EXISTS simulation_runs (
  id TEXT PRIMARY KEY,
  scenario_name TEXT NOT NULL,
  seed INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'running', 'stopped')),
  parameters_json TEXT NOT NULL,
  metrics_json TEXT,
  created_at INTEGER NOT NULL
);

-- 14. Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  ip_address TEXT,
  details_json TEXT,
  created_at INTEGER NOT NULL
);

-- 15. Saved Reports
CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incidents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('incident_summary', 'telemetry_export', 'audit_log', 'simulation_analysis')),
  format TEXT NOT NULL CHECK (format IN ('json', 'csv', 'pdf')),
  author_id TEXT REFERENCES users(id),
  content_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 16. Calibration Profiles
CREATE TABLE IF NOT EXISTS calibration_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ref_rssi REAL NOT NULL,
  path_loss_exponent REAL NOT NULL,
  rmse REAL NOT NULL,
  r2 REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  distinct_distances INTEGER NOT NULL,
  environment TEXT NOT NULL,
  frequency_mhz REAL,
  tx_power_dbm REAL,
  antenna_type TEXT,
  warnings_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 17. Calibration Samples
CREATE TABLE IF NOT EXISTS calibration_samples (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES calibration_profiles(id) ON DELETE CASCADE,
  distance REAL NOT NULL,
  rssi REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'manual', 'simulation')),
  timestamp INTEGER NOT NULL,
  notes TEXT
);

-- Indexes for high-performance querying and pagination
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_node ON telemetry_messages(node_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_seq ON telemetry_messages(node_id, seq);
CREATE INDEX IF NOT EXISTS idx_observations_incident ON observations(incident_id);
CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);
CREATE INDEX IF NOT EXISTS idx_detections_incident ON detections(incident_id);
CREATE INDEX IF NOT EXISTS idx_alerts_incident ON alerts(incident_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_app_events_incident ON application_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_search_zones_incident ON search_zones(incident_id);
CREATE INDEX IF NOT EXISTS idx_cal_samples_profile ON calibration_samples(profile_id);
`;
