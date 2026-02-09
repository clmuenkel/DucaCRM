"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import type { ActivityLog, ActivityLogWithContact, InsertTables } from "@/types/database";

export function useActivity(filters?: {
  contactId?: string;
  limit?: number;
}) {
    return useQuery<ActivityLogWithContact[]>({
    queryKey: ["activity", filters],
    queryFn: async () => {
      let query = insforge.database
        .from("activity_log")
        .select("*, contacts(id, first_name, last_name)")
        .order("created_at", { ascending: false });

      if (filters?.contactId) {
        query = query.eq("contact_id", filters.contactId);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as ActivityLogWithContact[];
    },
  });
}

export function useRecentActivity() {
    return useQuery<ActivityLogWithContact[]>({
    queryKey: ["activity", "recent"],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("activity_log")
        .select("*, contacts(id, first_name, last_name, company_name)")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as unknown as ActivityLogWithContact[];
    },
  });
}

export function useLogActivity() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activity: InsertTables<"activity_log">) => {
      const { data, error } = await insforge.database
        .from("activity_log")
        .insert([activity as any])
        .select()
        .single();
      if (error) throw error;
      return data as ActivityLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
