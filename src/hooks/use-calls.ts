"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/insforge/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Call, CallWithContact, InsertTables } from "@/types/database";

const SESSION_GAP_MINUTES = 30;

export function useCalls(filters?: {
  contactId?: string;
  companyId?: string;
  limit?: number;
  today?: boolean;
}) {
    return useQuery<CallWithContact[]>({
    queryKey: ["calls", filters],
    queryFn: async () => {
      let query = insforge.database
        .from("calls")
        .select("*, contacts(id, first_name, last_name, company_name)")
        .order("started_at", { ascending: false });

      if (filters?.contactId) {
        query = query.eq("contact_id", filters.contactId);
      }

      if (filters?.today) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte("started_at", today.toISOString());
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as CallWithContact[];
    },
  });
}

interface CallStats {
  total: number;
  connected: number;
  voicemail: number;
  noAnswer: number;
  meetingsBooked: number;
}

export function useTodayCallStats() {
    return useQuery<CallStats>({
    queryKey: ["calls", "today-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: callData, error } = await insforge.database
        .from("calls")
        .select("outcome, disposition")
        .gte("started_at", today.toISOString());

      if (error) throw error;

      const data = callData as { outcome: string | null; disposition: string | null }[];
      const stats: CallStats = {
        total: data.length,
        connected: data.filter((c) => c.outcome === "connected").length,
        voicemail: data.filter((c) => c.outcome === "voicemail").length,
        noAnswer: data.filter((c) => c.outcome === "no_answer").length,
        meetingsBooked: data.filter((c) => c.disposition === "interested_meeting").length,
      };

      return stats;
    },
  });
}

export function useCreateCall() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (call: InsertTables<"calls">) => {
      const { data, error } = await insforge.database
        .from("calls")
        .insert([call as any])
        .select()
        .single();
      if (error) throw error;

      // Update contact's last_contacted_at 
      await (insforge.database as any)
        .from("contacts")
        .update({
          last_contacted_at: new Date().toISOString(),
        })
        .eq("id", call.contact_id);

      return data as Call;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useLogCall() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      call,
      createTask,
    }: {
      call: InsertTables<"calls">;
      createTask?: {
        title: string;
        due_date: string;
        contact_id: string;
        user_id: string;
      };
    }) => {
      // Insert the call
      const { data: callData, error: callError } = await insforge.database
        .from("calls")
        .insert(call as any)
        .select()
        .single();
      
      if (callError) throw callError;

      // Create follow-up task if specified
      let taskId: string | undefined;
      if (createTask) {
        const { data: taskData, error: taskError } = await insforge.database
          .from("tasks")
          .insert({
            ...createTask,
            type: "follow_up",
          } as any)
          .select()
          .single();

        if (taskError) throw taskError;
        taskId = (taskData as { id: string }).id;

        // Update call with task reference
        await (insforge.database as any)
          .from("calls")
          .update({ follow_up_task_id: taskId })
          .eq("id", (callData as { id: string }).id);
      }

      // Update contact - fetch current total_calls first, then increment
      const { data: currentContactData } = await insforge.database
        .from("contacts")
        .select("total_calls")
        .eq("id", call.contact_id)
        .single();
      
      const currentContact = currentContactData as { total_calls: number | null } | null;
      const newTotalCalls = (currentContact?.total_calls || 0) + 1;
      
      const { error: contactError } = await (insforge.database as any)
        .from("contacts")
        .update({
          last_contacted_at: new Date().toISOString(),
          total_calls: newTotalCalls,
        })
        .eq("id", call.contact_id);

      if (contactError) throw contactError;

      // Log activity
      await insforge.database.from("activity_log").insert({
        user_id: call.user_id,
        contact_id: call.contact_id,
        activity_type: "call",
        reference_type: "call",
        reference_id: (callData as { id: string }).id,
        summary: `Call - ${call.outcome}${call.disposition ? ` (${call.disposition})` : ""}`,
        metadata: {
          outcome: call.outcome,
          disposition: call.disposition,
          duration: call.duration_seconds,
        },
      } as any);

      // Update or create dialer session (using any to bypass strict typing for new table)
      try {
        const now = new Date();
        const gapThreshold = new Date(now.getTime() - SESSION_GAP_MINUTES * 60 * 1000);

        // Find the most recent session
        const { data: recentSession } = await (insforge.database as any)
          .from("dialer_sessions")
          .select("*")
          .eq("user_id", call.user_id)
          .gte("started_at", gapThreshold.toISOString())
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (recentSession && (!recentSession.ended_at || new Date(recentSession.ended_at) > gapThreshold)) {
          // Update existing session
          const updates: Record<string, any> = {
            total_calls: (recentSession.total_calls || 0) + 1,
            ended_at: now.toISOString(),
          };

          // Increment the appropriate outcome counter
          switch (call.outcome) {
            case "connected":
              updates.connected_calls = (recentSession.connected_calls || 0) + 1;
              updates.total_talk_time_seconds = (recentSession.total_talk_time_seconds || 0) + (call.duration_seconds || 0);
              break;
            case "voicemail":
              updates.voicemails = (recentSession.voicemails || 0) + 1;
              break;
            case "no_answer":
              updates.no_answers = (recentSession.no_answers || 0) + 1;
              break;
            case "skipped":
              updates.skipped = (recentSession.skipped || 0) + 1;
              break;
            case "gatekeeper":
              updates.gatekeepers = (recentSession.gatekeepers || 0) + 1;
              break;
            case "wrong_number":
              updates.wrong_numbers = (recentSession.wrong_numbers || 0) + 1;
              break;
            case "busy":
              updates.busy = (recentSession.busy || 0) + 1;
              break;
          }

          await (insforge.database as any)
            .from("dialer_sessions")
            .update(updates)
            .eq("id", recentSession.id);
        } else {
          // Create new session
          await (insforge.database as any).from("dialer_sessions").insert({
            user_id: call.user_id,
            started_at: now.toISOString(),
            total_calls: 1,
            connected_calls: call.outcome === "connected" ? 1 : 0,
            voicemails: call.outcome === "voicemail" ? 1 : 0,
            no_answers: call.outcome === "no_answer" ? 1 : 0,
            skipped: call.outcome === "skipped" ? 1 : 0,
            gatekeepers: call.outcome === "gatekeeper" ? 1 : 0,
            wrong_numbers: call.outcome === "wrong_number" ? 1 : 0,
            busy: call.outcome === "busy" ? 1 : 0,
            total_talk_time_seconds: call.outcome === "connected" ? (call.duration_seconds || 0) : 0,
          });
        }
      } catch (sessionError) {
        // Session tracking is non-critical, don't fail the call log
        console.error("Session tracking error:", sessionError);
      }

      return callData as Call;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["dialer-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}
