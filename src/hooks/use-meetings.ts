"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import type { Meeting, MeetingWithContact, InsertTables, UpdateTables } from "@/types/database";

export function useMeetings(filters?: {
  contactId?: string;
  companyId?: string;
  status?: string;
  upcoming?: boolean;
  past?: boolean;
  limit?: number;
}) {
    return useQuery<MeetingWithContact[]>({
    queryKey: ["meetings", filters],
    queryFn: async () => {
      let query = insforge.database
        .from("meetings")
        .select("*, contacts(id, first_name, last_name, company_name, title)");

      if (filters?.contactId) {
        query = query.eq("contact_id", filters.contactId);
      }

      if (filters?.companyId) {
        query = query.eq("company_id", filters.companyId);
      }

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      if (filters?.upcoming) {
        query = query
          .eq("status", "scheduled")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true });
      } else if (filters?.past) {
        query = query
          .lt("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: false });
      } else {
        // Default: newest first
        query = query.order("scheduled_at", { ascending: false });
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as MeetingWithContact[];
    },
  });
}

export function useAllMeetings() {
    return useQuery<MeetingWithContact[]>({
    queryKey: ["meetings", "all"],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("meetings")
        .select("*, contacts(id, first_name, last_name, company_name, title)")
        .order("scheduled_at", { ascending: false });

      if (error) throw error;
      return data as unknown as MeetingWithContact[];
    },
  });
}

export function useMeeting(id: string) {
    return useQuery<MeetingWithContact | null>({
    queryKey: ["meetings", id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await insforge.database
        .from("meetings")
        .select("*, contacts(id, first_name, last_name, company_name, title, email, phone)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as unknown as MeetingWithContact;
    },
    enabled: !!id,
  });
}

export function useUpcomingMeetings(days: number = 7) {
    return useQuery<MeetingWithContact[]>({
    queryKey: ["meetings", "upcoming", days],
    queryFn: async () => {
      // Use start of today instead of now, so all today's meetings show
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const { data, error } = await insforge.database
        .from("meetings")
        .select("*, contacts(id, first_name, last_name, company_name, title)")
        .eq("status", "scheduled")
        .gte("scheduled_at", startOfToday.toISOString())
        .lte("scheduled_at", futureDate.toISOString())
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return data as unknown as MeetingWithContact[];
    },
  });
}

export function useTodaysMeetings() {
    return useQuery<MeetingWithContact[]>({
    queryKey: ["meetings", "today"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data, error } = await insforge.database
        .from("meetings")
        .select("*, contacts(id, first_name, last_name, company_name, title)")
        .eq("status", "scheduled")
        .gte("scheduled_at", today.toISOString())
        .lt("scheduled_at", tomorrow.toISOString())
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return data as unknown as MeetingWithContact[];
    },
  });
}

export function useMeetingsBookedToday() {
    return useQuery<number>({
    queryKey: ["meetings", "booked-today"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Query meetings CREATED today (booked today), not scheduled today
      const { data, error } = await insforge.database
        .from("meetings")
        .select("id")
        .gte("created_at", today.toISOString())
        .lt("created_at", tomorrow.toISOString());

      if (error) throw error;
      return data?.length || 0;
    },
  });
}

export function useCreateMeeting() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (meeting: InsertTables<"meetings">) => {
      const { data, error } = await insforge.database
        .from("meetings")
        .insert([meeting])
        .select()
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: () => {
      // Invalidate all meetings queries including booked-today for dashboard stats
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useUpdateMeeting() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateTables<"meetings">;
    }) => {
      const { data, error } = await insforge.database
        .from("meetings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useCompleteMeeting() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      outcome,
      notes,
    }: {
      id: string;
      outcome: string;
      notes?: string;
    }) => {
      const { data, error } = await insforge.database
        .from("meetings")
        .update({
          status: "completed",
          outcome,
          outcome_notes: notes,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useCancelMeeting() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await insforge.database
        .from("meetings")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useDeleteMeeting() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
