"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/insforge/client";
import { useDialerStore } from "@/stores/dialer-store";
import type { TimestampedNote, Json } from "@/types/database";

// Debounce delay in ms
const AUTOSAVE_DEBOUNCE = 800;

interface DialerDraftPayload {
  timestampedNotes: TimestampedNote[];
  outcome: string | null;
  disposition: string | null;
  confirmedBudget: boolean;
  confirmedAuthority: boolean;
  confirmedNeed: boolean;
  confirmedTimeline: boolean;
  selectedPhoneType: "mobile" | "office";
  callStartTime: string | null;
  callDuration: number;
  isCallActive: boolean;
  notes: string;
}

/**
 * Hook to fetch existing draft for a contact
 */
export function useDialerDraft(userId: string, contactId: string | undefined) {
    return useQuery({
    queryKey: ["dialer-draft", userId, contactId],
    queryFn: async () => {
      if (!contactId) return null;

      const { data, error } = await insforge.database
        .from("dialer_drafts")
        .select("*")
        .eq("user_id", userId)
        .eq("contact_id", contactId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found, which is fine
        throw error;
      }

      return data;
    },
    enabled: !!contactId && !!userId,
    staleTime: 0, // Always fetch fresh
  });
}

/**
 * Hook to save/update draft
 */
export function useSaveDialerDraft() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      contactId,
      companyId,
      payload,
    }: {
      userId: string;
      contactId: string;
      companyId?: string | null;
      payload: DialerDraftPayload;
    }) => {
      const { data, error } = await insforge.database
        .from("dialer_drafts")
        .upsert(
          {
            user_id: userId,
            contact_id: contactId,
            company_id: companyId || null,
            payload: payload as unknown as Json,
          },
          {
            onConflict: "user_id,contact_id",
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dialer-draft", variables.userId, variables.contactId],
      });
    },
  });
}

/**
 * Hook to delete draft (after call is finalized)
 */
export function useDeleteDialerDraft() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      contactId,
    }: {
      userId: string;
      contactId: string;
    }) => {
      const { error } = await insforge.database
        .from("dialer_drafts")
        .delete()
        .eq("user_id", userId)
        .eq("contact_id", contactId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dialer-draft", variables.userId, variables.contactId],
      });
    },
  });
}

/**
 * Main autosave hook - subscribes to store changes and debounces saves
 */
export function useDialerAutosave(userId: string) {
  const saveDraft = useSaveDialerDraft();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

  // Get current state from store
  const currentContact = useDialerStore((s) => s.currentContact);
  const timestampedNotes = useDialerStore((s) => s.timestampedNotes);
  const outcome = useDialerStore((s) => s.outcome);
  const disposition = useDialerStore((s) => s.disposition);
  const confirmedBudget = useDialerStore((s) => s.confirmedBudget);
  const confirmedAuthority = useDialerStore((s) => s.confirmedAuthority);
  const confirmedNeed = useDialerStore((s) => s.confirmedNeed);
  const confirmedTimeline = useDialerStore((s) => s.confirmedTimeline);
  const selectedPhoneType = useDialerStore((s) => s.selectedPhoneType);
  const callStartTime = useDialerStore((s) => s.callStartTime);
  const callDuration = useDialerStore((s) => s.callDuration);
  const isCallActive = useDialerStore((s) => s.isCallActive);
  const notes = useDialerStore((s) => s.notes);
  const isActive = useDialerStore((s) => s.isActive);

  const save = useCallback(() => {
    if (!currentContact?.id || !userId || !isActive) return;

    const payload: DialerDraftPayload = {
      timestampedNotes,
      outcome,
      disposition,
      confirmedBudget,
      confirmedAuthority,
      confirmedNeed,
      confirmedTimeline,
      selectedPhoneType,
      callStartTime: callStartTime?.toISOString() || null,
      callDuration,
      isCallActive,
      notes,
    };

    // Only save if something changed
    const payloadStr = JSON.stringify(payload);
    if (payloadStr === lastSavedRef.current) return;

    saveDraft.mutate({
      userId,
      contactId: currentContact.id,
      companyId: currentContact.company_id,
      payload,
    });

    lastSavedRef.current = payloadStr;
  }, [
    currentContact,
    userId,
    isActive,
    timestampedNotes,
    outcome,
    disposition,
    confirmedBudget,
    confirmedAuthority,
    confirmedNeed,
    confirmedTimeline,
    selectedPhoneType,
    callStartTime,
    callDuration,
    isCallActive,
    notes,
    saveDraft,
  ]);

  // Debounced save on any change
  useEffect(() => {
    if (!isActive || !currentContact?.id) return;

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(save, AUTOSAVE_DEBOUNCE);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [
    save,
    isActive,
    currentContact?.id,
    timestampedNotes,
    outcome,
    disposition,
    confirmedBudget,
    confirmedAuthority,
    confirmedNeed,
    confirmedTimeline,
    selectedPhoneType,
    callDuration,
    isCallActive,
    notes,
  ]);

  // Save immediately on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        save();
      }
    };
  }, [save]);

  return { isSaving: saveDraft.isPending };
}

/**
 * Hook to hydrate store from draft when switching contacts
 */
export function useHydrateDraft(userId: string) {
  const { data: draft, isLoading } = useDialerDraft(
    userId,
    useDialerStore((s) => s.currentContact?.id)
  );

  const setOutcome = useDialerStore((s) => s.setOutcome);
  const setDisposition = useDialerStore((s) => s.setDisposition);
  const setQualification = useDialerStore((s) => s.setQualification);
  const setSelectedPhoneType = useDialerStore((s) => s.setSelectedPhoneType);
  const setNotes = useDialerStore((s) => s.setNotes);
  const addTimestampedNote = useDialerStore((s) => s.addTimestampedNote);
  const clearTimestampedNotes = useDialerStore((s) => s.clearTimestampedNotes);
  const currentContactId = useDialerStore((s) => s.currentContact?.id);

  const hydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!draft?.payload || !currentContactId) return;
    if (hydratedRef.current === currentContactId) return; // Already hydrated this contact

    const payload = draft.payload as unknown as DialerDraftPayload;

    // Hydrate store with saved state
    if (payload.outcome) {
      setOutcome(payload.outcome as any);
    }
    if (payload.disposition) {
      setDisposition(payload.disposition as any);
    }
    if (payload.confirmedBudget !== undefined) {
      setQualification("budget", payload.confirmedBudget);
    }
    if (payload.confirmedAuthority !== undefined) {
      setQualification("authority", payload.confirmedAuthority);
    }
    if (payload.confirmedNeed !== undefined) {
      setQualification("need", payload.confirmedNeed);
    }
    if (payload.confirmedTimeline !== undefined) {
      setQualification("timeline", payload.confirmedTimeline);
    }
    if (payload.selectedPhoneType) {
      setSelectedPhoneType(payload.selectedPhoneType);
    }
    if (payload.notes) {
      setNotes(payload.notes);
    }
    if (payload.timestampedNotes?.length > 0) {
      clearTimestampedNotes();
      payload.timestampedNotes.forEach((note) => addTimestampedNote(note));
    }

    hydratedRef.current = currentContactId;
  }, [
    draft,
    currentContactId,
    setOutcome,
    setDisposition,
    setQualification,
    setSelectedPhoneType,
    setNotes,
    addTimestampedNote,
    clearTimestampedNotes,
  ]);

  // Reset hydrated ref when contact changes
  useEffect(() => {
    if (currentContactId !== hydratedRef.current) {
      hydratedRef.current = null;
    }
  }, [currentContactId]);

  return { isLoading };
}
