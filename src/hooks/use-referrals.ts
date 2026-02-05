"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/insforge/client";
import type { Contact } from "@/types/database";

export interface ReferralContext {
  type: "direct" | "company" | "none";
  referrer?: {
    id: string;
    first_name: string;
    last_name: string | null;
    title: string | null;
    last_contacted_at: string | null;
  } | null;
  note?: string | null;
  companyTalkedTo?: {
    id: string;
    first_name: string;
    last_name: string | null;
    title: string | null;
    last_contacted_at: string | null;
  } | null;
}

/**
 * Get the referral context for a contact
 * Returns direct referral if exists, otherwise company "talked to" reference
 */
export function useContactContext(contactId: string, companyId?: string | null) {
    return useQuery({
    queryKey: ["contact-context", contactId, companyId],
    queryFn: async (): Promise<ReferralContext> => {
      // First check for direct referral
      const { data: contact } = await insforge.database
        .from("contacts")
        .select(`
          direct_referral_contact_id,
          direct_referral_note,
          referrer:contacts!direct_referral_contact_id(
            id,
            first_name,
            last_name,
            title,
            last_contacted_at
          )
        `)
        .eq("id", contactId)
        .single();

      // If there's a direct referral, return it
      if (contact?.direct_referral_contact_id && contact.referrer) {
        const referrer = Array.isArray(contact.referrer) 
          ? contact.referrer[0] 
          : contact.referrer;
        
        return {
          type: "direct",
          referrer: referrer as any,
          note: contact.direct_referral_note,
        };
      }

      // Otherwise, check for company-level "talked to" (most recently contacted at company)
      if (companyId) {
        const { data: companyContact } = await insforge.database
          .from("contacts")
          .select("id, first_name, last_name, title, last_contacted_at")
          .eq("company_id", companyId)
          .neq("id", contactId)
          .not("last_contacted_at", "is", null)
          .order("last_contacted_at", { ascending: false })
          .limit(1)
          .single();

        if (companyContact) {
          return {
            type: "company",
            companyTalkedTo: companyContact,
          };
        }
      }

      return { type: "none" };
    },
    enabled: !!contactId,
  });
}

/**
 * Set a direct referral for a contact ("X told me to call you")
 */
export function useSetDirectReferral() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      referrerId,
      note,
    }: {
      contactId: string;
      referrerId: string;
      note?: string;
    }) => {
      const { data, error } = await insforge.database
        .from("contacts")
        .update({
          direct_referral_contact_id: referrerId,
          direct_referral_note: note || null,
        })
        .eq("id", contactId)
        .select()
        .single();

      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contact-context", data.id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact", data.id] });
    },
  });
}

/**
 * Remove a direct referral from a contact
 */
export function useRemoveDirectReferral() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      const { data, error } = await insforge.database
        .from("contacts")
        .update({
          direct_referral_contact_id: null,
          direct_referral_note: null,
        })
        .eq("id", contactId)
        .select()
        .single();

      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contact-context", data.id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact", data.id] });
    },
  });
}

/**
 * Update just the referral note for a contact (for editing opener text)
 */
export function useUpdateReferralNote() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      note,
    }: {
      contactId: string;
      note: string;
    }) => {
      const { data, error } = await insforge.database
        .from("contacts")
        .update({
          direct_referral_note: note || null,
        })
        .eq("id", contactId)
        .select()
        .single();

      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contact-context", data.id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact", data.id] });
    },
  });
}

/**
 * Set a custom opener note without a referrer contact (manual opener text)
 */
export function useSetCustomOpener() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      openerText,
    }: {
      contactId: string;
      openerText: string;
    }) => {
      const { data, error } = await insforge.database
        .from("contacts")
        .update({
          direct_referral_note: openerText || null,
        })
        .eq("id", contactId)
        .select()
        .single();

      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contact-context", data.id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact", data.id] });
    },
  });
}

/**
 * After calling someone, automatically set them as a referral for another contact
 * Used when contact says "talk to X instead"
 */
export function useSetReferralFromCall() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      targetContactId,
      calledContactId,
      companyId,
      note,
    }: {
      targetContactId: string; // The person they said to call
      calledContactId: string; // The person you just called
      companyId?: string;
      note?: string;
    }) => {
      // Set direct referral on target contact
      const { data, error } = await insforge.database
        .from("contacts")
        .update({
          direct_referral_contact_id: calledContactId,
          direct_referral_note: note || "Directed by colleague",
        })
        .eq("id", targetContactId)
        .select()
        .single();

      if (error) throw error;
      return data as Contact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contact-context"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["company-contacts"] });
    },
  });
}

/**
 * Get all contacts that were referred by a specific contact
 */
export function useReferredContacts(referrerId: string) {
    return useQuery({
    queryKey: ["referred-contacts", referrerId],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("contacts")
        .select("*")
        .eq("direct_referral_contact_id", referrerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Contact[];
    },
    enabled: !!referrerId,
  });
}

/**
 * Format the referral context into a display string
 */
export function formatReferralContext(context: ReferralContext): string {
  if (context.type === "direct" && context.referrer) {
    const name = `${context.referrer.first_name} ${context.referrer.last_name || ""}`.trim();
    const title = context.referrer.title ? ` (${context.referrer.title})` : "";
    return `${name}${title} referred you to them`;
  }

  if (context.type === "company" && context.companyTalkedTo) {
    const name = `${context.companyTalkedTo.first_name} ${context.companyTalkedTo.last_name || ""}`.trim();
    const title = context.companyTalkedTo.title ? ` (${context.companyTalkedTo.title})` : "";
    return `You spoke with ${name}${title} at this company`;
  }

  return "";
}

/**
 * Format the opener suggestion based on context
 */
export function formatOpenerSuggestion(context: ReferralContext): string {
  if (context.type === "direct" && context.referrer) {
    const name = context.referrer.first_name;
    const title = context.referrer.title || "your colleague";
    return `"${name}, ${title}, suggested I reach out to you..."`;
  }

  if (context.type === "company" && context.companyTalkedTo) {
    const name = context.companyTalkedTo.first_name;
    const title = context.companyTalkedTo.title || "";
    return `"I was speaking with ${name}${title ? `, ${title},` : ""} at your company..."`;
  }

  return "";
}
