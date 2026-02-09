"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import { getTimezoneFromLocation } from "@/lib/timezone";
import type { Contact, InsertTables } from "@/types/database";

interface MigrationStats {
  companiesCreated: number;
  contactsLinked: number;
  errors: string[];
}

interface MigrationProgress {
  current: number;
  total: number;
  status: string;
}

/**
 * Hook to migrate existing contacts into the companies structure
 * This is a one-time migration to group contacts by company
 */
export function useMigrateCompanies() {
    const queryClient = useQueryClient();
  const [progress, setProgress] = useState<MigrationProgress | null>(null);

  const mutation = useMutation({
    mutationFn: async (userId: string): Promise<MigrationStats> => {
      const stats: MigrationStats = {
        companiesCreated: 0,
        contactsLinked: 0,
        errors: [],
      };

      // 1. Fetch all contacts for the user that don't have a company_id yet
      setProgress({ current: 0, total: 0, status: "Fetching contacts..." });
      
      const { data: contacts, error: fetchError } = await insforge.database
        .from("contacts")
        .select("*")
        .eq("user_id", userId)
        .is("company_id", null);

      if (fetchError) {
        throw new Error(`Failed to fetch contacts: ${fetchError.message}`);
      }

      if (!contacts || contacts.length === 0) {
        return stats;
      }

      // 2. Group contacts by company domain or name
      setProgress({ current: 0, total: contacts.length, status: "Grouping contacts by company..." });
      
      const companyGroups = new Map<string, Contact[]>();
      
      for (const contact of contacts) {
        // Use domain as primary key, fall back to company name
        const key = contact.company_domain || contact.company_name || "unknown";
        if (key === "unknown" && !contact.company_name) {
          continue; // Skip contacts with no company info
        }
        
        if (!companyGroups.has(key)) {
          companyGroups.set(key, []);
        }
        companyGroups.get(key)!.push(contact);
      }

      // 3. Create companies and link contacts
      const companyKeys = Array.from(companyGroups.keys());
      let processed = 0;

      for (const key of companyKeys) {
        const groupContacts = companyGroups.get(key)!;
        const sampleContact = groupContacts[0];
        
        setProgress({
          current: processed,
          total: companyKeys.length,
          status: `Processing ${sampleContact.company_name || key}...`,
        });

        try {
          // Check if company already exists by domain
          let companyId: string | null = null;
          
          if (sampleContact.company_domain) {
            const { data: existingCompany } = await insforge.database
              .from("companies")
              .select("id")
              .eq("user_id", userId)
              .eq("domain", sampleContact.company_domain)
              .single();
            
            if (existingCompany) {
              companyId = existingCompany.id;
            }
          }

          // Create company if it doesn't exist
          if (!companyId) {
            const timezone = getTimezoneFromLocation(
              sampleContact.city,
              sampleContact.state,
              sampleContact.country
            );

            const companyData: InsertTables<"companies"> = {
              user_id: userId,
              name: sampleContact.company_name || key,
              domain: sampleContact.company_domain || null,
              industry: sampleContact.industry || null,
              employee_count: sampleContact.employee_count || null,
              employee_range: sampleContact.employee_range || null,
              city: sampleContact.city || null,
              state: sampleContact.state || null,
              country: sampleContact.country || "US",
              timezone,
              linkedin_url: sampleContact.company_linkedin || null,
              annual_revenue: sampleContact.annual_revenue || null,
            };

            const { data: newCompany, error: createError } = await insforge.database
              .from("companies")
              .insert([companyData])
              .select("id")
              .single();

            if (createError) {
              stats.errors.push(`Failed to create company ${key}: ${createError.message}`);
              continue;
            }

            companyId = newCompany.id;
            stats.companiesCreated++;
          }

          // Link all contacts in this group to the company
          const contactIds = groupContacts.map((c: any) => c.id);
          
          const { error: updateError } = await insforge.database
            .from("contacts")
            .update({ company_id: companyId })
            .in("id", contactIds);

          if (updateError) {
            stats.errors.push(`Failed to link contacts to ${key}: ${updateError.message}`);
          } else {
            stats.contactsLinked += contactIds.length;
          }
        } catch (err: any) {
          stats.errors.push(`Error processing ${key}: ${err.message}`);
        }

        processed++;
      }

      setProgress({
        current: companyKeys.length,
        total: companyKeys.length,
        status: "Migration complete!",
      });

      return stats;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  return {
    migrate: mutation.mutate,
    migrateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    progress,
    stats: mutation.data,
    error: mutation.error,
    reset: () => {
      mutation.reset();
      setProgress(null);
    },
  };
}

/**
 * Hook to check migration status
 */
export function useMigrationStatus() {
    const checkStatus = async (userId: string) => {
    // Count contacts without company_id
    const { count: unlinkedCount, error: countError } = await insforge.database
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("company_id", null);

    if (countError) {
      throw new Error(`Failed to check status: ${countError.message}`);
    }

    // Count total contacts
    const { count: totalCount } = await insforge.database
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Count companies
    const { count: companyCount } = await insforge.database
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    return {
      unlinkedContacts: unlinkedCount || 0,
      totalContacts: totalCount || 0,
      linkedContacts: (totalCount || 0) - (unlinkedCount || 0),
      companies: companyCount || 0,
      needsMigration: (unlinkedCount || 0) > 0,
    };
  };

  return { checkStatus };
}
