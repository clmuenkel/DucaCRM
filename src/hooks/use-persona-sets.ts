"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import type { PersonaSet, InsertTables, UpdateTables } from "@/types/database";

/**
 * Fetch all persona sets for the user
 */
export function usePersonaSets() {
    return useQuery({
    queryKey: ["persona-sets"],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("persona_sets")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as PersonaSet[];
    },
  });
}

/**
 * Fetch a single persona set
 */
export function usePersonaSet(id: string) {
    return useQuery({
    queryKey: ["persona-set", id],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("persona_sets")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as PersonaSet;
    },
    enabled: !!id,
  });
}

/**
 * Get the default persona set
 */
export function useDefaultPersonaSet() {
    return useQuery({
    queryKey: ["persona-set", "default"],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("persona_sets")
        .select("*")
        .eq("is_default", true)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as PersonaSet | null;
    },
  });
}

/**
 * Create a new persona set
 */
export function useCreatePersonaSet() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (personaSet: InsertTables<"persona_sets">) => {
      // If this is set as default, unset other defaults first
      if (personaSet.is_default) {
        await insforge.database
          .from("persona_sets")
          .update({ is_default: false })
          .eq("user_id", personaSet.user_id);
      }

      const { data, error } = await insforge.database
        .from("persona_sets")
        .insert([personaSet])
        .select()
        .single();

      if (error) throw error;
      return data as PersonaSet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persona-sets"] });
    },
  });
}

/**
 * Update a persona set
 */
export function useUpdatePersonaSet() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateTables<"persona_sets">;
    }) => {
      // If setting as default, unset other defaults first
      if (updates.is_default) {
        const { data: current } = await insforge.database
          .from("persona_sets")
          .select("user_id")
          .eq("id", id)
          .single();

        if (current) {
          await insforge.database
            .from("persona_sets")
            .update({ is_default: false })
            .eq("user_id", current.user_id)
            .neq("id", id);
        }
      }

      const { data, error } = await insforge.database
        .from("persona_sets")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as PersonaSet;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["persona-sets"] });
      queryClient.invalidateQueries({ queryKey: ["persona-set", data.id] });
    },
  });
}

/**
 * Delete a persona set
 */
export function useDeletePersonaSet() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from("persona_sets")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persona-sets"] });
    },
  });
}

/**
 * Duplicate a persona set
 */
export function useDuplicatePersonaSet() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, newName }: { id: string; newName: string }) => {
      // Get the original
      const { data: original, error: fetchError } = await insforge.database
        .from("persona_sets")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      // Create duplicate
      const { data, error } = await insforge.database
        .from("persona_sets")
        .insert({
          user_id: original.user_id,
          name: newName,
          titles: original.titles,
          industries: original.industries,
          employee_ranges: original.employee_ranges,
          include_intent_data: original.include_intent_data,
          is_default: false, // Never duplicate as default
        })
        .select()
        .single();

      if (error) throw error;
      return data as PersonaSet;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persona-sets"] });
    },
  });
}

// Pre-built persona set templates for home services
export const PERSONA_SET_TEMPLATES = {
  hvac_owners: {
    name: "HVAC Company Owners",
    titles: ["Owner", "Founder", "President", "CEO", "Principal", "General Manager"],
    industries: ["hvac"],
    employee_ranges: ["1-50", "51-200"],
  },
  plumbing_owners: {
    name: "Plumbing Company Owners",
    titles: ["Owner", "Founder", "President", "CEO", "Principal", "General Manager"],
    industries: ["plumbing"],
    employee_ranges: ["1-50", "51-200"],
  },
  roofing_owners: {
    name: "Roofing Company Owners",
    titles: ["Owner", "Founder", "President", "CEO", "Principal", "General Manager"],
    industries: ["roofing"],
    employee_ranges: ["1-50", "51-200"],
  },
  electrical_owners: {
    name: "Electrical Company Owners",
    titles: ["Owner", "Founder", "President", "CEO", "Principal", "General Manager"],
    industries: ["electrical"],
    employee_ranges: ["1-50", "51-200"],
  },
  solar_owners: {
    name: "Solar Company Owners",
    titles: ["Owner", "Founder", "President", "CEO", "Principal", "General Manager"],
    industries: ["solar"],
    employee_ranges: ["1-50", "51-200"],
  },
  all_home_services: {
    name: "All Home Services Owners",
    titles: ["Owner", "Founder", "President", "CEO", "Principal"],
    industries: ["hvac", "plumbing", "roofing", "electrical", "solar", "construction"],
    employee_ranges: ["1-50", "51-200"],
  },
};
