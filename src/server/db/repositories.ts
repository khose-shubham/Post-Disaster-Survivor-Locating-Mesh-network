import { getDb } from "./database.ts";
import crypto from "node:crypto";

type SqlParam = string | number | bigint | null | Uint8Array;

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  salt: string;
  role: "Administrator" | "Incident Commander" | "Responder" | "Analyst" | "Viewer";
  full_name: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  ip_address?: string | null | undefined;
  user_agent?: string | null | undefined;
}

export interface IncidentRecord {
  id: string;
  name: string;
  status: "active" | "contained" | "resolved" | "archived" | "simulated";
  priority: "critical" | "high" | "medium" | "low";
  description?: string | null | undefined;
  lat: number;
  lon: number;
  radius_m: number;
  commander_id?: string | null | undefined;
  created_at: number;
  updated_at: number;
  closed_at?: number | null | undefined;
}

export interface NodeRecord {
  id: string;
  node_id: string;
  gateway_id?: string | null | undefined;
  name: string;
  type: "sniffer" | "geophone" | "thermal" | "multisensor";
  lat: number;
  lon: number;
  alt: number;
  battery?: number | null | undefined;
  status: "online" | "degraded" | "offline";
  last_seen?: number | null | undefined;
  created_at: number;
}

export interface GatewayRecord {
  id: string;
  gateway_id: string;
  name: string;
  type: string;
  lat?: number | null | undefined;
  lon?: number | null | undefined;
  status: "online" | "degraded" | "offline";
  api_key_hash?: string | null | undefined;
  last_seen?: number | null | undefined;
  created_at: number;
}

export interface TelemetryRecord {
  id: string;
  message_id: string;
  node_id: string;
  gateway_id?: string | null | undefined;
  seq: number;
  protocol_version: string;
  timestamp: number;
  source: "live" | "sim";
  rssi?: number | null | undefined;
  battery?: number | null | undefined;
  sound_db?: number | null | undefined;
  vibration_g?: number | null | undefined;
  thermal_c?: number | null | undefined;
  lat?: number | null | undefined;
  lon?: number | null | undefined;
  raw_payload?: string | null | undefined;
  created_at: number;
}

export interface ObservationRecord {
  id: string;
  incident_id?: string | null | undefined;
  telemetry_id?: string | null | undefined;
  node_id: string;
  timestamp: number;
  rssi: number;
  distance_est_m: number;
  lat: number;
  lon: number;
  is_usable: number;
  rejection_reason?: string | null | undefined;
  created_at: number;
}

export interface DetectionRecord {
  id: string;
  incident_id?: string | null | undefined;
  device_id: string;
  signal_type: "wifi_probe" | "ble_beacon" | "lora_sos" | "acoustic" | "synthetic";
  confidence: number;
  first_detected: number;
  last_detected: number;
  observation_count: number;
  status: "unverified" | "investigating" | "triaged" | "confirmed" | "false_positive";
  verified: number;
  created_at: number;
}

export interface LocalizationRunRecord {
  id: string;
  incident_id?: string | null | undefined;
  algorithm_version: string;
  run_at: number;
  usable_nodes_count: number;
  gdop?: number | null | undefined;
  lat_est?: number | null | undefined;
  lon_est?: number | null | undefined;
  uncertainty_radius_m?: number | null | undefined;
  confidence?: number | null | undefined;
  status: "success" | "insufficient_evidence" | "collinear" | "invalid_data" | "failed";
  warnings?: string | null | undefined;
  created_at: number;
}

export interface SearchZoneRecord {
  id: string;
  incident_id?: string | null | undefined;
  localization_run_id?: string | null | undefined;
  center_lat: number;
  center_lon: number;
  radius_m: number;
  priority: "critical" | "high" | "medium" | "low";
  status: "active" | "cleared" | "in_progress" | "deprioritized";
  shape_geojson?: string | null | undefined;
  created_at: number;
}

export interface AlertRecord {
  id: string;
  incident_id?: string | null | undefined;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  source: string;
  status: "active" | "acknowledged" | "resolved";
  acknowledged_by?: string | null | undefined;
  created_at: number;
  acknowledged_at?: number | null | undefined;
}

export interface AppEventRecord {
  id: string;
  incident_id?: string | null | undefined;
  event_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  details?: string | null | undefined;
  actor_id?: string | null | undefined;
  created_at: number;
}

export interface AuditEventRecord {
  id: string;
  user_id?: string | null | undefined;
  action: string;
  target_type: string;
  target_id?: string | null | undefined;
  ip_address?: string | null | undefined;
  details_json?: string | null | undefined;
  created_at: number;
}

export class UserRepository {
  static findByUsername(username: string): UserRecord | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1")
      .get(username);
    return (row as unknown as UserRecord) || null;
  }

  static findById(id: string): UserRecord | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return (row as unknown as UserRecord) || null;
  }

  static create(user: Omit<UserRecord, "created_at" | "updated_at">): UserRecord {
    const db = getDb();
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, salt, role, full_name, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      user.id,
      user.username,
      user.email,
      user.password_hash,
      user.salt,
      user.role,
      user.full_name,
      user.is_active,
      now,
      now,
    );
    return { ...user, created_at: now, updated_at: now };
  }
}

export class SessionRepository {
  static create(
    userId: string,
    token: string,
    ttlMs: number = 86400000,
    ip?: string | undefined,
    ua?: string | undefined,
  ): SessionRecord {
    const db = getDb();
    const id = `SESS-${crypto.randomBytes(8).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = Date.now();
    const expiresAt = now + ttlMs;

    db.prepare(
      `
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(id, userId, tokenHash, expiresAt, now, ip || null, ua || null);

    return {
      id,
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: now,
      ip_address: ip || null,
      user_agent: ua || null,
    };
  }

  static findByToken(token: string): { session: SessionRecord; user: UserRecord } | null {
    const db = getDb();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = Date.now();

    const row = db
      .prepare(
        `
      SELECT s.id as s_id, s.user_id, s.token_hash, s.expires_at, s.created_at as s_created_at,
             u.id as u_id, u.username, u.email, u.password_hash, u.salt, u.role, u.full_name, u.is_active, u.created_at as u_created_at, u.updated_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
    `,
      )
      .get(tokenHash, now) as Record<string, unknown> | undefined;

    if (!row) return null;

    const session: SessionRecord = {
      id: row["s_id"] as string,
      user_id: row["user_id"] as string,
      token_hash: row["token_hash"] as string,
      expires_at: row["expires_at"] as number,
      created_at: row["s_created_at"] as number,
    };

    const user: UserRecord = {
      id: row["u_id"] as string,
      username: row["username"] as string,
      email: row["email"] as string,
      password_hash: row["password_hash"] as string,
      salt: row["salt"] as string,
      role: row["role"] as UserRecord["role"],
      full_name: row["full_name"] as string,
      is_active: row["is_active"] as number,
      created_at: row["u_created_at"] as number,
      updated_at: row["updated_at"] as number,
    };

    return { session, user };
  }

  static deleteByToken(token: string): void {
    const db = getDb();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }
}

export class IncidentRepository {
  static list(
    limit = 50,
    offset = 0,
    status?: string | undefined,
  ): { incidents: IncidentRecord[]; total: number } {
    const db = getDb();
    let query = "SELECT * FROM incidents";
    let countQuery = "SELECT count(*) as total FROM incidents";
    const params: SqlParam[] = [];

    if (status) {
      query += " WHERE status = ?";
      countQuery += " WHERE status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

    const countRow = (db.prepare(countQuery).get(...(status ? [status] : [])) as unknown as {
      total: number;
    }) || { total: 0 };
    const rows = db.prepare(query).all(...params, limit, offset) as unknown as IncidentRecord[];
    return { incidents: rows, total: countRow.total };
  }

  static findById(id: string): IncidentRecord | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
    return (row as unknown as IncidentRecord) || null;
  }

  static create(data: Omit<IncidentRecord, "created_at" | "updated_at">): IncidentRecord {
    const db = getDb();
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO incidents (id, name, status, priority, description, lat, lon, radius_m, commander_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      data.id,
      data.name,
      data.status,
      data.priority,
      data.description || null,
      data.lat,
      data.lon,
      data.radius_m,
      data.commander_id || null,
      now,
      now,
    );
    return { ...data, created_at: now, updated_at: now };
  }

  static update(
    id: string,
    updates: Partial<Omit<IncidentRecord, "id" | "created_at">>,
  ): IncidentRecord | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const updated: IncidentRecord = {
      ...existing,
      ...updates,
      updated_at: Date.now(),
      closed_at:
        updates.status === "resolved" || updates.status === "archived"
          ? existing.closed_at || Date.now()
          : null,
    };

    db.prepare(
      `
      UPDATE incidents
      SET name = ?, status = ?, priority = ?, description = ?, lat = ?, lon = ?, radius_m = ?, commander_id = ?, updated_at = ?, closed_at = ?
      WHERE id = ?
    `,
    ).run(
      updated.name,
      updated.status,
      updated.priority,
      updated.description || null,
      updated.lat,
      updated.lon,
      updated.radius_m,
      updated.commander_id || null,
      updated.updated_at,
      updated.closed_at || null,
      id,
    );

    return updated;
  }
}

export class NodeRepository {
  static list(): NodeRecord[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM sensor_nodes ORDER BY node_id ASC")
      .all() as unknown as NodeRecord[];
  }

  static findByNodeId(nodeId: string): NodeRecord | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM sensor_nodes WHERE node_id = ?").get(nodeId);
    return (row as unknown as NodeRecord) || null;
  }

  static upsert(node: Omit<NodeRecord, "created_at">): NodeRecord {
    const db = getDb();
    const existing = this.findByNodeId(node.node_id);
    const now = Date.now();

    if (existing) {
      db.prepare(
        `
        UPDATE sensor_nodes
        SET gateway_id = ?, name = ?, type = ?, lat = ?, lon = ?, alt = ?, battery = ?, status = ?, last_seen = ?
        WHERE node_id = ?
      `,
      ).run(
        node.gateway_id || null,
        node.name,
        node.type,
        node.lat,
        node.lon,
        node.alt,
        node.battery || null,
        node.status,
        node.last_seen || now,
        node.node_id,
      );
      return { ...existing, ...node, last_seen: node.last_seen || now };
    }

    db.prepare(
      `
      INSERT INTO sensor_nodes (id, node_id, gateway_id, name, type, lat, lon, alt, battery, status, last_seen, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      node.id,
      node.node_id,
      node.gateway_id || null,
      node.name,
      node.type,
      node.lat,
      node.lon,
      node.alt,
      node.battery || null,
      node.status,
      node.last_seen || now,
      now,
    );
    return { ...node, created_at: now };
  }
}

export class GatewayRepository {
  static list(): GatewayRecord[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM gateways ORDER BY gateway_id ASC")
      .all() as unknown as GatewayRecord[];
  }

  static findByGatewayId(gatewayId: string): GatewayRecord | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM gateways WHERE gateway_id = ?").get(gatewayId);
    return (row as unknown as GatewayRecord) || null;
  }

  static upsert(gw: Omit<GatewayRecord, "created_at">): GatewayRecord {
    const db = getDb();
    const existing = this.findByGatewayId(gw.gateway_id);
    const now = Date.now();

    if (existing) {
      db.prepare(
        `
        UPDATE gateways
        SET name = ?, type = ?, lat = ?, lon = ?, status = ?, last_seen = ?
        WHERE gateway_id = ?
      `,
      ).run(
        gw.name,
        gw.type,
        gw.lat || null,
        gw.lon || null,
        gw.status,
        gw.last_seen || now,
        gw.gateway_id,
      );
      return { ...existing, ...gw, last_seen: gw.last_seen || now };
    }

    db.prepare(
      `
      INSERT INTO gateways (id, gateway_id, name, type, lat, lon, status, api_key_hash, last_seen, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      gw.id,
      gw.gateway_id,
      gw.name,
      gw.type,
      gw.lat || null,
      gw.lon || null,
      gw.status,
      gw.api_key_hash || null,
      gw.last_seen || now,
      now,
    );
    return { ...gw, created_at: now };
  }
}

export class TelemetryRepository {
  static record(msg: Omit<TelemetryRecord, "id" | "created_at">): TelemetryRecord {
    const db = getDb();
    const id = `TLM-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO telemetry_messages (
        id, message_id, node_id, gateway_id, seq, protocol_version, timestamp, source,
        rssi, battery, sound_db, vibration_g, thermal_c, lat, lon, raw_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      msg.message_id,
      msg.node_id,
      msg.gateway_id || null,
      msg.seq,
      msg.protocol_version,
      msg.timestamp,
      msg.source,
      msg.rssi || null,
      msg.battery || null,
      msg.sound_db || null,
      msg.vibration_g || null,
      msg.thermal_c || null,
      msg.lat || null,
      msg.lon || null,
      msg.raw_payload || null,
      now,
    );

    return { ...msg, id, created_at: now };
  }

  static findByMessageId(messageId: string): TelemetryRecord | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM telemetry_messages WHERE message_id = ?").get(messageId);
    return (row as unknown as TelemetryRecord) || null;
  }

  static list(
    limit = 100,
    offset = 0,
    nodeId?: string | undefined,
    source?: string | undefined,
  ): { telemetry: TelemetryRecord[]; total: number } {
    const db = getDb();
    let query = "SELECT * FROM telemetry_messages WHERE 1=1";
    let countQuery = "SELECT count(*) as total FROM telemetry_messages WHERE 1=1";
    const params: SqlParam[] = [];

    if (nodeId) {
      query += " AND node_id = ?";
      countQuery += " AND node_id = ?";
      params.push(nodeId);
    }
    if (source) {
      query += " AND source = ?";
      countQuery += " AND source = ?";
      params.push(source);
    }

    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    const countRow = (db.prepare(countQuery).get(...params) as unknown as { total: number }) || {
      total: 0,
    };
    const rows = db.prepare(query).all(...params, limit, offset) as unknown as TelemetryRecord[];

    return { telemetry: rows, total: countRow.total };
  }
}

export class ObservationRepository {
  static create(obs: Omit<ObservationRecord, "id" | "created_at">): ObservationRecord {
    const db = getDb();
    const id = `OBS-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO observations (id, incident_id, telemetry_id, node_id, timestamp, rssi, distance_est_m, lat, lon, is_usable, rejection_reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      obs.incident_id || null,
      obs.telemetry_id || null,
      obs.node_id,
      obs.timestamp,
      obs.rssi,
      obs.distance_est_m,
      obs.lat,
      obs.lon,
      obs.is_usable,
      obs.rejection_reason || null,
      now,
    );

    return { ...obs, id, created_at: now };
  }

  static list(
    limit = 100,
    offset = 0,
    incidentId?: string | undefined,
  ): { observations: ObservationRecord[]; total: number } {
    const db = getDb();
    let query = "SELECT * FROM observations";
    let countQuery = "SELECT count(*) as total FROM observations";
    const params: SqlParam[] = [];

    if (incidentId) {
      query += " WHERE incident_id = ?";
      countQuery += " WHERE incident_id = ?";
      params.push(incidentId);
    }
    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
    const countRow = (db
      .prepare(countQuery)
      .get(...(incidentId ? [incidentId] : [])) as unknown as { total: number }) || { total: 0 };
    const rows = db.prepare(query).all(...params, limit, offset) as unknown as ObservationRecord[];

    return { observations: rows, total: countRow.total };
  }
}

export class LocalizationRepository {
  static recordRun(run: Omit<LocalizationRunRecord, "id" | "created_at">): LocalizationRunRecord {
    const db = getDb();
    const id = `LOC-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO localization_runs (
        id, incident_id, algorithm_version, run_at, usable_nodes_count, gdop, lat_est, lon_est, uncertainty_radius_m, confidence, status, warnings, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      run.incident_id || null,
      run.algorithm_version,
      run.run_at,
      run.usable_nodes_count,
      run.gdop || null,
      run.lat_est || null,
      run.lon_est || null,
      run.uncertainty_radius_m || null,
      run.confidence || null,
      run.status,
      run.warnings || null,
      now,
    );

    return { ...run, id, created_at: now };
  }

  static listRuns(limit = 20, incidentId?: string | undefined): LocalizationRunRecord[] {
    const db = getDb();
    let query = "SELECT * FROM localization_runs";
    const params: SqlParam[] = [];
    if (incidentId) {
      query += " WHERE incident_id = ?";
      params.push(incidentId);
    }
    query += " ORDER BY run_at DESC LIMIT ?";
    params.push(limit);
    return db.prepare(query).all(...params) as unknown as LocalizationRunRecord[];
  }
}

export class SearchZoneRepository {
  static create(zone: Omit<SearchZoneRecord, "id" | "created_at">): SearchZoneRecord {
    const db = getDb();
    const id = `ZONE-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO search_zones (
        id, incident_id, localization_run_id, center_lat, center_lon, radius_m, priority, status, shape_geojson, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      zone.incident_id || null,
      zone.localization_run_id || null,
      zone.center_lat,
      zone.center_lon,
      zone.radius_m,
      zone.priority,
      zone.status,
      zone.shape_geojson || null,
      now,
    );

    return { ...zone, id, created_at: now };
  }

  static list(limit = 50, incidentId?: string | undefined): SearchZoneRecord[] {
    const db = getDb();
    let query = "SELECT * FROM search_zones";
    const params: SqlParam[] = [];
    if (incidentId) {
      query += " WHERE incident_id = ?";
      params.push(incidentId);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    return db.prepare(query).all(...params) as unknown as SearchZoneRecord[];
  }
}

export class AlertRepository {
  static list(limit = 50, status?: string | undefined): AlertRecord[] {
    const db = getDb();
    let query = "SELECT * FROM alerts";
    const params: SqlParam[] = [];
    if (status) {
      query += " WHERE status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    return db.prepare(query).all(...params) as unknown as AlertRecord[];
  }

  static create(alert: Omit<AlertRecord, "id" | "created_at">): AlertRecord {
    const db = getDb();
    const id = `ALT-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO alerts (id, incident_id, severity, title, message, source, status, acknowledged_by, created_at, acknowledged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      alert.incident_id || null,
      alert.severity,
      alert.title,
      alert.message,
      alert.source,
      alert.status,
      alert.acknowledged_by || null,
      now,
      alert.acknowledged_at || null,
    );

    return { ...alert, id, created_at: now };
  }

  static acknowledge(id: string, userId: string): AlertRecord | null {
    const db = getDb();
    const now = Date.now();
    db.prepare(
      `
      UPDATE alerts
      SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `,
    ).run(userId, now, id);

    const row = db.prepare("SELECT * FROM alerts WHERE id = ?").get(id);
    return (row as unknown as AlertRecord) || null;
  }
}

export class EventRepository {
  static logAppEvent(evt: Omit<AppEventRecord, "id" | "created_at">): AppEventRecord {
    const db = getDb();
    const id = `EVT-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO application_events (id, incident_id, event_type, severity, title, details, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      evt.incident_id || null,
      evt.event_type,
      evt.severity,
      evt.title,
      evt.details || null,
      evt.actor_id || null,
      now,
    );

    return { ...evt, id, created_at: now };
  }

  static listAppEvents(limit = 100, incidentId?: string | undefined): AppEventRecord[] {
    const db = getDb();
    let query = "SELECT * FROM application_events";
    const params: SqlParam[] = [];
    if (incidentId) {
      query += " WHERE incident_id = ?";
      params.push(incidentId);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    return db.prepare(query).all(...params) as unknown as AppEventRecord[];
  }

  static logAuditEvent(evt: Omit<AuditEventRecord, "id" | "created_at">): AuditEventRecord {
    const db = getDb();
    const id = `AUD-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO audit_events (id, user_id, action, target_type, target_id, ip_address, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      evt.user_id || null,
      evt.action,
      evt.target_type,
      evt.target_id || null,
      evt.ip_address || null,
      evt.details_json || null,
      now,
    );

    return { ...evt, id, created_at: now };
  }
}

export class AnalyticsRepository {
  static getOverview(): {
    totalIncidents: number;
    activeIncidents: number;
    registeredNodes: number;
    onlineNodes: number;
    registeredGateways: number;
    totalTelemetryMessages: number;
    activeAlerts: number;
    totalLocalizationRuns: number;
  } {
    const db = getDb();
    const now = Date.now();

    const inc = db
      .prepare(
        "SELECT count(*) as total, sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active FROM incidents",
      )
      .get() as unknown as { total: number; active: number } | undefined;
    const nodes = db
      .prepare(
        "SELECT count(*) as total, sum(CASE WHEN status = 'online' AND (? - last_seen < 60000) THEN 1 ELSE 0 END) as online FROM sensor_nodes",
      )
      .get(now) as unknown as { total: number; online: number } | undefined;
    const gw = db.prepare("SELECT count(*) as total FROM gateways").get() as unknown as
      { total: number } | undefined;
    const tlm = db.prepare("SELECT count(*) as total FROM telemetry_messages").get() as unknown as
      { total: number } | undefined;
    const alr = db
      .prepare("SELECT count(*) as total FROM alerts WHERE status = 'active'")
      .get() as unknown as { total: number } | undefined;
    const loc = db.prepare("SELECT count(*) as total FROM localization_runs").get() as unknown as
      { total: number } | undefined;

    return {
      totalIncidents: inc?.total || 0,
      activeIncidents: inc?.active || 0,
      registeredNodes: nodes?.total || 0,
      onlineNodes: nodes?.online || 0,
      registeredGateways: gw?.total || 0,
      totalTelemetryMessages: tlm?.total || 0,
      activeAlerts: alr?.total || 0,
      totalLocalizationRuns: loc?.total || 0,
    };
  }
}

export interface CalibrationProfileRecord {
  id: string;
  name: string;
  ref_rssi: number;
  path_loss_exponent: number;
  rmse: number;
  r2: number;
  sample_count: number;
  distinct_distances: number;
  environment: string;
  frequency_mhz?: number | null | undefined;
  tx_power_dbm?: number | null | undefined;
  antenna_type?: string | null | undefined;
  warnings_json?: string | null | undefined;
  is_active: number;
  created_at: number;
}

export interface CalibrationSampleRecord {
  id: string;
  profile_id: string;
  distance: number;
  rssi: number;
  source: "live" | "manual" | "simulation";
  timestamp: number;
  notes?: string | null | undefined;
}

export class CalibrationRepository {
  static listProfiles(): CalibrationProfileRecord[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM calibration_profiles ORDER BY is_active DESC, created_at DESC")
      .all() as unknown as CalibrationProfileRecord[];
  }

  static getActiveProfile(): CalibrationProfileRecord | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM calibration_profiles WHERE is_active = 1 LIMIT 1")
      .get() as unknown as CalibrationProfileRecord | undefined;
    return row || null;
  }

  static createProfile(
    profile: Omit<CalibrationProfileRecord, "id" | "created_at">,
    samples?: Omit<CalibrationSampleRecord, "id" | "profile_id">[],
  ): CalibrationProfileRecord {
    const db = getDb();
    const id = "CAL-" + crypto.randomUUID().substring(0, 8).toUpperCase();
    const now = Date.now();

    if (profile.is_active) {
      db.prepare("UPDATE calibration_profiles SET is_active = 0").run();
    }

    db.prepare(
      `
      INSERT INTO calibration_profiles (
        id, name, ref_rssi, path_loss_exponent, rmse, r2, sample_count,
        distinct_distances, environment, frequency_mhz, tx_power_dbm,
        antenna_type, warnings_json, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      profile.name,
      profile.ref_rssi,
      profile.path_loss_exponent,
      profile.rmse,
      profile.r2,
      profile.sample_count,
      profile.distinct_distances,
      profile.environment,
      profile.frequency_mhz ?? null,
      profile.tx_power_dbm ?? null,
      profile.antenna_type ?? null,
      profile.warnings_json ?? null,
      profile.is_active ? 1 : 0,
      now,
    );

    if (Array.isArray(samples) && samples.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO calibration_samples (id, profile_id, distance, rssi, source, timestamp, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      samples.forEach((s) => {
        const sId = "SMP-" + crypto.randomUUID().substring(0, 8);
        stmt.run(sId, id, s.distance, s.rssi, s.source, s.timestamp || now, s.notes ?? null);
      });
    }

    return {
      id,
      ...profile,
      created_at: now,
    };
  }

  static activateProfile(id: string): boolean {
    const db = getDb();
    db.prepare("UPDATE calibration_profiles SET is_active = 0").run();
    const result = db.prepare("UPDATE calibration_profiles SET is_active = 1 WHERE id = ?").run(id);
    return (result.changes as number) > 0;
  }

  static getProfileSamples(profileId: string): CalibrationSampleRecord[] {
    const db = getDb();
    return db
      .prepare("SELECT * FROM calibration_samples WHERE profile_id = ? ORDER BY distance ASC")
      .all(profileId) as unknown as CalibrationSampleRecord[];
  }
}
