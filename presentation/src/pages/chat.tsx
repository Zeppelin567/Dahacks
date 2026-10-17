import { useChat } from "@ai-sdk/react";
import type { LlmStatus } from "@mvp/shared";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { Bot, CircleAlert, Loader2, RotateCcw, Send, Square, UserRound } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";

// One transport instance for the page; same-origin, so the session cookie rides along.
const transport = new DefaultChatTransport({ api: "/api/chat" });

export function ChatPage() {
  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat({ transport });
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  const llm = useQuery({
    queryKey: ["chat", "status"],
    queryFn: () => api.api.chat.status.$get().then((r) => unwrap<LlmStatus>(r)),
    staleTime: 60_000,
  });

  // Keep the newest message in view as it streams.
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (lastMessage) bottom.current?.scrollIntoView({ block: "end" });
  }, [lastMessage]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-[calc(100svh-7.5rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {llm.data?.mock ? (
          <>
            <Badge variant="outline">mock mode</Badge>
            <span className="text-muted-foreground">
              {llm.data.reason}. Replies are synthesized locally; add a key to <code>.env</code> to use a real
              model.
            </span>
          </>
        ) : llm.data ? (
          <>
            <Badge>{llm.data.provider}</Badge>
            <span className="font-mono text-muted-foreground">{llm.data.model}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Checking model…</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Bot className="size-8" />
            <p>Ask anything. The reply streams token by token.</p>
            <p className="text-xs">
              Swap providers with one env var: LLM_PROVIDER=anthropic | openai | google.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                {m.role === "user" ? <UserRound className="size-4" /> : <Bot className="size-4" />}
              </span>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {m.parts
                  .filter((part): part is { type: "text"; text: string } => part.type === "text")
                  .map((part) => part.text)
                  .join("")}
              </div>
            </div>
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>The model call failed</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {error.message}
            <Button size="sm" variant="outline" onClick={() => regenerate()}>
              <RotateCcw /> Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Message… (Enter to send, Shift+Enter for a new line)"
          rows={2}
          className="resize-none"
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={stop} aria-label="Stop">
            <Square />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label="Send">
            <Send />
          </Button>
        )}
      </form>
    </div>
  );
}
