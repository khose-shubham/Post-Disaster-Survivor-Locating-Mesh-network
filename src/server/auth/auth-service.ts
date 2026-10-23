import crypto from "node:crypto";
import {
  UserRepository,
  SessionRepository,
  type UserRecord,
  type SessionRecord,
} from "../db/repositories.ts";
import { verifyPassword, hashPassword } from "../db/database.ts";

export type Role = "Administrator" | "Incident Commander" | "Responder" | "Analyst" | "Viewer";

export type Permission =
  | "system:admin"
  | "users:manage"
  | "incidents:create"
  | "incidents:update"
  | "incidents:close"
  | "incidents:read"
  | "telemetry:ingest"
  | "telemetry:read"
  | "nodes:manage"
  | "nodes:read"
  | "localization:run"
  | "alerts:acknowledge"
  | "reports:export";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Administrator: [
    "system:admin",
    "users:manage",
    "incidents:create",
    "incidents:update",
    "incidents:close",
    "incidents:read",
    "telemetry:ingest",
    "telemetry:read",
    "nodes:manage",
    "nodes:read",
    "localization:run",
    "alerts:acknowledge",
    "reports:export",
  ],
  "Incident Commander": [
    "incidents:create",
    "incidents:update",
    "incidents:close",
    "incidents:read",
    "telemetry:ingest",
    "telemetry:read",
    "nodes:manage",
    "nodes:read",
    "localization:run",
    "alerts:acknowledge",
    "reports:export",
  ],
  Responder: [
    "incidents:read",
    "telemetry:ingest",
    "telemetry:read",
    "nodes:read",
    "alerts:acknowledge",
  ],
  Analyst: ["incidents:read", "telemetry:read", "nodes:read", "localization:run", "reports:export"],
  Viewer: ["incidents:read", "nodes:read"],
};

// In-memory rate limiting map for login attempts: ip -> { count, resetAt }
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const loginRateLimits = new Map<string, RateLimitEntry>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute lockout

export class AuthService {
  static checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const entry = loginRateLimits.get(ip);
    if (!entry) return { allowed: true };

    if (now > entry.resetAt) {
      loginRateLimits.delete(ip);
      return { allowed: true };
    }

    if (entry.count >= MAX_LOGIN_ATTEMPTS) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, retryAfterSeconds: retryAfter };
    }

    return { allowed: true };
  }

  static recordLoginAttempt(ip: string, success: boolean): void {
    const now = Date.now();
    if (success) {
      loginRateLimits.delete(ip);
      return;
    }

    const entry = loginRateLimits.get(ip);
    if (!entry || now > entry.resetAt) {
      loginRateLimits.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      entry.count += 1;
    }
  }

  static login(
    username: string,
    password: string,
    ip = "127.0.0.1",
    userAgent = "Unknown",
  ): {
    success: boolean;
    token?: string;
    user?: Omit<UserRecord, "password_hash" | "salt">;
    error?: string;
    statusCode?: number;
  } {
    const rateCheck = this.checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Too many login attempts. Please wait ${rateCheck.retryAfterSeconds} seconds.`,
        statusCode: 429,
      };
    }

    const user = UserRepository.findByUsername(username);
    if (!user) {
      this.recordLoginAttempt(ip, false);
      return { success: false, error: "Invalid username or password", statusCode: 401 };
    }

    const passwordMatches = verifyPassword(password, user.password_hash, user.salt);
    if (!passwordMatches) {
      this.recordLoginAttempt(ip, false);
      return { success: false, error: "Invalid username or password", statusCode: 401 };
    }

    // Success: Generate random session token
    this.recordLoginAttempt(ip, true);
    const rawToken = crypto.randomBytes(32).toString("hex");
    SessionRepository.create(user.id, rawToken, 24 * 60 * 60 * 1000, ip, userAgent);

    const { password_hash, salt, ...safeUser } = user;
    return {
      success: true,
      token: rawToken,
      user: safeUser,
    };
  }

  static authenticateRequest(request: Request): {
    user: Omit<UserRecord, "password_hash" | "salt"> | null;
    token: string | null;
  } {
    let token: string | null = null;

    // Check Authorization: Bearer <token>
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }

    // Fallback: Check Cookie: trace_session=<token>
    if (!token) {
      const cookieHeader = request.headers.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(/trace_session=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          token = match[1];
        }
      }
    }

    if (!token) {
      return { user: null, token: null };
    }

    const sessionData = SessionRepository.findByToken(token);
    if (!sessionData) {
      return { user: null, token: null };
    }

    const { password_hash, salt, ...safeUser } = sessionData.user;
    return { user: safeUser, token };
  }

  static hasPermission(user: { role: Role }, permission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes(permission);
  }

  static logout(token: string): void {
    SessionRepository.deleteByToken(token);
  }
}
