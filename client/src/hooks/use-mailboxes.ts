import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

type InsertMailbox = z.infer<typeof api.mailboxes.create.input>;
type UpdateMailbox = z.infer<typeof api.mailboxes.update.input>;

export function useMailboxes() {
  return useQuery({
    queryKey: [api.mailboxes.list.path],
    queryFn: async () => {
      const res = await fetch(api.mailboxes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch mailboxes");
      return api.mailboxes.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertMailbox) => {
      const res = await fetch(api.mailboxes.create.path, {
        method: api.mailboxes.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create mailbox");
      return api.mailboxes.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mailboxes.list.path] });
    },
  });
}

export function useUpdateMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateMailbox }) => {
      const url = buildUrl(api.mailboxes.update.path, { id });
      const res = await fetch(url, {
        method: api.mailboxes.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update mailbox");
      return api.mailboxes.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mailboxes.list.path] });
    },
  });
}

export function useDeleteMailbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.mailboxes.delete.path, { id });
      const res = await fetch(url, {
        method: api.mailboxes.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete mailbox");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mailboxes.list.path] });
    },
  });
}
