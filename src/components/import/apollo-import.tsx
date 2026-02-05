"use client";

import { useState, useEffect } from "react";
import { useBulkCreateContacts } from "@/hooks/use-contacts";
import { usePersonaSets, useCreatePersonaSet, PERSONA_SET_TEMPLATES } from "@/hooks/use-persona-sets";
import { useFindOrCreateCompany } from "@/hooks/use-companies";
import { mapApolloToContact, mapApolloToCompany, APOLLO_INDUSTRIES } from "@/lib/apollo/client";
import { getTimezoneFromLocation } from "@/lib/timezone";
import { insforge } from "@/lib/insforge/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EMPLOYEE_RANGES } from "@/lib/constants";
import { toast } from "sonner";
import {
  Search,
  Download,
  Loader2,
  CheckCircle2,
  Plus,
  Building2,
  Users,
  Sparkles,
  Save,
} from "lucide-react";
import type { ApolloPerson } from "@/types/apollo";
import type { PersonaSet } from "@/types/database";
import { DEFAULT_USER_ID } from "@/lib/default-user";

// Industry options for search - Home Services focus
const INDUSTRY_OPTIONS = [
  { value: "hvac", label: "HVAC", apolloId: APOLLO_INDUSTRIES.hvac },
  { value: "plumbing", label: "Plumbing", apolloId: APOLLO_INDUSTRIES.plumbing },
  { value: "roofing", label: "Roofing", apolloId: APOLLO_INDUSTRIES.roofing },
  { value: "electrical", label: "Electrical", apolloId: APOLLO_INDUSTRIES.electrical },
  { value: "solar", label: "Solar & Renewables", apolloId: APOLLO_INDUSTRIES.solar },
  { value: "construction", label: "General Contractors", apolloId: APOLLO_INDUSTRIES.construction },
];

export function ApolloImport() {
  const [step, setStep] = useState<"search" | "preview" | "importing" | "done">("search");
  const [apiKey, setApiKey] = useState("");
  const userId = DEFAULT_USER_ID;
  
  // Persona set selection
  const [selectedPersonaSetId, setSelectedPersonaSetId] = useState<string>("_none");
  const [showCreatePersona, setShowCreatePersona] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newPersonaTitles, setNewPersonaTitles] = useState("");
  const [newPersonaIndustries, setNewPersonaIndustries] = useState<string[]>([]);
  const [newPersonaEmployeeRanges, setNewPersonaEmployeeRanges] = useState<string[]>([]);
  const [useIntentData, setUseIntentData] = useState(false);
  
  // Manual search params (when not using persona set)
  const [industry, setIndustry] = useState<string>("");
  const [employeeRange, setEmployeeRange] = useState<string>("1001-5000");
  const [customTitles, setCustomTitles] = useState<string>("");
  const [listName, setListName] = useState("");
  
  // Results
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ApolloPerson[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  
  // Import progress
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState({ 
    imported: 0, 
    duplicates: 0, 
    failed: 0,
    companiesCreated: 0 
  });

    const bulkCreate = useBulkCreateContacts();
  const { data: personaSets, isLoading: loadingPersonaSets } = usePersonaSets();
  const createPersonaSet = useCreatePersonaSet();

  // Load saved API key from settings
  useEffect(() => {
    const loadApiKey = async () => {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("apollo_api_key")
        .eq("user_id", userId)
        .single();
      
      const apiKeyValue = (settings as { apollo_api_key: string | null } | null)?.apollo_api_key;
      if (apiKeyValue) {
        setApiKey(apiKeyValue);
      }
    };
    loadApiKey();
  }, [supabase, userId]);

  // When persona set is selected, populate fields
  useEffect(() => {
    if (selectedPersonaSetId && selectedPersonaSetId !== "_none" && personaSets) {
      const set = personaSets.find(p => p.id === selectedPersonaSetId);
      if (set) {
        setCustomTitles(set.titles.join(", "));
        setIndustry(set.industries[0] || "");
        setEmployeeRange(set.employee_ranges[0] || "1001-5000");
        setUseIntentData(set.include_intent_data);
      }
    }
  }, [selectedPersonaSetId, personaSets]);

  const handleCreatePersonaSet = async () => {
    if (!newPersonaName || !newPersonaTitles) {
      toast.error("Please enter a name and titles");
      return;
    }

    try {
      const titles = newPersonaTitles.split(",").map(t => t.trim()).filter(Boolean);
      
      await createPersonaSet.mutateAsync({
        user_id: userId,
        name: newPersonaName,
        titles,
        industries: newPersonaIndustries,
        employee_ranges: newPersonaEmployeeRanges,
        include_intent_data: useIntentData,
        is_default: false,
      });

      toast.success("Persona set created!");
      setShowCreatePersona(false);
      setNewPersonaName("");
      setNewPersonaTitles("");
      setNewPersonaIndustries([]);
      setNewPersonaEmployeeRanges([]);
    } catch (error: any) {
      toast.error(error.message || "Failed to create persona set");
    }
  };

  const handleSearch = async () => {
    if (!apiKey) {
      toast.error("Please enter your Apollo API key");
      return;
    }

    setIsSearching(true);
    try {
      // Build titles array
      const titles = customTitles
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);

      // Build employee range for Apollo API format
      const [min, max] = employeeRange.split("-").map(s => s.replace("+", ""));
      const empRange = max ? `${min},${max}` : `${min},`;

      // Find Apollo industry ID
      const industryOption = INDUSTRY_OPTIONS.find(i => i.value === industry);

      const searchBody: any = {
        apiKey,
        organization_num_employees_ranges: [empRange],
        page: 1,
        per_page: 50,
      };

      if (industryOption?.apolloId) {
        searchBody.organization_industry_tag_ids = [industryOption.apolloId];
      }

      if (titles.length > 0) {
        searchBody.person_titles = titles;
      }

      // Note: Intent data requires specific Apollo plan - include if enabled
      if (useIntentData) {
        searchBody.organization_intent_score_min = 50;
      }

      const response = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Search failed");
      }

      const data = await response.json();
      setSearchResults(data.people || []);
      setPagination({
        page: data.pagination?.page || 1,
        total: data.pagination?.total_entries || 0,
        totalPages: data.pagination?.total_pages || 0,
      });
      
      // Select all by default
      setSelectedContacts(new Set(data.people?.map((p: ApolloPerson) => p.id) || []));
      
      setStep("preview");
      toast.success(`Found ${data.pagination?.total_entries || 0} contacts`);
    } catch (error: any) {
      toast.error(error.message || "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const handleImport = async () => {
    const toImport = searchResults.filter(p => selectedContacts.has(p.id));
    if (toImport.length === 0) {
      toast.error("No contacts selected");
      return;
    }

    setStep("importing");
    setImportProgress(0);
    setImportStats({ imported: 0, duplicates: 0, failed: 0, companiesCreated: 0 });

    try {
      const sourceList = listName || `Apollo Import ${new Date().toLocaleDateString()}`;
      
      // Group contacts by company domain
      const companyMap = new Map<string, ApolloPerson[]>();
      
      for (const person of toImport) {
        const domain = person.organization?.website_url
          ?.replace(/^https?:\/\//, "")
          .replace(/\/$/, "") || person.organization?.name || "unknown";
        
        if (!companyMap.has(domain)) {
          companyMap.set(domain, []);
        }
        companyMap.get(domain)!.push(person);
      }

      // Check for existing contacts by apollo_id or email
      const apolloIds = toImport.map(p => p.id).filter(Boolean);
      const emails = toImport.map(p => p.email).filter(Boolean);

      const { data: existingContactsData } = await supabase
        .from("contacts")
        .select("apollo_id, email")
        .or(`apollo_id.in.(${apolloIds.join(",")}),email.in.(${emails.join(",")})`);

      const existingContacts = existingContactsData as { apollo_id: string | null; email: string | null }[] | null;
      const existingApolloIds = new Set(existingContacts?.map(e => e.apollo_id) || []);
      const existingEmails = new Set(existingContacts?.map(e => e.email) || []);

      // Process companies and contacts
      let imported = 0;
      let duplicates = 0;
      let companiesCreated = 0;
      const totalToProcess = toImport.length;
      
      for (const [domain, companyContacts] of companyMap) {
        // Create or find company
        const samplePerson = companyContacts[0];
        let companyId: string | null = null;

        if (samplePerson.organization?.name) {
          // Check if company exists
          const normalizedDomain = domain !== "unknown" ? domain : null;
          
          if (normalizedDomain) {
            const { data: existingCompanyData } = await supabase
              .from("companies")
              .select("id")
              .eq("user_id", userId)
              .eq("domain", normalizedDomain)
              .single();

            const existingCompany = existingCompanyData as { id: string } | null;
            if (existingCompany) {
              companyId = existingCompany.id;
            }
          }

          // Create company if it doesn't exist
          if (!companyId) {
            const companyData = mapApolloToCompany(samplePerson, userId);
            
            if (companyData) {
              const { data: newCompanyData, error: companyError } = await supabase
                .from("companies")
                .insert(companyData as any)
                .select("id")
                .single();

              const newCompany = newCompanyData as { id: string } | null;
              if (!companyError && newCompany) {
                companyId = newCompany.id;
                companiesCreated++;
              }
            }
          }
        }

        // Import contacts for this company
        for (const person of companyContacts) {
          // Skip duplicates
          if (existingApolloIds.has(person.id) || existingEmails.has(person.email)) {
            duplicates++;
            continue;
          }

          const contactData = mapApolloToContact(person, userId, sourceList, companyId || undefined);

          const { error } = await supabase
            .from("contacts")
            .insert(contactData as any);

          if (!error) {
            imported++;
          }

          // Update progress
          const processed = imported + duplicates;
          setImportProgress(Math.round((processed / totalToProcess) * 100));
          setImportStats(prev => ({
            ...prev,
            imported,
            duplicates,
            companiesCreated,
          }));
        }
      }

      setImportStats({
        imported,
        duplicates,
        failed: 0,
        companiesCreated,
      });

      // Save API key to settings if not already saved
      await supabase
        .from("user_settings")
        .upsert({ user_id: userId, apollo_api_key: apiKey } as any);

      setStep("done");
      toast.success(`Successfully imported ${imported} contacts!`);
    } catch (error: any) {
      toast.error(error.message || "Import failed");
      setStep("preview");
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedContacts);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedContacts(next);
  };

  const toggleSelectAll = () => {
    if (selectedContacts.size === searchResults.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(searchResults.map(p => p.id)));
    }
  };

  const applyTemplate = (templateKey: keyof typeof PERSONA_SET_TEMPLATES) => {
    const template = PERSONA_SET_TEMPLATES[templateKey];
    setNewPersonaName(template.name);
    setNewPersonaTitles(template.titles.join(", "));
    setNewPersonaIndustries(template.industries);
    setNewPersonaEmployeeRanges(template.employee_ranges);
  };

  // Step: Search
  if (step === "search") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Apollo
            </CardTitle>
            <CardDescription>
              Find contacts matching your ideal customer profile (US only)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Key */}
            <div className="space-y-2">
              <Label htmlFor="api-key">Apollo API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your Apollo API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Find your API key in Apollo Settings → API
              </p>
            </div>

            <Separator />

            {/* Persona Set Selector */}
            <div className="space-y-2">
              <Label>Persona Set</Label>
              <div className="flex gap-2">
                <Select 
                  value={selectedPersonaSetId} 
                  onValueChange={setSelectedPersonaSetId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a saved persona set or configure manually" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Configure manually</SelectItem>
                    {personaSets?.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name} {set.is_default && "(Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={showCreatePersona} onOpenChange={setShowCreatePersona}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Persona Set</DialogTitle>
                      <DialogDescription>
                        Save your search criteria for quick reuse
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Templates */}
                      <div className="space-y-2">
                        <Label>Quick Templates</Label>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(PERSONA_SET_TEMPLATES).map(([key, template]) => (
                            <Button
                              key={key}
                              variant="outline"
                              size="sm"
                              onClick={() => applyTemplate(key as keyof typeof PERSONA_SET_TEMPLATES)}
                            >
                              {template.name}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={newPersonaName}
                          onChange={(e) => setNewPersonaName(e.target.value)}
                          placeholder="e.g., Finance Leaders - Healthcare"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Job Titles (comma-separated)</Label>
                        <Input
                          value={newPersonaTitles}
                          onChange={(e) => setNewPersonaTitles(e.target.value)}
                          placeholder="CFO, VP Finance, Controller"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={useIntentData}
                          onCheckedChange={(checked) => setUseIntentData(!!checked)}
                        />
                        <Label className="text-sm">Include intent data filter</Label>
                      </div>
                      <Button 
                        onClick={handleCreatePersonaSet} 
                        disabled={createPersonaSet.isPending}
                        className="w-full"
                      >
                        {createPersonaSet.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save Persona Set
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Separator />

            {/* Industry */}
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Count */}
            <div className="space-y-2">
              <Label>Employee Count</Label>
              <Select value={employeeRange} onValueChange={setEmployeeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_RANGES.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label} employees
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Job Titles */}
            <div className="space-y-2">
              <Label>Job Titles (comma-separated)</Label>
              <Input
                placeholder="CFO, VP Finance, Controller, Director of Finance"
                value={customTitles}
                onChange={(e) => setCustomTitles(e.target.value)}
              />
            </div>

            {/* Intent Data Toggle */}
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Intent Data</p>
                <p className="text-xs text-muted-foreground">
                  Filter by companies showing buying signals
                </p>
              </div>
              <Checkbox
                checked={useIntentData}
                onCheckedChange={(checked) => setUseIntentData(!!checked)}
              />
            </div>

            {/* List Name */}
            <div className="space-y-2">
              <Label htmlFor="list-name">List Name (optional)</Label>
              <Input
                id="list-name"
                placeholder={`e.g., Credit Unions ${new Date().toLocaleDateString()}`}
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </div>

            <Button onClick={handleSearch} disabled={isSearching || !apiKey} className="w-full">
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Contacts
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step: Preview
  if (step === "preview") {
    // Group by company for preview
    const companyCounts = new Map<string, number>();
    searchResults.forEach(p => {
      const company = p.organization?.name || "Unknown";
      companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
    });
    const uniqueCompanies = companyCounts.size;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Preview Results</h2>
            <p className="text-sm text-muted-foreground">
              {pagination.total} contacts at {uniqueCompanies} companies • {selectedContacts.size} selected
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("search")}>
              Back to Search
            </Button>
            <Button onClick={handleImport} disabled={selectedContacts.size === 0}>
              <Download className="mr-2 h-4 w-4" />
              Import {selectedContacts.size} Contacts
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{pagination.total}</p>
                  <p className="text-xs text-muted-foreground">Total Contacts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{uniqueCompanies}</p>
                  <p className="text-xs text-muted-foreground">Unique Companies</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedContacts.size === searchResults.length}
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
                {searchResults.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedContacts.has(person.id)}
                        onCheckedChange={() => toggleSelect(person.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {person.first_name} {person.last_name}
                    </TableCell>
                    <TableCell className="text-sm">{person.title || "-"}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{person.organization?.name || "-"}</p>
                        {person.organization?.estimated_num_employees && (
                          <p className="text-xs text-muted-foreground">
                            {person.organization.estimated_num_employees.toLocaleString()} employees
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {[person.city, person.state].filter(Boolean).join(", ") || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {person.email && <Badge variant="outline">Email</Badge>}
                        {person.phone_numbers?.length > 0 && (
                          <Badge variant="outline">Phone</Badge>
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
          <p>{importStats.imported} contacts imported</p>
          <p>{importStats.companiesCreated} companies created</p>
          {importStats.duplicates > 0 && (
            <p>{importStats.duplicates} duplicates skipped</p>
          )}
        </div>
      </div>
    );
  }

  // Step: Done
  return (
    <div className="max-w-md mx-auto text-center space-y-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Import Complete!</h2>
        <p className="text-muted-foreground">Your contacts are ready to call.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-green-600">{importStats.imported}</p>
            <p className="text-xs text-muted-foreground">Contacts Imported</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-blue-600">{importStats.companiesCreated}</p>
            <p className="text-xs text-muted-foreground">Companies Created</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-yellow-600">{importStats.duplicates}</p>
            <p className="text-xs text-muted-foreground">Duplicates Skipped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold text-red-600">{importStats.failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
      </div>
      <div className="flex gap-2 justify-center">
        <Button variant="outline" onClick={() => setStep("search")}>
          Import More
        </Button>
        <Button onClick={() => window.location.href = "/companies"}>
          <Building2 className="mr-2 h-4 w-4" />
          View Companies
        </Button>
        <Button onClick={() => window.location.href = "/dialer"}>
          Start Calling
        </Button>
      </div>
    </div>
  );
}
