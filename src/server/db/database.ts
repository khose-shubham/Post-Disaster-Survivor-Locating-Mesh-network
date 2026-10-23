import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SCHEMA_SQL } from "./schema.ts";

let dbInstance: DatabaseSync | null = null;
let dbPathUsed: string = ":memory:";

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64).toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const calculated = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calculated, "hex"));
}

export function getDatabasePath(): string {
  if (process.env["DATABASE_PATH"]) {
    return process.env["DATABASE_PATH"];
  }
  if (process.env["NODE_ENV"] === "test") {
    return ":memory:";
  }
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {
      // Fallback to memory if directory creation fails in restricted environment
      return ":memory:";
    }
  }
  return path.join(dataDir, "trace.db");
}

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDatabasePath();
  dbPathUsed = dbPath;

  try {
    dbInstance = new DatabaseSync(dbPath);
    // Enable WAL mode and foreign key constraints
    if (dbPath !== ":memory:") {
      dbInstance.exec("PRAGMA journal_mode = WAL;");
    }
    dbInstance.exec("PRAGMA foreign_keys = ON;");

    // Initialize Schema
    initSchema(dbInstance);

    return dbInstance;
  } catch (err) {
    console.error("[TRACE DB] Failed to initialize SQLite database at", dbPath, err);
    // If opening file failed, fallback gracefully to in-memory
    if (dbPath !== ":memory:") {
      console.warn("[TRACE DB] Falling back to in-memory database.");
      dbInstance = new DatabaseSync(":memory:");
      dbInstance.exec("PRAGMA foreign_keys = ON;");
      initSchema(dbInstance);
      return dbInstance;
    }
    throw err;
  }
}

export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}

export function resetDatabase(): void {
  closeDb();
  if (dbPathUsed !== ":memory:" && fs.existsSync(dbPathUsed)) {
    try {
      fs.unlinkSync(dbPathUsed);
    } catch {
      // ignore
    }
  }
  getDb();
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  // Always ensure all schema tables and indexes exist
  db.exec(SCHEMA_SQL);

  const applied1 = db.prepare("SELECT version FROM _migrations WHERE version = 1").all() as {
    version: number;
  }[];
  if (applied1.length === 0) {
    db.prepare(
      "INSERT INTO _migrations (version, name, applied_at) VALUES (1, 'initial_v7_v8_schema', ?)",
    ).run(Date.now());

    // Seed Demo Data
    seedInitialDemoData(db);
  }

  const applied2 = db.prepare("SELECT version FROM _migrations WHERE version = 2").all() as {
    version: number;
  }[];
  if (applied2.length === 0) {
    db.prepare(
      "INSERT INTO _migrations (version, name, applied_at) VALUES (2, 'v8_calibration_profiles_seed', ?)",
    ).run(Date.now());

    seedDefaultCalibrationProfiles(db);
  }
}

function seedDefaultCalibrationProfiles(db: DatabaseSync): void {
  const countRow = db.prepare("SELECT COUNT(*) as count FROM calibration_profiles").get() as {
    count: number;
  };
  if (!countRow || countRow.count === 0) {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO calibration_profiles (
        id, name, ref_rssi, path_loss_exponent, rmse, r2, sample_count,
        distinct_distances, environment, frequency_mhz, tx_power_dbm,
        antenna_type, warnings_json, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `,
    ).run(
      "CAL-BASELINE-01",
      "Baseline Terrestrial Urban (868/915 MHz)",
      -45.0,
      2.35,
      2.8,
      0.91,
      16,
      4,
      "urban_rubble",
      868.0,
      14.0,
      "Omni Dipole 3dBi",
      JSON.stringify([]),
      now,
    );
  }
}

function seedInitialDemoData(db: DatabaseSync): void {
  const now = Date.now();

  // 1. Seed Default Administrative & Role Accounts
  // Default passwords securely hashed with scrypt
  const adminCreds = hashPassword("Admin123456!");
  const commanderCreds = hashPassword("Commander123!");
  const responderCreds = hashPassword("Responder123!");
  const analystCreds = hashPassword("Analyst123!");
  const viewerCreds = hashPassword("Viewer123!");

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, email, password_hash, salt, role, full_name, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  insertUser.run(
    "USR-ADMIN-01",
    "admin",
    "admin@trace-rescue.internal",
    adminCreds.hash,
    adminCreds.salt,
    "Administrator",
    "Lead System Administrator",
    now,
    now,
  );
  insertUser.run(
    "USR-CMD-01",
    "commander",
    "commander@trace-rescue.internal",
    commanderCreds.hash,
    commanderCreds.salt,
    "Incident Commander",
    "Commander Sarah Jenkins",
    now,
    now,
  );
  insertUser.run(
    "USR-RESP-01",
    "responder",
    "responder@trace-rescue.internal",
    responderCreds.hash,
    responderCreds.salt,
    "Responder",
    "Field Unit Alpha-1",
    now,
    now,
  );
  insertUser.run(
    "USR-ANALYST-01",
    "analyst",
    "analyst@trace-rescue.internal",
    analystCreds.hash,
    analystCreds.salt,
    "Analyst",
    "Dr. Marcus Chen (RF Specialist)",
    now,
    now,
  );
  insertUser.run(
    "USR-VIEW-01",
    "viewer",
    "viewer@trace-rescue.internal",
    viewerCreds.hash,
    viewerCreds.salt,
    "Viewer",
    "Public Observer Account",
    now,
    now,
  );

  // 2. Seed Default Incident [DEMO DATA]
  const insertIncident = db.prepare(`
    INSERT OR IGNORE INTO incidents (id, name, status, priority, description, lat, lon, radius_m, commander_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertIncident.run(
    "INC-2026-SECTOR-4",
    "[DEMO DATA] Sector 4 Structural Collapse",
    "active",
    "critical",
    "[DEMO DATA] Commercial complex collapse with multiple trapped victims emitting Wi-Fi and BLE probe requests.",
    19.8762,
    74.4785,
    500.0,
    "USR-CMD-01",
    now - 3600000,
    now,
  );

  // 3. Seed Default Gateways
  const insertGateway = db.prepare(`
    INSERT OR IGNORE INTO gateways (id, gateway_id, name, type, lat, lon, status, api_key_hash, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const gwApiKey = hashPassword("gw-secret-primary-alpha");
  insertGateway.run(
    "GW-01",
    "GW-PRIMARY-ALPHA",
    "Command Post LoRa Gateway",
    "lora_serial",
    19.8762,
    74.4785,
    "online",
    gwApiKey.hash,
    now,
    now,
  );

  // 4. Seed Sensor Sniffer Nodes
  const insertNode = db.prepare(`
    INSERT OR IGNORE INTO sensor_nodes (id, node_id, gateway_id, name, type, lat, lon, alt, battery, status, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertNode.run(
    "NODE-A",
    "station-alpha",
    "GW-PRIMARY-ALPHA",
    "Station Alpha (Perimeter North)",
    "sniffer",
    19.877,
    74.478,
    510.0,
    96,
    "online",
    now,
    now,
  );
  insertNode.run(
    "NODE-B",
    "station-bravo",
    "GW-PRIMARY-ALPHA",
    "Station Bravo (East Wing)",
    "sniffer",
    19.8755,
    74.4795,
    514.0,
    88,
    "online",
    now,
    now,
  );
  insertNode.run(
    "NODE-C",
    "station-charlie",
    "GW-PRIMARY-ALPHA",
    "Station Charlie (South Plaza)",
    "sniffer",
    19.875,
    74.477,
    508.0,
    92,
    "online",
    now,
    now,
  );
  insertNode.run(
    "NODE-D",
    "station-delta",
    "GW-PRIMARY-ALPHA",
    "Station Delta (Rubble Core)",
    "sniffer",
    19.8768,
    74.479,
    512.0,
    74,
    "online",
    now,
    now,
  );

  // 5. Seed Initial Demo Alerts
  const insertAlert = db.prepare(`
    INSERT OR IGNORE INTO alerts (id, incident_id, severity, title, message, source, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAlert.run(
    "ALT-001",
    "INC-2026-SECTOR-4",
    "warning",
    "[DEMO DATA] High RF Multi-path Attenuation",
    "Signal distortion observed along East Wing rubble barrier. Spatial GDOP increased to 2.4.",
    "station-bravo",
    "active",
    now - 1800000,
  );
  insertAlert.run(
    "ALT-002",
    "INC-2026-SECTOR-4",
    "critical",
    "[DEMO DATA] Weak Acoustic Geophone Detection",
    "Micro-vibration frequency 34Hz detected at Sector 4 sub-basement boundary.",
    "station-delta",
    "active",
    now - 600000,
  );

  // 6. Seed Application Event
  const insertAppEvent = db.prepare(`
    INSERT OR IGNORE INTO application_events (id, incident_id, event_type, severity, title, details, actor_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAppEvent.run(
    "EVT-001",
    "INC-2026-SECTOR-4",
    "incident_registered",
    "info",
    "[DEMO DATA] Incident INC-2026-SECTOR-4 Initialized",
    "Operational sector boundaries established. 4 sniffer stations deployed.",
    "USR-CMD-01",
    now - 3600000,
  );
}
