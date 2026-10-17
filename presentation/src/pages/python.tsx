import type { PyStatus } from "@mvp/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileImage, Terminal, Type } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api";

/** Call a Python route through the api. FormData or JSON, your choice. */
async function callPy<T>(path: string, init: RequestInit): Promise<T> {
  return unwrap<T>(await fetch(`/api/py${path}`, { credentials: "include", ...init }));
}

export function PythonPage() {
  const status = useQuery({
    queryKey: ["py", "status"],
    queryFn: () => api.api.py.status.$get().then((r) => unwrap<PyStatus>(r)),
    refetchInterval: 5000,
  });
  const up = status.data?.up === true;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-4" /> Python side-car
          </CardTitle>
          <CardDescription>
            A FastAPI service in <code>py/</code>, reached only through this api at <code>/api/py/*</code> so
            your login and API keys work there too. Put OpenCV, numpy, torch or ROS bridges behind it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          {status.isPending ? (
            <Skeleton className="h-6 w-40" />
          ) : up ? (
            <>
              <Badge>
                <CircleCheck /> running
              </Badge>
              <span className="font-mono text-muted-foreground">
                {status.data?.url} · v{status.data?.version}
              </span>
              <a href="/docs" className="underline underline-offset-4">
                Python routes in the docs page
              </a>
            </>
          ) : (
            <>
              <Badge variant="outline">
                <CircleAlert /> not running
              </Badge>
              <span className="text-muted-foreground">
                Optional. Start it in a second terminal: <code>npm run dev:py</code> (needs{" "}
                <a href="https://docs.astral.sh/uv/" className="underline underline-offset-4">
                  uv
                </a>
                ).
              </span>
            </>
          )}
        </CardContent>
      </Card>

      <ImageStatsCard disabled={!up} />
      <TextStatsCard disabled={!up} />
    </div>
  );
}

type ImageStats = {
  filename: string | null;
  format: string | null;
  mode: string;
  width: number;
  height: number;
  bytes: number;
  mean_brightness: number;
};

function ImageStatsCard({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const run = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.append("file", f);
      return callPy<ImageStats>("/image/stats", { method: "POST", body: form });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="size-4" /> Bytes in, numbers out
        </CardTitle>
        <CardDescription>
          <code>POST /api/py/image/stats</code> — Pillow decodes the upload and reports size and brightness.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2">
          <Label htmlFor="img">Image</Label>
          <Input
            id="img"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button disabled={disabled || !file || run.isPending} onClick={() => file && run.mutate(file)}>
          Analyse
        </Button>
        <Result data={run.data} error={run.error} />
      </CardContent>
    </Card>
  );
}

type TextStats = { characters: number; words: number; lines: number; top_words: [string, number][] };

function TextStatsCard({ disabled }: { disabled: boolean }) {
  const run = useMutation({
    mutationFn: (text: string) =>
      callPy<TextStats>("/text/stats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }),
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get("text"));
    if (text.trim()) run.mutate(text);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="size-4" /> Text in, JSON out
        </CardTitle>
        <CardDescription>
          <code>POST /api/py/text/stats</code> — the shape for NLP, parsing, or anything with a Python
          library.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Textarea
            name="text"
            rows={4}
            placeholder="Paste some text…"
            defaultValue="the quick brown fox jumps over the lazy dog the end"
          />
          <Button type="submit" disabled={disabled || run.isPending}>
            Analyse
          </Button>
          <Result data={run.data} error={run.error} />
        </form>
      </CardContent>
    </Card>
  );
}

function Result({ data, error }: { data: unknown; error: Error | null }) {
  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Request failed</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (data === undefined) return null;
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
  );
}
