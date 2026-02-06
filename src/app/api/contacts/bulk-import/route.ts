import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { extractDomain, mapApolloToContact, mapApolloToCompany } from "@/lib/csv-parser";
import type { ApolloCSVRow } from "@/lib/csv-parser";
import { normalizeToE164 } from "@/lib/utils";

const BATCH_SIZE = 50; // Insert 50 contacts at a time
const DELAY_BETWEEN_BATCHES = 500; // 500ms delay between batches

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const { rows, userId, sourceList } = await request.json();
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const stats = {
      created: 0,
      updated: 0,
      companiesCreated: 0,
      companiesUpdated: 0,
      failed: 0,
      notesCreated: 0,
    };

    const failures: any[] = [];
    const companyCache = new Map<string, string>();

    // Step 1: Process all companies first (batch)
    const companyMap = new Map<string, { row: ApolloCSVRow; domain: string | null }>();
    
    for (const row of rows) {
      if (row.companyName) {
        const domain = extractDomain(row.email);
        const key = domain || row.companyName.toLowerCase();
        if (!companyMap.has(key)) {
          companyMap.set(key, { row, domain });
        }
      }
    }

    // Batch create/update companies
    const companyDataArray = Array.from(companyMap.values());
    for (let i = 0; i < companyDataArray.length; i += BATCH_SIZE) {
      const batch = companyDataArray.slice(i, i + BATCH_SIZE);
      
      for (const { row, domain } of batch) {
        try {
          const companyData = mapApolloToCompany(row, userId, domain);
          if (!companyData) continue;

          const cacheKey = domain || row.companyName.toLowerCase();
          
          if (domain) {
            // Check by domain
            const { data: existing } = await insforge.database
              .from("companies")
              .select("id")
              .eq("user_id", userId)
              .eq("domain", domain)
              .maybeSingle();

            if (existing?.id) {
              companyCache.set(cacheKey, existing.id);
              // Update company with new data
              await insforge.database
                .from("companies")
                .update({
                  employee_count: companyData.employee_count,
                  employee_range: companyData.employee_range,
                  city: companyData.city,
                  state: companyData.state,
                  industry: companyData.industry,
                })
                .eq("id", existing.id);
              stats.companiesUpdated++;
            } else {
              // Insert new
              const { data: newCompany, error } = await insforge.database
                .from("companies")
                .insert([companyData])
                .select("id")
                .single();

              if (!error && newCompany) {
                companyCache.set(cacheKey, newCompany.id);
                stats.companiesCreated++;
              } else if (error) {
                console.error(`[Bulk Import] Company insert error:`, error);
              }
            }
          } else {
            // Check by name
            const { data: existing } = await insforge.database
              .from("companies")
              .select("id")
              .eq("user_id", userId)
              .eq("name", row.companyName)
              .maybeSingle();

            if (existing?.id) {
              companyCache.set(cacheKey, existing.id);
              // Update company with new data
              await insforge.database
                .from("companies")
                .update({
                  domain: domain || undefined,
                  employee_count: companyData.employee_count,
                  employee_range: companyData.employee_range,
                  city: companyData.city,
                  state: companyData.state,
                  industry: companyData.industry,
                })
                .eq("id", existing.id);
              stats.companiesUpdated++;
            } else {
              const { data: newCompany, error } = await insforge.database
                .from("companies")
                .insert([companyData])
                .select("id")
                .single();

              if (!error && newCompany) {
                companyCache.set(cacheKey, newCompany.id);
                stats.companiesCreated++;
              } else if (error) {
                console.error(`[Bulk Import] Company insert error:`, error);
              }
            }
          }
        } catch (error: any) {
          console.error(`[Bulk Import] Error processing company ${row.companyName}:`, error);
        }
      }

      if (i + BATCH_SIZE < companyDataArray.length) {
        await delay(DELAY_BETWEEN_BATCHES);
      }
    }

    // Step 2: Batch check existing contacts
    const emails = rows.map(r => r.email?.toLowerCase()).filter(Boolean) as string[];
    const existingContactsMap = new Map<string, string>();

    if (emails.length > 0) {
      // Query in batches
      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const emailBatch = emails.slice(i, i + BATCH_SIZE);
        const { data: existing } = await insforge.database
          .from("contacts")
          .select("id, email")
          .eq("user_id", userId)
          .in("email", emailBatch);

        if (existing) {
          for (const contact of existing) {
            if (contact.email) {
              existingContactsMap.set(contact.email.toLowerCase(), contact.id);
            }
          }
        }

        if (i + BATCH_SIZE < emails.length) {
          await delay(100);
        }
      }
    }

    // Step 3: Prepare contact data
    const contactsToInsert: any[] = [];
    const contactsToUpdate: Array<{ id: string; data: any; row: ApolloCSVRow }> = [];
    const notesToCreate: Array<{ user_id: string; contact_id: string; company_id: string | null; content: string }> = [];

    for (const row of rows) {
      const domain = extractDomain(row.email);
      const cacheKey = domain || row.companyName?.toLowerCase();
      const companyId = cacheKey ? companyCache.get(cacheKey) : null;

      const contactData = {
        ...mapApolloToContact(row, userId, companyId || undefined),
        source_list: sourceList,
      };

      // Normalize phone numbers to E.164 format
      if (contactData.phone) {
        const normalized = normalizeToE164(contactData.phone);
        contactData.phone = normalized || contactData.phone;
      }
      if (contactData.mobile) {
        const normalized = normalizeToE164(contactData.mobile);
        contactData.mobile = normalized || contactData.mobile;
      }

      // Validate required fields
      if (!contactData.first_name || contactData.first_name.trim() === "") {
        failures.push({ row, error: "first_name is required but was empty", errorCode: "VALIDATION_ERROR" });
        stats.failed++;
        continue;
      }

      if (!contactData.user_id) {
        failures.push({ row, error: "user_id is required but was empty", errorCode: "VALIDATION_ERROR" });
        stats.failed++;
        continue;
      }

      const email = row.email?.toLowerCase();
      if (email && existingContactsMap.has(email)) {
        const contactId = existingContactsMap.get(email)!;
        // Don't overwrite phone/mobile with empty values
        const updateData: Record<string, unknown> = { ...contactData };
        if (!updateData.phone) delete updateData.phone;
        if (!updateData.mobile) delete updateData.mobile;
        
        contactsToUpdate.push({
          id: contactId,
          data: updateData,
          row,
        });

        // Add note if present
        if (row.extraPhonesNote) {
          notesToCreate.push({
            user_id: userId,
            contact_id: contactId,
            company_id: companyId || null,
            content: row.extraPhonesNote,
          });
        }
      } else {
        contactsToInsert.push({ contactData, row });
      }
    }

    // Step 4: Batch insert new contacts
    for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
      const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
      const contactDataBatch = batch.map(b => b.contactData);
      
      try {
        const { data, error } = await insforge.database
          .from("contacts")
          .insert(contactDataBatch)
          .select("id, email");

        if (error) {
          console.error(`[Bulk Import] Batch insert error:`, error);
          failures.push(...batch.map((b, idx) => ({ 
            row: b.row, 
            error: error.message,
            errorCode: (error as any).code,
          })));
          stats.failed += batch.length;
        } else if (data) {
          stats.created += data.length;
          
          // Create notes for new contacts
          for (let j = 0; j < batch.length; j++) {
            const { row } = batch[j];
            const insertedContact = data[j];
            if (insertedContact && row.extraPhonesNote) {
              const domain = extractDomain(row.email);
              const cacheKey = domain || row.companyName?.toLowerCase();
              const companyId = cacheKey ? companyCache.get(cacheKey) : null;
              
              notesToCreate.push({
                user_id: userId,
                contact_id: insertedContact.id,
                company_id: companyId || null,
                content: row.extraPhonesNote,
              });
            }
          }
        }
      } catch (error: any) {
        console.error(`[Bulk Import] Batch insert exception:`, error);
        failures.push(...batch.map(b => ({ 
          row: b.row, 
          error: error.message || "Insert failed",
        })));
        stats.failed += batch.length;
      }

      if (i + BATCH_SIZE < contactsToInsert.length) {
        await delay(DELAY_BETWEEN_BATCHES);
      }
    }

    // Step 5: Batch update existing contacts
    for (let i = 0; i < contactsToUpdate.length; i += BATCH_SIZE) {
      const batch = contactsToUpdate.slice(i, i + BATCH_SIZE);
      
      // Update individually (can't batch update with different data)
      for (const { id, data } of batch) {
        try {
          const { error } = await insforge.database
            .from("contacts")
            .update(data)
            .eq("id", id);

          if (error) {
            stats.failed++;
          } else {
            stats.updated++;
          }
        } catch (error) {
          stats.failed++;
        }
      }

      if (i + BATCH_SIZE < contactsToUpdate.length) {
        await delay(DELAY_BETWEEN_BATCHES);
      }
    }

    // Step 6: Create notes in batches
    if (notesToCreate.length > 0) {
      for (let i = 0; i < notesToCreate.length; i += BATCH_SIZE) {
        const batch = notesToCreate.slice(i, i + BATCH_SIZE);
        
        try {
          const { error } = await insforge.database
            .from("notes")
            .insert(batch.map(note => ({
              ...note,
              is_pinned: false,
              is_company_wide: false,
            })));

          if (!error) {
            stats.notesCreated += batch.length;
          }
        } catch (error) {
          console.error(`[Bulk Import] Error creating notes:`, error);
        }

        if (i + BATCH_SIZE < notesToCreate.length) {
          await delay(100);
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      failures: failures.slice(0, 100), // Limit failures returned
    });
  } catch (error: any) {
    console.error("[Bulk Import] Error:", error);
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 }
    );
  }
}
