"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import type { Contact, InsertTables, UpdateTables } from "@/types/database";

export function useContacts(filters?: {
  stage?: string;
  search?: string;
  limit?: number;
  cadenceStatus?: string;
  orderBy?: "created_at" | "priority_score" | "last_contacted_at";
  minPriority?: number;
  industry?: string;
}) {
  return useQuery<Contact[]>({
    queryKey: ["contacts", filters],
    queryFn: async () => {
      let query = insforge.database
        .from("contacts")
        .select("*")
        .eq("status", "active");

      // Stage filter
      if (filters?.stage && filters.stage !== "all") {
        query = query.eq("stage", filters.stage);
      }

      // Cadence status filter
      if (filters?.cadenceStatus && filters.cadenceStatus !== "all") {
        query = query.eq("cadence_status", filters.cadenceStatus);
      }

      // Industry filter
      if (filters?.industry && filters.industry !== "all") {
        query = query.eq("industry", filters.industry);
      }

      // Minimum priority filter
      if (filters?.minPriority) {
        query = query.gte("priority_score", filters.minPriority);
      }

      // Search filter
      if (filters?.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        );
      }

      // Ordering
      if (filters?.orderBy === "priority_score") {
        query = query.order("priority_score", { ascending: false, nullsFirst: false });
      } else if (filters?.orderBy === "last_contacted_at") {
        query = query.order("last_contacted_at", { ascending: false, nullsFirst: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      // Limit
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useContact(id: string) {
  return useQuery<Contact>({
    queryKey: ["contact", id],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("contacts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Contact;
    },
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: InsertTables<"contacts">) => {
      const { data, error } = await insforge.database
        .from("contacts")
        .insert([contact])
        .select()
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateTables<"contacts">;
    }) => {
      const { data, error } = await insforge.database
        .from("contacts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact", data.id] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useBulkCreateContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contacts: InsertTables<"contacts">[]) => {
      const { data, error } = await insforge.database
        .from("contacts")
        .insert(contacts)
        .select();
      if (error) throw error;
      return data as Contact[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useContactsByStage() {
  return useQuery<Record<string, number>>({
    queryKey: ["contacts-by-stage"],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("contacts")
        .select("stage")
        .eq("status", "active");
      
      if (error) throw error;

      const counts: Record<string, number> = {};
      data.forEach((contact: any) => {
        counts[contact.stage] = (counts[contact.stage] || 0) + 1;
      });
      
      return counts;
    },
  });
}
