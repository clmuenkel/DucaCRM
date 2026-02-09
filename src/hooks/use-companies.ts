"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import type { Company, Contact, Call, CallWithContact, InsertTables, UpdateTables } from "@/types/database";

export interface CompanyWithStats extends Company {
  contact_count: number;
  last_contacted_at: string | null;
  contacts?: Contact[];
  talked_to?: {
    first_name: string;
    last_name: string | null;
    title: string | null;
    last_contacted_at: string | null;
  } | null;
}

export interface CompanyFilters {
  search?: string;
  industry?: string;
  hasContacts?: boolean;
  limit?: number;
}

/**
 * Fetch all companies with contact counts and last contacted date
 */
export function useCompanies(filters?: CompanyFilters) {
  return useQuery({
    queryKey: ["companies", filters],
    queryFn: async () => {
      // First get companies
      let query = insforge.database
        .from("companies")
        .select("*")
        .order("name", { ascending: true });

      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,domain.ilike.%${filters.search}%`
        );
      }

      if (filters?.industry) {
        query = query.eq("industry", filters.industry);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data: companiesData, error } = await query;
      
      if (error) throw error;

      const companies = companiesData as Company[];
      if (!companies || companies.length === 0) {
        return [] as CompanyWithStats[];
      }

      // Get contact counts and last contacted for each company
      const companyIds = companies.map((c: any) => c.id);
      
      const { data: contactStatsData } = await insforge.database
        .from("contacts")
        .select("company_id, last_contacted_at")
        .in("company_id", companyIds);

      const contactStats = contactStatsData as { company_id: string | null; last_contacted_at: string | null }[] | null;

      // Aggregate stats per company
      const statsMap = new Map<string, { count: number; lastContacted: string | null }>();
      
      contactStats?.forEach((contact: any) => {
        if (!contact.company_id) return;
        
        const current = statsMap.get(contact.company_id) || { count: 0, lastContacted: null };
        current.count++;
        
        if (contact.last_contacted_at) {
          if (!current.lastContacted || contact.last_contacted_at > current.lastContacted) {
            current.lastContacted = contact.last_contacted_at;
          }
        }
        
        statsMap.set(contact.company_id, current);
      });

      // Merge stats into companies
      const companiesWithStats: CompanyWithStats[] = companies.map((company: any) => {
        const stats = statsMap.get(company.id) || { count: 0, lastContacted: null };
        return {
          ...company,
          contact_count: stats.count,
          last_contacted_at: stats.lastContacted,
        };
      });

      // Filter by hasContacts if specified
      if (filters?.hasContacts) {
        return companiesWithStats.filter((c: any) => c.contact_count > 0);
      }

      return companiesWithStats;
    },
  });
}

/**
 * Fetch a single company with all its contacts
 */
export function useCompany(id: string) {
  return useQuery<CompanyWithStats>({
    queryKey: ["company", id],
    queryFn: async () => {
      const { data: companyData, error } = await insforge.database
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      const company = companyData as Company;

      // Get contacts for this company
      const { data: contactsData } = await insforge.database
        .from("contacts")
        .select("*")
        .eq("company_id", id)
        .order("last_contacted_at", { ascending: false, nullsFirst: false });

      const contacts = contactsData as Contact[] | null;

      // Calculate stats
      const contact_count = contacts?.length || 0;
      const last_contacted_at = contacts?.reduce((latest: string | null, contact) => {
        if (!contact.last_contacted_at) return latest;
        if (!latest || contact.last_contacted_at > latest) {
          return contact.last_contacted_at;
        }
        return latest;
      }, null) || null;

      // Find the most recently contacted person at this company
      const talked_to = contacts?.find(c => c.last_contacted_at) || null;

      return {
        ...company,
        contacts: contacts || [],
        contact_count,
        last_contacted_at,
        talked_to: talked_to ? {
          first_name: talked_to.first_name,
          last_name: talked_to.last_name,
          title: talked_to.title,
          last_contacted_at: talked_to.last_contacted_at,
        } : null,
      } as CompanyWithStats;
    },
    enabled: !!id,
  });
}

/**
 * Get all contacts for a company
 */
export function useCompanyContacts(companyId: string) {
  return useQuery({
    queryKey: ["company-contacts", companyId],
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from("contacts")
        .select("*")
        .eq("company_id", companyId)
        .order("last_contacted_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data as Contact[];
    },
    enabled: !!companyId,
  });
}

/**
 * Get call history for all contacts at a company
 */
export function useCompanyCallHistory(companyId: string) {
  return useQuery<CallWithContact[]>({
    queryKey: ["company-calls", companyId],
    queryFn: async () => {
      // First get all contact IDs for this company
      const { data: contacts } = await insforge.database
        .from("contacts")
        .select("id")
        .eq("company_id", companyId);

      if (!contacts || contacts.length === 0) {
        return [] as CallWithContact[];
      }

      const contactIds = contacts.map((c: any) => c.id);

      // Get all calls for these contacts
      const { data: calls, error } = await insforge.database
        .from("calls")
        .select("*, contacts(id, first_name, last_name, title)")
        .in("contact_id", contactIds)
        .order("started_at", { ascending: false });

      if (error) throw error;
      return (calls || []) as unknown as CallWithContact[];
    },
    enabled: !!companyId,
  });
}

/**
 * Get contacts at the same company as a given contact (for referral context)
 */
export function useCompanyColleagues(contactId: string, companyId?: string | null) {
  return useQuery({
    queryKey: ["company-colleagues", contactId, companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await insforge.database
        .from("contacts")
        .select("id, first_name, last_name, title, last_contacted_at, total_calls")
        .eq("company_id", companyId)
        .neq("id", contactId)
        .order("last_contacted_at", { ascending: false, nullsFirst: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
}

/**
 * Get the "talked to" reference for a company (most recently contacted person)
 */
export function useCompanyTalkedTo(companyId: string) {
  return useQuery({
    queryKey: ["company-talked-to", companyId],
    queryFn: async () => {
      // Get the most recently contacted person at this company
      const { data, error } = await insforge.database
        .from("contacts")
        .select("id, first_name, last_name, title, last_contacted_at")
        .eq("company_id", companyId)
        .not("last_contacted_at", "is", null)
        .order("last_contacted_at", { ascending: false })
        .limit(1)
        .single();

      if (error && (error as any).code !== "PGRST116" && !error.message?.includes("No rows")) throw error;
      return data || null;
    },
    enabled: !!companyId,
  });
}

/**
 * Create a new company
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (company: InsertTables<"companies">) => {
      const { data, error } = await insforge.database
        .from("companies")
        .insert([company])
        .select()
        .single();
      
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}

/**
 * Update a company
 */
export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: UpdateTables<"companies">;
    }) => {
      const { data, error } = await insforge.database
        .from("companies")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Company;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company", data.id] });
    },
  });
}

/**
 * Delete a company
 */
export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // First unlink all contacts from this company
      await insforge.database
        .from("contacts")
        .update({ company_id: null })
        .eq("company_id", id);

      // Then delete the company
      const { error } = await insforge.database
        .from("companies")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

/**
 * Find or create a company by domain
 */
export function useFindOrCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      domain,
      companyData,
    }: {
      userId: string;
      domain: string;
      companyData: Omit<InsertTables<"companies">, "user_id">;
    }) => {
      // Try to find existing company by domain
      const { data: existing } = await insforge.database
        .from("companies")
        .select("*")
        .eq("user_id", userId)
        .eq("domain", domain)
        .single();

      if (existing) {
        return existing as Company;
      }

      // Create new company
      const { data, error } = await insforge.database
        .from("companies")
        .insert([{
          ...companyData,
          user_id: userId,
          domain,
        }])
        .select()
        .single();

      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
}
