// TanStack Query hooks for the items API. This is the pattern for every
// resource: one query key family, hooks that call the typed `hc` client,
// mutations that invalidate the family on success.
import type { CreateItem, Item, ItemList, ItemStatus, UpdateItem } from "@mvp/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

export const itemKeys = {
  all: ["items"] as const,
  list: (filter: { status?: ItemStatus; q?: string }) => ["items", "list", filter] as const,
};

export function useItems(filter: { status?: ItemStatus; q?: string } = {}) {
  return useQuery({
    queryKey: itemKeys.list(filter),
    queryFn: () => api.api.items.$get({ query: filter }).then((r) => unwrap<ItemList>(r)),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateItem) => api.api.items.$post({ json: body }).then((r) => unwrap<Item>(r)),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateItem & { id: string }) =>
      api.api.items[":id"].$patch({ param: { id }, json: patch }).then((r) => unwrap<Item>(r)),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.items[":id"].$delete({ param: { id } });
      if (!res.ok) await unwrap(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  });
}
