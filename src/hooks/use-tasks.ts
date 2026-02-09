"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import type { Task, TaskWithContact, InsertTables, UpdateTables } from "@/types/database";

export function useTasks(filters?: {
  status?: string;
  contactId?: string;
  dueToday?: boolean;
  limit?: number;
}) {
    return useQuery<TaskWithContact[]>({
    queryKey: ["tasks", filters],
    queryFn: async () => {
      let query = insforge.database
        .from("tasks")
        .select("*, contacts(id, first_name, last_name, company_name)")
        .order("due_date", { ascending: true, nullsFirst: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      if (filters?.contactId) {
        query = query.eq("contact_id", filters.contactId);
      }

      if (filters?.dueToday) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        query = query
          .gte("due_date", today.toISOString())
          .lt("due_date", tomorrow.toISOString());
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as TaskWithContact[];
    },
  });
}

export function useTodayTasks() {
    return useQuery<TaskWithContact[]>({
    queryKey: ["tasks", "today"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const { data, error } = await insforge.database
        .from("tasks")
        .select("*, contacts(id, first_name, last_name, company_name)")
        .eq("status", "todo")
        .lte("due_date", today.toISOString())
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) throw error;
      return data as unknown as TaskWithContact[];
    },
  });
}

export function useCreateTask() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: InsertTables<"tasks">) => {
      const { data, error } = await insforge.database
        .from("tasks")
        .insert([task])
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateTables<"tasks">;
    }) => {
      const { data, error } = await insforge.database
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCompleteTask() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await insforge.database
        .from("tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteTask() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
