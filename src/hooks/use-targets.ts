"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { UserTarget, UserTargetUpdate } from "@/types/analytics";

// Default targets if none exist
const DEFAULT_DAILY_TARGETS = {
  calls_target: 50,
  connected_target: 15,
  meetings_target: 3,
  voicemails_target: 20,
};

const DEFAULT_WEEKLY_TARGETS = {
  calls_target: 250,
  connected_target: 75,
  meetings_target: 15,
  voicemails_target: 100,
};

// Fetch user targets (daily and weekly)
export function useTargets() {
    return useQuery({
    queryKey: ["user-targets", DEFAULT_USER_ID],
    queryFn: async () => {
      const { data, error } = await (insforge.database as any)
        .from("user_targets")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID);

      if (error) {
        // If table doesn't exist yet, return defaults
        if (error.code === "42P01") {
          return {
            daily: { ...DEFAULT_DAILY_TARGETS, target_type: "daily" as const },
            weekly: { ...DEFAULT_WEEKLY_TARGETS, target_type: "weekly" as const },
          };
        }
        throw error;
      }

      const daily = (data as UserTarget[]).find((t: any) => t.target_type === "daily");
      const weekly = (data as UserTarget[]).find((t: any) => t.target_type === "weekly");

      return {
        daily: daily || { ...DEFAULT_DAILY_TARGETS, target_type: "daily" as const },
        weekly: weekly || { ...DEFAULT_WEEKLY_TARGETS, target_type: "weekly" as const },
      };
    },
  });
}

// Fetch just daily targets
export function useDailyTargets() {
    return useQuery({
    queryKey: ["user-targets", DEFAULT_USER_ID, "daily"],
    queryFn: async () => {
      const { data, error } = await (insforge.database as any)
        .from("user_targets")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .eq("target_type", "daily")
        .single();

      if (error) {
        if (error.code === "PGRST116" || error.code === "42P01") {
          // No row found or table doesn't exist
          return DEFAULT_DAILY_TARGETS;
        }
        throw error;
      }

      return data as UserTarget;
    },
  });
}

// Fetch just weekly targets
export function useWeeklyTargets() {
    return useQuery({
    queryKey: ["user-targets", DEFAULT_USER_ID, "weekly"],
    queryFn: async () => {
      const { data, error } = await (insforge.database as any)
        .from("user_targets")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .eq("target_type", "weekly")
        .single();

      if (error) {
        if (error.code === "PGRST116" || error.code === "42P01") {
          return DEFAULT_WEEKLY_TARGETS;
        }
        throw error;
      }

      return data as UserTarget;
    },
  });
}

// Update targets (upsert)
export function useUpdateTarget() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      targetType,
      updates,
    }: {
      targetType: "daily" | "weekly";
      updates: UserTargetUpdate;
    }) => {
      const { data, error } = await (insforge.database as any)
        .from("user_targets")
        .upsert(
          {
            user_id: DEFAULT_USER_ID,
            target_type: targetType,
            ...updates,
          },
          { onConflict: "user_id,target_type" }
        )
        .select()
        .single();

      if (error) throw error;
      return data as UserTarget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-targets"] });
    },
  });
}

// Convenience hook to update a single target field
export function useUpdateSingleTarget() {
  const updateTarget = useUpdateTarget();

  return {
    updateCallsTarget: (targetType: "daily" | "weekly", value: number) =>
      updateTarget.mutateAsync({ targetType, updates: { calls_target: value } }),
    updateConnectedTarget: (targetType: "daily" | "weekly", value: number) =>
      updateTarget.mutateAsync({ targetType, updates: { connected_target: value } }),
    updateMeetingsTarget: (targetType: "daily" | "weekly", value: number) =>
      updateTarget.mutateAsync({ targetType, updates: { meetings_target: value } }),
    updateVoicemailsTarget: (targetType: "daily" | "weekly", value: number) =>
      updateTarget.mutateAsync({ targetType, updates: { voicemails_target: value } }),
    isPending: updateTarget.isPending,
  };
}
