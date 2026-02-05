"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/insforge/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { 
  DialerSession, 
  DialerSessionInsert, 
  DialerSessionUpdate,
  SessionWithStats 
} from "@/types/analytics";

const SESSION_GAP_MINUTES = 30; // Gap of 30+ minutes = new session

// Get all sessions for a date range
export function useSessions(options?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
    return useQuery({
    queryKey: ["dialer-sessions", DEFAULT_USER_ID, options],
    queryFn: async () => {
      let query = (insforge.database as any)
        .from("dialer_sessions")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .order("started_at", { ascending: false });

      if (options?.startDate) {
        query = query.gte("started_at", options.startDate);
      }
      if (options?.endDate) {
        query = query.lte("started_at", options.endDate);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === "42P01") return []; // Table doesn't exist
        throw error;
      }

      // Compute additional stats
      return (data as DialerSession[]).map((session): SessionWithStats => ({
        ...session,
        answer_rate: session.total_calls > 0 
          ? Math.round((session.connected_calls / (session.total_calls - session.skipped)) * 100) 
          : 0,
        set_rate: session.connected_calls > 0 
          ? Math.round((session.meetings_booked / session.connected_calls) * 100) 
          : 0,
        calls_per_hour: session.duration_seconds && session.duration_seconds > 0
          ? Math.round((session.total_calls / (session.duration_seconds / 3600)) * 10) / 10
          : 0,
      }));
    },
  });
}

// Get today's sessions
export function useTodaySessions() {
  const today = new Date().toISOString().split("T")[0];
  return useSessions({
    startDate: `${today}T00:00:00`,
    endDate: `${today}T23:59:59`,
  });
}

// Get the current active session (or most recent)
export function useCurrentSession() {
    return useQuery({
    queryKey: ["current-session", DEFAULT_USER_ID],
    queryFn: async () => {
      // Get the most recent session that hasn't ended (or ended recently)
      const { data, error } = await (insforge.database as any)
        .from("dialer_sessions")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .order("started_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116" || error.code === "42P01") return null;
        throw error;
      }

      return data as DialerSession;
    },
  });
}

// Create a new session
export function useCreateSession() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: Omit<DialerSessionInsert, "user_id">) => {
      const { data, error } = await (insforge.database as any)
        .from("dialer_sessions")
        .insert({
          ...session,
          user_id: DEFAULT_USER_ID,
        })
        .select()
        .single();

      if (error) throw error;
      return data as DialerSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dialer-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["current-session"] });
    },
  });
}

// Update a session
export function useUpdateSession() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: DialerSessionUpdate;
    }) => {
      const { data, error } = await (insforge.database as any)
        .from("dialer_sessions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as DialerSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dialer-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["current-session"] });
    },
  });
}

// End a session
export function useEndSession() {
  const updateSession = useUpdateSession();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return updateSession.mutateAsync({
        id: sessionId,
        updates: { ended_at: new Date().toISOString() },
      });
    },
  });
}

// Auto-detect or create session when logging a call
export function useSessionTracker() {
    const queryClient = useQueryClient();
  const createSession = useCreateSession();
  const updateSession = useUpdateSession();

  return useMutation({
    mutationFn: async (callData: {
      outcome: string;
      duration_seconds: number;
    }) => {
      const now = new Date();
      const gapThreshold = new Date(now.getTime() - SESSION_GAP_MINUTES * 60 * 1000);

      // Find the most recent session
      const { data: recentSession } = await (insforge.database as any)
        .from("dialer_sessions")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", gapThreshold.toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .single();

      let session: DialerSession;

      if (recentSession && (!recentSession.ended_at || new Date(recentSession.ended_at) > gapThreshold)) {
        // Update existing session
        const updates: DialerSessionUpdate = {
          total_calls: (recentSession.total_calls || 0) + 1,
          ended_at: now.toISOString(),
        };

        // Increment the appropriate outcome counter
        switch (callData.outcome) {
          case "connected":
            updates.connected_calls = (recentSession.connected_calls || 0) + 1;
            updates.total_talk_time_seconds = (recentSession.total_talk_time_seconds || 0) + callData.duration_seconds;
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

        session = await updateSession.mutateAsync({
          id: recentSession.id,
          updates,
        });
      } else {
        // Create new session
        const initialCounts: DialerSessionInsert = {
          user_id: DEFAULT_USER_ID,
          started_at: now.toISOString(),
          total_calls: 1,
          connected_calls: callData.outcome === "connected" ? 1 : 0,
          voicemails: callData.outcome === "voicemail" ? 1 : 0,
          no_answers: callData.outcome === "no_answer" ? 1 : 0,
          skipped: callData.outcome === "skipped" ? 1 : 0,
          gatekeepers: callData.outcome === "gatekeeper" ? 1 : 0,
          wrong_numbers: callData.outcome === "wrong_number" ? 1 : 0,
          busy: callData.outcome === "busy" ? 1 : 0,
          total_talk_time_seconds: callData.outcome === "connected" ? callData.duration_seconds : 0,
        };

        session = await createSession.mutateAsync(initialCounts);
      }

      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dialer-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["current-session"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

// Increment meetings booked for current session
export function useIncrementSessionMeetings() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const now = new Date();
      const gapThreshold = new Date(now.getTime() - SESSION_GAP_MINUTES * 60 * 1000);

      // Find the current session
      const { data: currentSession } = await (insforge.database as any)
        .from("dialer_sessions")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", gapThreshold.toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .single();

      if (!currentSession) return null;

      const { data, error } = await (insforge.database as any)
        .from("dialer_sessions")
        .update({
          meetings_booked: (currentSession.meetings_booked || 0) + 1,
        })
        .eq("id", currentSession.id)
        .select()
        .single();

      if (error) throw error;
      return data as DialerSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dialer-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["current-session"] });
    },
  });
}
