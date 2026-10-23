import { EventEmitter } from "node:events";

export interface RealtimeEvent {
  id: string;
  type:
    | "telemetry:accepted"
    | "node:status_changed"
    | "gateway:status_changed"
    | "incident:updated"
    | "detection:recorded"
    | "localization:completed"
    | "search_zone:updated"
    | "alert:created"
    | "alert:acknowledged";
  timestamp: number;
  incidentId?: string | null | undefined;
  data: unknown;
}

class TraceEventBus extends EventEmitter {
  publish(
    event: Omit<RealtimeEvent, "id" | "timestamp"> & {
      id?: string | undefined;
      timestamp?: number | undefined;
    },
  ): RealtimeEvent {
    const fullEvent: RealtimeEvent = {
      id: event.id || `RTE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: event.timestamp || Date.now(),
      type: event.type,
      incidentId: event.incidentId || null,
      data: event.data,
    };

    this.emit("trace_event", fullEvent);
    if (fullEvent.incidentId) {
      this.emit(`incident:${fullEvent.incidentId}`, fullEvent);
    }
    return fullEvent;
  }
}

export const eventBus = new TraceEventBus();
// Increase listener limit to support multiple connected clients
eventBus.setMaxListeners(200);
