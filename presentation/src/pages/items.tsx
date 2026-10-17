import { CHANNELS, ITEM_STATUSES, type Item, type ItemStatus } from "@mvp/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { itemKeys, useCreateItem, useDeleteItem, useItems, useUpdateItem } from "@/lib/items";
import { useChannel } from "@/lib/realtime";

const STATUS_LABEL: Record<ItemStatus, string> = { todo: "To do", doing: "Doing", done: "Done" };
const STATUS_VARIANT: Record<ItemStatus, "outline" | "secondary" | "default"> = {
  todo: "outline",
  doing: "secondary",
  done: "default",
};

type Filter = ItemStatus | "all";

export function ItemsPage() {
  const [status, setStatus] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);

  const list = useItems({ status: status === "all" ? undefined : status, q: q.trim() || undefined });

  // Any items.* event for this user (another tab, a script, a bot) refreshes the list.
  const qc = useQueryClient();
  useChannel(
    CHANNELS.items,
    useCallback(() => {
      qc.invalidateQueries({ queryKey: itemKeys.all });
    }, [qc]),
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles…"
            className="w-56 pl-8"
            aria-label="Search items"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as Filter)}>
          <SelectTrigger className="w-36" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ITEM_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setEditing("new")}>
          <Plus /> New item
        </Button>
      </div>

      {list.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : list.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not load items</AlertTitle>
          <AlertDescription>{list.error.message}</AlertDescription>
        </Alert>
      ) : list.data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>No items yet.</p>
          <p className="mt-1 text-sm">
            Create one above, or run <code>npm run db:seed</code> and sign in as <code>demo@example.com</code>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">
                    {item.notes}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {new Date(item.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Item actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(item)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(item)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ItemDialog item={editing} onClose={() => setEditing(null)} />
      <DeleteDialog item={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function ItemDialog({ item, onClose }: { item: Item | "new" | null; onClose: () => void }) {
  const create = useCreateItem();
  const update = useUpdateItem();
  const isNew = item === "new";
  const busy = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      notes: String(form.get("notes")) || null,
      status: form.get("status") as ItemStatus,
    };
    try {
      if (isNew) {
        await create.mutateAsync(body);
        toast.success("Item created");
      } else if (item) {
        await update.mutateAsync({ id: item.id, ...body });
        toast.success("Item updated");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* key resets the form when switching between items */}
        <form key={isNew ? "new" : item?.id} onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{isNew ? "New item" : "Edit item"}</DialogTitle>
            <DialogDescription>
              {isNew ? "Validated by the same Zod schema the api uses." : "Changes are saved with a PATCH."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={isNew ? "" : item?.title} required maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={isNew ? "" : (item?.notes ?? "")} rows={3} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={isNew ? "todo" : item?.status}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const del = useDeleteItem();
  async function confirm() {
    if (!item) return;
    try {
      await del.mutateAsync(item.id);
      toast.success("Item deleted");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }
  return (
    <AlertDialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{item?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={del.isPending}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
