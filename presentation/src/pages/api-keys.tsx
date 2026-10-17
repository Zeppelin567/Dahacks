import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authClient } from "@/lib/auth";

const KEYS = ["api-keys"] as const;

/** Unwrap Better Auth's `{ data, error }` client results. */
async function ok<T>(p: Promise<{ data: T | null; error: { message?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error || data === null) throw new Error(error?.message ?? "Request failed");
  return data;
}

type KeyRow = {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string | Date;
  lastRequest: string | Date | null;
  expiresAt: string | Date | null;
};

function fmt(d: string | Date | null) {
  return d ? new Date(d).toLocaleString() : "—";
}

export function ApiKeysPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<KeyRow | null>(null);

  const keys = useQuery({
    queryKey: KEYS,
    // list() returns { apiKeys, total, limit, offset }; we only need the rows.
    queryFn: (): Promise<KeyRow[]> => ok(authClient.apiKey.list()).then((r) => r.apiKeys),
  });

  const create = useMutation({
    mutationFn: (name: string) => ok(authClient.apiKey.create({ name })),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS });
      setCreating(false);
      setFreshKey(data.key);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (keyId: string) => ok(authClient.apiKey.delete({ keyId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS });
      setDeleting(null);
      toast.success("Key revoked");
    },
    onError: (e) => toast.error(e.message),
  });

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(String(new FormData(e.currentTarget).get("name")).trim());
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Keys let anything outside the browser call this API as you — a Python script, a Discord bot, a
          microcontroller. Send the key in an <code>x-api-key</code> header. Every route in{" "}
          <a href="/docs" className="underline underline-offset-4">
            /docs
          </a>{" "}
          accepts it.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New key
        </Button>
      </div>

      {freshKey && <FreshKeyPanel value={freshKey} onDismiss={() => setFreshKey(null)} />}

      {keys.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : keys.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not load keys</AlertTitle>
          <AlertDescription>{keys.error.message}</AlertDescription>
        </Alert>
      ) : keys.data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <KeyRound className="mx-auto mb-2 size-6" />
          <p>No keys yet. Create one to try the Python example in the repo.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="hidden md:table-cell">Last used</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{k.start ?? "mvp_"}…</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {fmt(k.createdAt)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {fmt(k.lastRequest)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Revoke key"
                      onClick={() => setDeleting(k)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                Name it after the thing that will use it. You will see the key once.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="raspberry-pi, discord-bot, notebook…"
                required
                maxLength={32}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using this key stops working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && remove.mutate(deleting.id)}
              disabled={remove.isPending}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FreshKeyPanel({ value, onDismiss }: { value: string; onDismiss: () => void }) {
  const origin = window.location.origin;
  const curl = `curl ${origin}/api/me -H "x-api-key: ${value}"`;
  const py = `uv run examples/add_item.py --key ${value} "Hello from Python"`;
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>Copy this key now — it is not stored in readable form</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <CopyRow value={value} mono />
        <div className="grid gap-2 text-xs">
          <span className="text-muted-foreground">Try it:</span>
          <CopyRow value={curl} mono small />
          <CopyRow value={py} mono small />
        </div>
        <div>
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Done, I copied it
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function CopyRow({ value, mono, small }: { value: string; mono?: boolean; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard unavailable — select and copy manually");
    }
  }
  return (
    <div className="flex items-center gap-2">
      <code
        className={`min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1 ${mono ? "font-mono" : ""} ${small ? "text-xs" : "text-sm"}`}
      >
        {value}
      </code>
      <Button variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy">
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
