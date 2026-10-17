import { CHANNELS, type Sender, type ServerMessage } from "@mvp/shared";
import { Radio, Send, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { realtime, useChannel, useRealtimeStatus } from "@/lib/realtime";

type Entry = { id: number; at: string; msg: ServerMessage };
const MAX = 200;
let seq = 0;

export function LivePage() {
  const status = useRealtimeStatus();
  const [clients, setClients] = useState<number | null>(null);
  const [demo, setDemo] = useState<Entry[]>([]);
  const [items, setItems] = useState<Entry[]>([]);
  const [text, setText] = useState("");

  const push = (setter: typeof setDemo) => (msg: ServerMessage) =>
    setter((prev) => [{ id: ++seq, at: new Date().toLocaleTimeString(), msg }, ...prev].slice(0, MAX));

  useChannel(
    CHANNELS.system,
    useCallback((m: ServerMessage) => {
      if (m.type === "hello" || m.type === "presence") setClients((m.payload as { clients: number }).clients);
    }, []),
  );
  useChannel(CHANNELS.demo, useCallback(push(setDemo), []));
  useChannel(CHANNELS.items, useCallback(push(setItems), []));

  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) return;
    realtime.publish(CHANNELS.demo, { text: text.trim() });
    setText("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="size-4" /> Connection
          </CardTitle>
          <CardDescription>
            One WebSocket per tab at <code>/api/ws</code>, authenticated with your session cookie. Scripts
            connect the same way with <code>x-api-key</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={status === "open" ? "default" : "outline"}>{status}</Badge>
          <span className="text-muted-foreground">
            {clients === null ? "—" : `${clients} connected client${clients === 1 ? "" : "s"}`}
          </span>
          <span className="text-muted-foreground">
            Open this page in a second tab to see presence change.
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Channel <code>demo</code> <Badge variant="secondary">public</Badge>
          </CardTitle>
          <CardDescription>
            Anything you publish reaches every subscriber, with your name attached.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form onSubmit={send} className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something…" />
            <Button type="submit" disabled={status !== "open"} aria-label="Send">
              <Send />
            </Button>
          </form>
          <Log entries={demo} onClear={() => setDemo([])} empty="Nothing yet. Send a message." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Channel <code>items</code> <Badge variant="outline">private</Badge>
          </CardTitle>
          <CardDescription>
            Server events for your items only. Create one on the Items page or run{" "}
            <code>uv run examples/add_item.py --key …</code> and watch it arrive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Log entries={items} onClear={() => setItems([])} empty="No item events yet." />
        </CardContent>
      </Card>
    </div>
  );
}

function Log({ entries, onClear, empty }: { entries: Entry[]; onClear: () => void; empty: string }) {
  if (entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="max-h-80 overflow-y-auto rounded-md border font-mono text-xs">
        {entries.map((e) => (
          <li key={e.id} className="flex gap-3 border-b px-3 py-2 last:border-0">
            <span className="shrink-0 text-muted-foreground">{e.at}</span>
            <span className="shrink-0 font-semibold">{e.msg.type}</span>
            <span className="min-w-0 flex-1 truncate">{describe(e.msg)}</span>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="self-end" onClick={onClear}>
        <Trash2 /> Clear
      </Button>
    </div>
  );
}

function describe(msg: ServerMessage): string {
  if (msg.type === "message") {
    const p = msg.payload as { from: Sender; data: unknown };
    return `${p.from.name}: ${JSON.stringify(p.data)}`;
  }
  return JSON.stringify(msg.payload);
}
