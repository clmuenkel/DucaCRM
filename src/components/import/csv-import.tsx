"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import {
  parseCSV,
  dedupeByLink,
  extractDomain,
  mapToContact,
  mapToCompany,
  isApolloCSV,
  prepareApolloImport,
  mapApolloToContact,
  mapApolloToCompany,
  type ParsedCSVRow,
  type ApolloCSVRow,
  type CompanyGroup,
} from "@/lib/csv-parser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  Building2,
  Users,
  AlertCircle,
  X,
  Phone,
  ChevronDown,
  ChevronRight,
  Tag,
  Smartphone,
  Mail,
} from "lucide-react";

type ImportStep = "upload" | "preview" | "importing" | "done";
type CSVType = "legacy" | "apollo";

interface ImportStats {
  created: number;
  updated: number;
  companiesCreated: number;
  companiesUpdated: number;
  failed: number;
  notesCreated: number;
}

interface ApolloImportStats extends ImportStats {
  withMobile: number;
  withWorkPhone: number;
  missingBothPhones: number;
  topTags: { tag: string; count: number }[];
}

interface FailedImport {
  row: ParsedCSVRow | ApolloCSVRow;
  type: "contact" | "company";
  error: string;
  errorCode?: string;
}

// Map Supabase error codes to friendly messages
function getFriendlyErrorMessage(error: string, code?: string): string {
  if (code === "23505") return "Duplicate entry - this record already exists";
  if (code === "23503") return "Referenced record not found";
  if (code === "23502") return "Required field is missing";
  if (error.includes("duplicate")) return "Duplicate entry";
  if (error.includes("null value")) return "Required field is missing";
  return error;
}

// Tag color mapping
const TAG_COLORS: Record<string, string> = {
  hvac: "bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/40",
  plumbing: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/40",
  roofing: "bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-500/40",
  electrical: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
  pest_control: "bg-red-500/20 text-red-600 dark:text-red-300 border-red-500/40",
  landscaping: "bg-green-500/20 text-green-600 dark:text-green-300 border-green-500/40",
  windows_doors: "bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/40",
  solar: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
  construction: "bg-slate-500/20 text-slate-600 dark:text-slate-300 border-slate-500/40",
  mechanical: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-500/40",
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

export function CSVImport() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [csvType, setCsvType] = useState<CSVType>("legacy");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [listName, setListName] = useState<string>("");
  
  // Legacy CSV data
  const [parsedRows, setParsedRows] = useState<ParsedCSVRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [parseStats, setParseStats] = useState({ totalRows: 0, afterDedupe: 0, duplicatesRemoved: 0 });
  
  // Apollo CSV data
  const [companyGroups, setCompanyGroups] = useState<CompanyGroup[]>([]);
  const [apolloRows, setApolloRows] = useState<ApolloCSVRow[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [apolloStats, setApolloStats] = useState({
    totalRows: 0,
    afterDedupe: 0,
    duplicatesRemoved: 0,
    totalCompanies: 0,
    withMobile: 0,
    withWorkPhone: 0,
    missingBothPhones: 0,
    topTags: [] as { tag: string; count: number }[],
  });
  
  // Import progress
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState<ApolloImportStats>({
    created: 0,
    updated: 0,
    companiesCreated: 0,
    companiesUpdated: 0,
    failed: 0,
    notesCreated: 0,
    withMobile: 0,
    withWorkPhone: 0,
    missingBothPhones: 0,
    topTags: [],
  });
  const [failedImports, setFailedImports] = useState<FailedImport[]>([]);
  const [showFailedDialog, setShowFailedDialog] = useState(false);
  
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }
    
    setFileName(file.name);
    console.log("[CSV Import] Reading file:", file.name, "Size:", file.size);
    
    try {
      const text = await file.text();
      console.log("[CSV Import] File text length:", text.length, "First 200 chars:", text.substring(0, 200));
      
      // Detect CSV type
      const firstLine = text.split("\n")[0];
      const isApollo = isApolloCSV(firstLine);
      setCsvType(isApollo ? "apollo" : "legacy");
      
      if (isApollo) {
        // Parse Apollo CSV
        console.log("[CSV Import] Detected Apollo CSV format");
        const { groups, allRows, stats } = prepareApolloImport(text);
        
        setCompanyGroups(groups);
        setApolloRows(allRows);
        setApolloStats(stats);
        
        // Select all contacts by default
        setSelectedContacts(new Set(allRows.map((_, i) => i)));
        setSelectedCompanies(new Set(groups.map(g => `${g.companyName}|${g.city}|${g.state}`)));
        // Expand first 5 companies by default
        setExpandedCompanies(new Set(groups.slice(0, 5).map(g => `${g.companyName}|${g.city}|${g.state}`)));
        
        if (allRows.length === 0) {
          toast.error("No contacts found in CSV. Check console for details.");
        } else {
          setStep("preview");
          toast.success(`Parsed ${stats.afterDedupe} contacts in ${stats.totalCompanies} companies`);
        }
      } else {
        // Parse legacy CSV
        console.log("[CSV Import] Detected legacy CSV format");
        const allRows = parseCSV(text);
        const dedupedRows = dedupeByLink(allRows);
        
        setParsedRows(dedupedRows);
        setParseStats({
          totalRows: allRows.length,
          afterDedupe: dedupedRows.length,
          duplicatesRemoved: allRows.length - dedupedRows.length,
        });
        
        // Select all by default
        setSelectedRows(new Set(dedupedRows.map((_, i) => i)));
        
        if (dedupedRows.length === 0) {
          toast.error("No contacts found in CSV. Check console for details.");
        } else {
          setStep("preview");
          toast.success(`Parsed ${dedupedRows.length} contacts (${allRows.length - dedupedRows.length} duplicates removed)`);
        }
      }
    } catch (error) {
      console.error("[CSV Import] Parse error:", error);
      toast.error("Failed to parse CSV file. Check console for details.");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Legacy CSV selection handlers
  const toggleSelectRow = (index: number) => {
    const next = new Set(selectedRows);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedRows(next);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === parsedRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(parsedRows.map((_, i) => i)));
    }
  };

  // Apollo CSV selection handlers
  const getCompanyKey = (group: CompanyGroup) => `${group.companyName}|${group.city}|${group.state}`;
  
  const toggleCompanyExpanded = (key: string) => {
    const next = new Set(expandedCompanies);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedCompanies(next);
  };

  const toggleSelectCompany = (group: CompanyGroup) => {
    const key = getCompanyKey(group);
    const next = new Set(selectedCompanies);
    const nextContacts = new Set(selectedContacts);
    
    if (next.has(key)) {
      // Deselect company and all its contacts
      next.delete(key);
      for (const contact of group.contacts) {
        const contactIndex = apolloRows.findIndex(r => r._rowIndex === contact._rowIndex);
        if (contactIndex !== -1) {
          nextContacts.delete(contactIndex);
        }
      }
    } else {
      // Select company and all its contacts
      next.add(key);
      for (const contact of group.contacts) {
        const contactIndex = apolloRows.findIndex(r => r._rowIndex === contact._rowIndex);
        if (contactIndex !== -1) {
          nextContacts.add(contactIndex);
        }
      }
    }
    
    setSelectedCompanies(next);
    setSelectedContacts(nextContacts);
  };

  const toggleSelectContact = (contact: ApolloCSVRow, group: CompanyGroup) => {
    const contactIndex = apolloRows.findIndex(r => r._rowIndex === contact._rowIndex);
    if (contactIndex === -1) return;
    
    const nextContacts = new Set(selectedContacts);
    if (nextContacts.has(contactIndex)) {
      nextContacts.delete(contactIndex);
    } else {
      nextContacts.add(contactIndex);
    }
    setSelectedContacts(nextContacts);
    
    // Update company selection based on whether all contacts are selected
    const key = getCompanyKey(group);
    const allSelected = group.contacts.every(c => {
      const idx = apolloRows.findIndex(r => r._rowIndex === c._rowIndex);
      return nextContacts.has(idx);
    });
    
    const nextCompanies = new Set(selectedCompanies);
    if (allSelected) {
      nextCompanies.add(key);
    } else {
      nextCompanies.delete(key);
    }
    setSelectedCompanies(nextCompanies);
  };

  const toggleSelectAllApollo = () => {
    if (selectedContacts.size === apolloRows.length) {
      setSelectedContacts(new Set());
      setSelectedCompanies(new Set());
    } else {
      setSelectedContacts(new Set(apolloRows.map((_, i) => i)));
      setSelectedCompanies(new Set(companyGroups.map(g => getCompanyKey(g))));
    }
  };

  // Apollo CSV Import handler
  const handleApolloImport = async () => {
    const toImport = apolloRows.filter((_, i) => selectedContacts.has(i));
    if (toImport.length === 0) {
      toast.error("No contacts selected");
      return;
    }

    console.log("[Apollo Import] Starting import of", toImport.length, "contacts");
    
    setStep("importing");
    setImportProgress(0);
    setImportStats({
      created: 0,
      updated: 0,
      companiesCreated: 0,
      companiesUpdated: 0,
      failed: 0,
      notesCreated: 0,
      withMobile: apolloStats.withMobile,
      withWorkPhone: apolloStats.withWorkPhone,
      missingBothPhones: apolloStats.missingBothPhones,
      topTags: apolloStats.topTags,
    });
    setFailedImports([]);

    const sourceList = listName || `Apollo Import ${new Date().toLocaleDateString()}`;
    let created = 0;
    let updated = 0;
    let companiesCreated = 0;
    let companiesUpdated = 0;
    let failed = 0;
    let notesCreated = 0;
    const failures: FailedImport[] = [];

    // Cache for companies by domain to avoid duplicates
    const companyCache = new Map<string, string>(); // domain or name -> company_id

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      console.log(`[Apollo Import] Processing ${i + 1}/${toImport.length}: ${row.firstName} ${row.lastName}`);
      
      try {
        // 1. Find or create company
        let companyId: string | null = null;
        const domain = extractDomain(row.email);
        
        if (row.companyName) {
          const cacheKey = domain || row.companyName.toLowerCase();
          
          // Check cache first
          if (companyCache.has(cacheKey)) {
            companyId = companyCache.get(cacheKey)!;
          } else {
            // Check if company exists by domain
            if (domain) {
              const { data: existingCompany } = await supabase
                .from("companies")
                .select("id")
                .eq("user_id", userId)
                .eq("domain", domain)
                .single();
              
              if (existingCompany) {
                companyId = existingCompany.id;
                companyCache.set(cacheKey, companyId);
                
                // Update company with new data
                const companyData = mapApolloToCompany(row, userId, domain);
                if (companyData) {
                  await supabase
                    .from("companies")
                    .update({
                      employee_count: companyData.employee_count,
                      employee_range: companyData.employee_range,
                      city: companyData.city,
                      state: companyData.state,
                      industry: companyData.industry,
                    })
                    .eq("id", companyId);
                  companiesUpdated++;
                }
              }
            }
            
            // If no company found, check by name
            if (!companyId) {
              const { data: existingByName } = await supabase
                .from("companies")
                .select("id")
                .eq("user_id", userId)
                .eq("name", row.companyName)
                .single();
              
              if (existingByName) {
                companyId = existingByName.id;
                companyCache.set(cacheKey, companyId);
                
                // Update company with new data
                const companyData = mapApolloToCompany(row, userId, domain);
                if (companyData) {
                  await supabase
                    .from("companies")
                    .update({
                      domain: domain || undefined,
                      employee_count: companyData.employee_count,
                      employee_range: companyData.employee_range,
                      city: companyData.city,
                      state: companyData.state,
                      industry: companyData.industry,
                    })
                    .eq("id", companyId);
                  companiesUpdated++;
                }
              }
            }
            
            // Create new company if not found
            if (!companyId) {
              const companyData = mapApolloToCompany(row, userId, domain);
              if (companyData) {
                const { data: newCompany, error: companyError } = await supabase
                  .from("companies")
                  .insert(companyData)
                  .select("id")
                  .single();
                
                if (!companyError && newCompany) {
                  companyId = newCompany.id;
                  companiesCreated++;
                  companyCache.set(cacheKey, companyId);
                } else if (companyError) {
                  console.error("Company insert error:", companyError);
                }
              }
            }
          }
        }

        // 2. Find existing contact by email only (as per user preference)
        let existingContactId: string | null = null;
        
        if (row.email) {
          const { data: byEmail } = await supabase
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .eq("email", row.email.toLowerCase())
            .single();
          
          if (byEmail) existingContactId = byEmail.id;
        }

        // 3. Insert or update contact
        const contactData = {
          ...mapApolloToContact(row, userId, companyId || undefined),
          source_list: sourceList,
        };

        if (existingContactId) {
          // Update existing contact - but don't overwrite phone/mobile with empty values
          const updateData: Record<string, unknown> = { ...contactData };
          
          // Remove phone fields if they're empty to avoid wiping existing good numbers
          if (!updateData.phone) delete updateData.phone;
          if (!updateData.mobile) delete updateData.mobile;
          
          const { error: updateError } = await supabase
            .from("contacts")
            .update(updateData)
            .eq("id", existingContactId);
          
          if (updateError) {
            console.error("Update error:", updateError);
            failures.push({
              row,
              type: "contact",
              error: updateError.message,
              errorCode: updateError.code,
            });
            failed++;
          } else {
            updated++;
            
            // Create note for extra phones if present
            if (row.extraPhonesNote) {
              const { error: noteError } = await supabase
                .from("notes")
                .insert({
                  user_id: userId,
                  contact_id: existingContactId,
                  company_id: companyId,
                  content: row.extraPhonesNote,
                  is_pinned: false,
                  is_company_wide: false,
                });
              
              if (!noteError) notesCreated++;
            }
          }
        } else {
          // Insert new contact
          const { data: newContact, error: insertError } = await supabase
            .from("contacts")
            .insert(contactData)
            .select("id")
            .single();
          
          if (insertError) {
            console.error("Insert error:", insertError);
            failures.push({
              row,
              type: "contact",
              error: insertError.message,
              errorCode: insertError.code,
            });
            failed++;
          } else {
            created++;
            
            // Create note for extra phones if present
            if (row.extraPhonesNote && newContact) {
              const { error: noteError } = await supabase
                .from("notes")
                .insert({
                  user_id: userId,
                  contact_id: newContact.id,
                  company_id: companyId,
                  content: row.extraPhonesNote,
                  is_pinned: false,
                  is_company_wide: false,
                });
              
              if (!noteError) notesCreated++;
            }
          }
        }
      } catch (error) {
        console.error("Import error for row:", row, error);
        
        failures.push({
          row,
          type: "contact",
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }

      // Update progress
      setImportProgress(Math.round(((i + 1) / toImport.length) * 100));
      setImportStats(prev => ({
        ...prev,
        created,
        updated,
        companiesCreated,
        companiesUpdated,
        failed,
        notesCreated,
      }));
    }

    // Set final state
    setFailedImports(failures);
    setStep("done");
    
    if (failures.length > 0) {
      toast.warning(`Imported ${created + updated} contacts with ${failures.length} failure(s)`);
    } else {
      toast.success(`Imported ${created + updated} contacts!`);
    }
  };

  // Legacy CSV Import handler
  const handleLegacyImport = async () => {
    const toImport = parsedRows.filter((_, i) => selectedRows.has(i));
    if (toImport.length === 0) {
      toast.error("No contacts selected");
      return;
    }

    console.log("[CSV Import] Starting import of", toImport.length, "contacts");
    
    setStep("importing");
    setImportProgress(0);
    setImportStats({
      created: 0,
      updated: 0,
      companiesCreated: 0,
      companiesUpdated: 0,
      failed: 0,
      notesCreated: 0,
      withMobile: 0,
      withWorkPhone: 0,
      missingBothPhones: 0,
      topTags: [],
    });
    setFailedImports([]);

    const sourceList = listName || `CSV Import ${new Date().toLocaleDateString()}`;
    let created = 0;
    let updated = 0;
    let companiesCreated = 0;
    let failed = 0;
    let notesCreated = 0;
    const failures: FailedImport[] = [];

    // Cache for companies by domain to avoid duplicates
    const companyCache = new Map<string, string>(); // domain -> company_id

    for (let i = 0; i < toImport.length; i++) {
      const row = toImport[i];
      console.log(`[CSV Import] Processing ${i + 1}/${toImport.length}: ${row.firstName} ${row.lastName}`);
      
      try {
        // 1. Find or create company
        let companyId: string | null = null;
        const domain = extractDomain(row.email);
        
        if (row.company) {
          // Check cache first
          if (domain && companyCache.has(domain)) {
            companyId = companyCache.get(domain)!;
          } else {
            // Check if company exists by domain
            if (domain) {
              const { data: existingCompany } = await supabase
                .from("companies")
                .select("id")
                .eq("user_id", userId)
                .eq("domain", domain)
                .single();
              
              if (existingCompany) {
                companyId = existingCompany.id;
                companyCache.set(domain, companyId);
              }
            }
            
            // If no company found, check by name
            if (!companyId) {
              const { data: existingByName } = await supabase
                .from("companies")
                .select("id")
                .eq("user_id", userId)
                .eq("name", row.company)
                .single();
              
              if (existingByName) {
                companyId = existingByName.id;
                if (domain) companyCache.set(domain, companyId);
              }
            }
            
            // Create new company if not found
            if (!companyId) {
              const companyData = mapToCompany(row, userId, domain);
              if (companyData) {
                const { data: newCompany, error: companyError } = await supabase
                  .from("companies")
                  .insert(companyData)
                  .select("id")
                  .single();
                
                if (!companyError && newCompany) {
                  companyId = newCompany.id;
                  companiesCreated++;
                  if (domain) companyCache.set(domain, companyId);
                } else if (companyError) {
                  // Track company creation failure (but don't count as failed import - contact may still succeed)
                  console.error("Company insert error:", companyError);
                }
              }
            }
          }
        }

        // 2. Find existing contact by linkedin_url → email → phone
        let existingContactId: string | null = null;
        
        // Try LinkedIn URL first
        if (row.linkedinUrl) {
          const { data: byLinkedIn } = await supabase
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .eq("linkedin_url", row.linkedinUrl)
            .single();
          
          if (byLinkedIn) existingContactId = byLinkedIn.id;
        }
        
        // Try email
        if (!existingContactId && row.email) {
          const { data: byEmail } = await supabase
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .eq("email", row.email)
            .single();
          
          if (byEmail) existingContactId = byEmail.id;
        }
        
        // Try phone (direct)
        if (!existingContactId && row.direct) {
          const { data: byPhone } = await supabase
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .eq("phone", row.direct)
            .single();
          
          if (byPhone) existingContactId = byPhone.id;
        }

        // 3. Insert or update contact
        const contactData = {
          ...mapToContact(row, userId, companyId || undefined),
          source_list: sourceList,
        };

        if (existingContactId) {
          // Update existing contact
          const { error: updateError } = await supabase
            .from("contacts")
            .update(contactData)
            .eq("id", existingContactId);
          
          if (updateError) {
            console.error("Update error:", updateError);
            failures.push({
              row,
              type: "contact",
              error: updateError.message,
              errorCode: updateError.code,
            });
            failed++;
          } else {
            updated++;
            
            // Create note if there's content
            if (row.notes?.trim()) {
              const { error: noteError } = await supabase
                .from("notes")
                .insert({
                  user_id: userId,
                  contact_id: existingContactId,
                  company_id: companyId,
                  content: row.notes.trim(),
                  is_pinned: false,
                  is_company_wide: false,
                });
              
              if (!noteError) notesCreated++;
            }
          }
        } else {
          // Insert new contact
          const { data: newContact, error: insertError } = await supabase
            .from("contacts")
            .insert(contactData)
            .select("id")
            .single();
          
          if (insertError) {
            console.error("Insert error:", insertError);
            failures.push({
              row,
              type: "contact",
              error: insertError.message,
              errorCode: insertError.code,
            });
            failed++;
          } else {
            created++;
            
            // Create note if there's content
            if (row.notes?.trim() && newContact) {
              const { error: noteError } = await supabase
                .from("notes")
                .insert({
                  user_id: userId,
                  contact_id: newContact.id,
                  company_id: companyId,
                  content: row.notes.trim(),
                  is_pinned: false,
                  is_company_wide: false,
                });
              
              if (!noteError) notesCreated++;
            }
          }
        }
      } catch (error) {
        console.error("Import error for row:", row, error);
        failures.push({
          row,
          type: "contact",
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }

      // Update progress
      setImportProgress(Math.round(((i + 1) / toImport.length) * 100));
      setImportStats(prev => ({
        ...prev,
        created,
        updated,
        companiesCreated,
        failed,
        notesCreated,
      }));
    }

    // Set final state
    setFailedImports(failures);
    setStep("done");
    
    if (failures.length > 0) {
      toast.warning(`Imported ${created + updated} contacts with ${failures.length} failure(s)`);
    } else {
      toast.success(`Imported ${created + updated} contacts!`);
    }
  };

  const handleImport = () => {
    if (csvType === "apollo") {
      handleApolloImport();
    } else {
      handleLegacyImport();
    }
  };

  const resetImport = () => {
    setStep("upload");
    setCsvType("legacy");
    setParsedRows([]);
    setFileName("");
    setCompanyGroups([]);
    setApolloRows([]);
    setSelectedCompanies(new Set());
    setSelectedContacts(new Set());
    setExpandedCompanies(new Set());
    setImportStats({
      created: 0,
      updated: 0,
      companiesCreated: 0,
      companiesUpdated: 0,
      failed: 0,
      notesCreated: 0,
      withMobile: 0,
      withWorkPhone: 0,
      missingBothPhones: 0,
      topTags: [],
    });
    setImportProgress(0);
  };

  // Step: Upload
  if (step === "upload") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import from CSV
            </CardTitle>
            <CardDescription>
              Upload a CSV file with your contact list (supports Apollo exports)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("csv-upload")?.click()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
                ${isDragging 
                  ? "border-primary bg-primary/5" 
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
                }
              `}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">
                Drag and drop your CSV file here
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                or click anywhere to browse
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <Button variant="outline" type="button">
                Select File
              </Button>
            </div>

            {/* List Name */}
            <div className="space-y-2">
              <Label htmlFor="list-name">Import List Name (optional)</Label>
              <Input
                id="list-name"
                placeholder={`e.g., Apollo Export ${new Date().toLocaleDateString()}`}
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This will be saved as the source_list for imported contacts
              </p>
            </div>

            {/* Supported Formats */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium">Supported CSV formats:</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Apollo Export:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {["First Name", "Last Name", "Company Name", "Email", "Mobile Phone", "Other Phone", "# Employees", "City", "State"].map((col) => (
                      <Badge key={col} variant="secondary" className="text-xs">
                        {col}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Legacy Format:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {["Last Name", "First Name", "Company", "Link", "Mobile", "Direct", "Email", "Position"].map((col) => (
                      <Badge key={col} variant="outline" className="text-xs">
                        {col}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step: Preview (Apollo)
  if (step === "preview" && csvType === "apollo") {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Preview Import</h2>
            <p className="text-sm text-muted-foreground">
              {apolloStats.afterDedupe} contacts in {apolloStats.totalCompanies} companies from {fileName}
              {apolloStats.duplicatesRemoved > 0 && (
                <span className="text-amber-600 ml-2">
                  ({apolloStats.duplicatesRemoved} duplicates by email removed)
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetImport}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={selectedContacts.size === 0}>
              <Upload className="mr-2 h-4 w-4" />
              Import {selectedContacts.size} Contacts
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{apolloStats.totalCompanies}</p>
                  <p className="text-xs text-muted-foreground">Companies</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{apolloStats.afterDedupe}</p>
                  <p className="text-xs text-muted-foreground">Contacts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{apolloStats.withMobile}</p>
                  <p className="text-xs text-muted-foreground">With Mobile</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Phone className="h-8 w-8 text-cyan-500" />
                <div>
                  <p className="text-2xl font-bold">{apolloStats.withWorkPhone}</p>
                  <p className="text-xs text-muted-foreground">With Other Phone</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{apolloStats.missingBothPhones}</p>
                  <p className="text-xs text-muted-foreground">No Phone</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Tags */}
        {apolloStats.topTags.length > 0 && (
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Top industries:</span>
            <div className="flex gap-1.5">
              {apolloStats.topTags.map(({ tag, count }) => (
                <Badge key={tag} variant="secondary" className={getTagColor(tag)}>
                  {tag.replace("_", " ")} ({count})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Select All */}
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedContacts.size === apolloRows.length}
            onCheckedChange={toggleSelectAllApollo}
          />
          <span className="text-sm">
            {selectedContacts.size === apolloRows.length ? "Deselect all" : "Select all"} ({selectedContacts.size} selected)
          </span>
        </div>

        {/* Company Groups */}
        <Card>
          <ScrollArea className="h-[500px]">
            <div className="p-4 space-y-2">
              {companyGroups.map((group) => {
                const key = getCompanyKey(group);
                const isExpanded = expandedCompanies.has(key);
                const isSelected = selectedCompanies.has(key);
                const selectedInGroup = group.contacts.filter(c => {
                  const idx = apolloRows.findIndex(r => r._rowIndex === c._rowIndex);
                  return selectedContacts.has(idx);
                }).length;
                
                return (
                  <Collapsible key={key} open={isExpanded}>
                    {/* Company Header */}
                    <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-lg hover:bg-muted/40 transition-colors">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectCompany(group)}
                      />
                      <CollapsibleTrigger 
                        className="flex-1 flex items-center gap-3 text-left"
                        onClick={() => toggleCompanyExpanded(key)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{group.companyName}</span>
                            <span className="text-xs text-muted-foreground">
                              ({selectedInGroup}/{group.contacts.length} contacts)
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {group.city && group.state && (
                              <span>{group.city}, {group.state}</span>
                            )}
                            {group.employeeCount && (
                              <span className="text-primary">{group.employeeCount} employees</span>
                            )}
                          </div>
                        </div>
                        {/* Tags */}
                        <div className="flex gap-1 flex-shrink-0">
                          {group.inferredTags.map(tag => (
                            <Badge key={tag} variant="secondary" className={`text-xs ${getTagColor(tag)}`}>
                              {tag.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      </CollapsibleTrigger>
                    </div>
                    
                    {/* Contact List */}
                    <CollapsibleContent>
                      <div className="ml-8 mt-1 space-y-1">
                        {group.contacts.map((contact) => {
                          const contactIndex = apolloRows.findIndex(r => r._rowIndex === contact._rowIndex);
                          const isContactSelected = selectedContacts.has(contactIndex);
                          
                          return (
                            <div
                              key={contact._rowIndex}
                              className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                                isContactSelected ? "bg-primary/5" : "hover:bg-muted/30"
                              } ${!contact.mobilePhone && !contact.otherPhone ? "opacity-60" : ""}`}
                            >
                              <Checkbox
                                checked={isContactSelected}
                                onCheckedChange={() => toggleSelectContact(contact, group)}
                              />
                              <div className="flex-1 min-w-0 grid grid-cols-4 gap-4">
                                {/* Name & Title */}
                                <div>
                                  <p className="font-medium text-sm truncate">
                                    {contact.firstName} {contact.lastName}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {contact.title || "No title"}
                                  </p>
                                </div>
                                
                                {/* Email */}
                                <div className="flex items-center gap-1.5">
                                  {contact.email ? (
                                    <>
                                      <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <span className="text-xs truncate">{contact.email}</span>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No email</span>
                                  )}
                                </div>
                                
                                {/* Mobile Phone */}
                                <div className="flex items-center gap-1.5">
                                  {contact.mobilePhone ? (
                                    <>
                                      <Smartphone className="h-3 w-3 text-green-500 flex-shrink-0" />
                                      <span className="text-xs font-mono">{contact.mobilePhone}</span>
                                      <Badge variant="outline" className="text-[8px] h-4 px-1 border-green-500/30 text-green-500">
                                        Mobile
                                      </Badge>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No mobile</span>
                                  )}
                                </div>
                                
                                {/* Other Phone */}
                                <div className="flex items-center gap-1.5">
                                  {contact.otherPhone ? (
                                    <>
                                      <Phone className="h-3 w-3 text-cyan-500 flex-shrink-0" />
                                      <span className="text-xs font-mono">{contact.otherPhone}</span>
                                      <Badge variant="outline" className="text-[8px] h-4 px-1 border-cyan-500/30 text-cyan-500">
                                        Other
                                      </Badge>
                                    </>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No other phone</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      </div>
    );
  }

  // Step: Preview (Legacy)
  if (step === "preview" && csvType === "legacy") {
    // Count contacts with phone numbers
    const withPhone = parsedRows.filter(r => r.direct || r.mobile).length;
    const withEmail = parsedRows.filter(r => r.email).length;
    const withLinkedIn = parsedRows.filter(r => r.linkedinUrl).length;
    
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Preview Import</h2>
            <p className="text-sm text-muted-foreground">
              {parseStats.afterDedupe} contacts from {fileName}
              {parseStats.duplicatesRemoved > 0 && (
                <span className="text-amber-600 ml-2">
                  ({parseStats.duplicatesRemoved} duplicates removed)
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetImport}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={selectedRows.size === 0}>
              <Upload className="mr-2 h-4 w-4" />
              Import {selectedRows.size} Contacts
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{parseStats.afterDedupe}</p>
                  <p className="text-xs text-muted-foreground">Total Contacts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Phone className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{withPhone}</p>
                  <p className="text-xs text-muted-foreground">With Phone</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{withLinkedIn}</p>
                  <p className="text-xs text-muted-foreground">With LinkedIn</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{parseStats.afterDedupe - withPhone}</p>
                  <p className="text-xs text-muted-foreground">No Phone (won&#39;t dial)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Table */}
        <Card>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedRows.size === parsedRows.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Contact Info</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedRows.map((row, index) => (
                  <TableRow key={index} className={!row.direct && !row.mobile ? "opacity-60" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRows.has(index)}
                        onCheckedChange={() => toggleSelectRow(index)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.firstName} {row.lastName}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {row.position || "-"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium truncate max-w-[180px]">{row.company || "-"}</p>
                        {row.companyHeadcount && (
                          <p className="text-xs text-muted-foreground">{row.companyHeadcount}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.companyInfo || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {row.email && <Badge variant="outline">Email</Badge>}
                        {row.direct && <Badge variant="outline">Direct</Badge>}
                        {row.mobile && <Badge variant="outline">Mobile</Badge>}
                        {row.linkedinUrl && <Badge variant="outline">LinkedIn</Badge>}
                        {!row.email && !row.direct && !row.mobile && !row.linkedinUrl && (
                          <Badge variant="destructive">No contact info</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      </div>
    );
  }

  // Step: Importing
  if (step === "importing") {
    return (
      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Importing Contacts</h2>
          <p className="text-muted-foreground">Creating companies and contacts...</p>
        </div>
        <Progress value={importProgress} className="w-full" />
        <div className="text-sm text-muted-foreground space-y-1">
          <p>{importStats.created} contacts created</p>
          <p>{importStats.updated} contacts updated</p>
          <p>{importStats.companiesCreated} companies created</p>
          {importStats.companiesUpdated > 0 && (
            <p>{importStats.companiesUpdated} companies updated</p>
          )}
          {importStats.failed > 0 && (
            <p className="text-red-500">{importStats.failed} failed</p>
          )}
        </div>
      </div>
    );
  }

  // Step: Done
  return (
    <div className="max-w-xl mx-auto text-center space-y-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Import Complete!</h2>
        <p className="text-muted-foreground">Your contacts are ready to call.</p>
      </div>
      
      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-green-600">{importStats.created}</p>
            <p className="text-xs text-muted-foreground">Contacts Created</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-blue-600">{importStats.updated}</p>
            <p className="text-xs text-muted-foreground">Contacts Updated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-purple-600">{importStats.companiesCreated}</p>
            <p className="text-xs text-muted-foreground">Companies Created</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-amber-600">{importStats.notesCreated}</p>
            <p className="text-xs text-muted-foreground">Notes Added</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Phone Coverage Stats (Apollo only) */}
      {csvType === "apollo" && (importStats.withMobile > 0 || importStats.withWorkPhone > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Phone Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-green-600">{importStats.withMobile}</p>
                <p className="text-xs text-muted-foreground">With Mobile</p>
              </div>
              <div>
                <p className="text-lg font-bold text-cyan-600">{importStats.withWorkPhone}</p>
                <p className="text-xs text-muted-foreground">With Other Phone</p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-600">{importStats.missingBothPhones}</p>
                <p className="text-xs text-muted-foreground">No Phone</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Top Tags (Apollo only) */}
      {csvType === "apollo" && importStats.topTags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Industries Found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 justify-center">
              {importStats.topTags.map(({ tag, count }) => (
                <Badge key={tag} variant="outline" className={getTagColor(tag)}>
                  {tag.replace("_", " ")} ({count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Failed Imports */}
      {importStats.failed > 0 && (
        <Card 
          className="border-red-200 dark:border-red-900 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
          onClick={() => setShowFailedDialog(true)}
        >
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-red-600">{importStats.failed}</p>
            <p className="text-xs text-muted-foreground">Failed - Click to view details</p>
          </CardContent>
        </Card>
      )}
      
      {/* Action Buttons */}
      <div className="flex gap-2 justify-center">
        <Button variant="outline" onClick={resetImport}>
          Import More
        </Button>
        <Button onClick={() => window.location.href = "/companies"}>
          <Building2 className="mr-2 h-4 w-4" />
          View Companies
        </Button>
        <Button onClick={() => window.location.href = "/dialer"}>
          <Phone className="mr-2 h-4 w-4" />
          Start Calling
        </Button>
      </div>

      {/* Failed Imports Dialog */}
      <Dialog open={showFailedDialog} onOpenChange={setShowFailedDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Failed Imports ({failedImports.length})
            </DialogTitle>
            <DialogDescription>
              The following contacts could not be imported. Review the errors below.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedImports.map((failure, index) => {
                  const row = failure.row as ApolloCSVRow | ParsedCSVRow;
                  const name = `${row.firstName} ${row.lastName}`;
                  const company = "companyName" in row ? row.companyName : row.company;
                  
                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {company || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs font-normal">
                          {getFriendlyErrorMessage(failure.error, failure.errorCode)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowFailedDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
