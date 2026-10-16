// One WebSocket per tab, shared by every component through hooks.
// Reconnects with backoff, re-subscribes after a reconnect, and exposes
// connection status so the UI can show a dot instead of lying.
import type { ClientMessage, ServerMessage } from "@mvp/shared";
import { useEffect, useSyncExternalStore } from "react";

export type RealtimeStatus = "connecting" | "open" | "closed";
type Handler = (msg: ServerMessage) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = "closed";
  private statusListeners = new Set<() => void>();
  private handlers = new Map<string, Set<Handler>>(); // channel → handlers
  private everyHandlers = new Set<Handler>();
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wanted = false;

  get url() {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/api/ws`;
  }

  /** Called by the first subscriber; safe to call repeatedly. */
  connect() {
    this.wanted = true;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.setStatus("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus("open");
      // Re-subscribe to every channel someone is listening on.
      for (const channel of this.handlers.keys()) this.send({ type: "subscribe", channel });
    };
    ws.onmessage = (evt) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(evt.data)) as ServerMessage;
      } catch {
        return;
      }
      for (const h of this.everyHandlers) h(msg);
      const set = this.handlers.get(msg.channel);
      if (set) for (const h of set) h(msg);
    };
    ws.onclose = () => {
      this.ws = null;
      this.setStatus("closed");
      if (this.wanted) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  disconnect() {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

  private scheduleReconnect() {
    const delay = Math.min(30_000, 500 * 2 ** this.attempts++);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Publish an arbitrary payload to a public channel. */
  publish(channel: string, payload: unknown) {
    this.send({ type: "publish", channel, payload });
  }

  /** Listen on a channel (subscribing server-side). Returns an unsubscribe fn. */
  on(channel: string, handler: Handler): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      this.send({ type: "subscribe", channel });
    }
    set.add(handler);
    this.connect();
    return () => {
      set?.delete(handler);
      if (set && set.size === 0) {
        this.handlers.delete(channel);
        this.send({ type: "unsubscribe", channel });
      }
    };
  }

  /** Listen to every frame (for debug views). */
  onAny(handler: Handler): () => void {
    this.everyHandlers.add(handler);
    this.connect();
    return () => this.everyHandlers.delete(handler);
  }

  // --- status as an external store for React ---
  private setStatus(s: RealtimeStatus) {
    this.status = s;
    for (const l of this.statusListeners) l();
  }
  subscribeStatus = (l: () => void) => {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  };
  getStatus = () => this.status;
}

export const realtime = new RealtimeClient();

/** Current connection status; also ensures a connection is attempted. */
export function useRealtimeStatus(): RealtimeStatus {
  useEffect(() => {
    realtime.connect();
  }, []);
  return useSyncExternalStore(realtime.subscribeStatus, realtime.getStatus, () => "closed" as const);
}

/** Run `handler` for every message on `channel` while the component is mounted. */
export function useChannel(channel: string, handler: Handler) {
  useEffect(() => realtime.on(channel, handler), [channel, handler]);
}
