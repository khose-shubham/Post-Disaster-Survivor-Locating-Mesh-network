export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "TRACE Operational Rescue REST API",
    version: "8.0.0",
    description:
      "Production-oriented REST API and Telemetry Ingestion Boundary for Triangulated Rescue Aid via Crowd-Signal Estimation.",
    contact: {
      name: "TRACE Research Team",
      url: "https://trace-rescue.internal",
    },
  },
  servers: [
    {
      url: "/api",
      description: "Local Operational Server",
    },
  ],
  paths: {
    "/auth/login": {
      post: {
        summary: "Authenticate user and receive session token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "password"],
                properties: {
                  username: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Login successful with session token" },
          "401": { description: "Invalid credentials" },
          "429": { description: "Rate limit exceeded" },
        },
      },
    },
    "/auth/me": {
      get: {
        summary: "Get current authenticated user identity and role",
        responses: {
          "200": { description: "Current user profile" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/incidents": {
      get: {
        summary: "List disaster incidents with status filter",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "Paginated incidents list" } },
      },
      post: {
        summary: "Create a new disaster incident",
        responses: { "201": { description: "Incident created" } },
      },
    },
    "/telemetry/ingest": {
      post: {
        summary: "Ingest physical ESP32 / LoRa sensor packet",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["nodeId", "seq", "source"],
                properties: {
                  nodeId: { type: "string" },
                  gatewayId: { type: "string" },
                  seq: { type: "integer" },
                  timestamp: { type: "integer" },
                  rssi: { type: "number" },
                  battery: { type: "integer" },
                  source: { type: "string", enum: ["live", "sim"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Packet accepted and recorded in database" },
          "400": { description: "Validation failed" },
        },
      },
    },
    "/localization/run": {
      post: {
        summary: "Execute transparent multilateration estimation pipeline",
        responses: {
          "200": { description: "Localization result and hypothetical search zone" },
        },
      },
    },
    "/health": {
      get: {
        summary: "Service liveness and engine status",
        responses: { "200": { description: "Server is healthy" } },
      },
    },
    "/ready": {
      get: {
        summary: "Database connectivity and readiness check",
        responses: { "200": { description: "Database is ready" } },
      },
    },
    "/events/stream": {
      get: {
        summary: "Server-Sent Events (SSE) real-time event stream",
        responses: { "200": { description: "Event stream active" } },
      },
    },
  },
};
