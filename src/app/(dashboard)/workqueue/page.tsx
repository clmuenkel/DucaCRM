"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { insforge } from "@/lib/neon/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { DaysAgoBadge } from "@/components/workqueue/days-ago-badge";
import { WrongNumberFlag } from "@/components/workqueue/wrong-number-flag";
import {
  Search,
  Phone,
  Mail,
  Loader2,
  Play,
  Building2,
  Users,
  Sparkles,
  X,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";
import { getValidPhone } from "@/lib/utils";
import type { Contact } from "@/types/database";

const STEP_NAMES: Record<number, string> = {
  0: "Email 1",
  1: "Call 1",
  2: "Email 2",
  3: "Call 2",
  4: "Email 3",
  5: "Call 3",
};

const EMPLOYEE_RANGES = [
  { value: "all", label: "Any Size" },
  { value: "1-10", label: "1–10", min: 1, max: 10 },
  { value: "11-50", label: "11–50", min: 11, max: 50 },
  { value: "51-200", label: "51–200", min: 51, max: 200 },
  { value: "201-500", label: "201–500", min: 201, max: 500 },
  { value: "501-1000", label: "501–1,000", min: 501, max: 1000 },
  { value: "1001+", label: "1,000+", min: 1001, max: 999999 },
];
const INITIAL_TABLE_ROWS = 5;

export default function WorkQueuePage() {
  const router = useRouter();
      // Using insforge (already imported)
  const [isLoading, setIsLoading] = useState(true);
  const [activeCadenceContacts, setActiveCadenceContacts] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isStartingCadence, setIsStartingCadence] = useState(false);
  const [showStartCadenceDialog, setShowStartCadenceDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [employeeSizeFilter, setEmployeeSizeFilter] = useState("all");
  const [hasPhoneFilter, setHasPhoneFilter] = useState(false);
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [showLostFilter, setShowLostFilter] = useState(false);
  const [visibleCadenceRows, setVisibleCadenceRows] = useState(INITIAL_TABLE_ROWS);
  const [visibleAllRows, setVisibleAllRows] = useState(INITIAL_TABLE_ROWS);
  const [cadenceSearchQuery, setCadenceSearchQuery] = useState("");

  // Derive unique states and industries from loaded data
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    allContacts.forEach(c => { if (c.state) states.add(c.state); });
    return Array.from(states).sort();
  }, [allContacts]);

  const uniqueIndustries = useMemo(() => {
    const industries = new Set<string>();
    allContacts.forEach(c => { if (c.industry) industries.add(c.industry); });
    return Array.from(industries).sort();
  }, [allContacts]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (industryFilter !== "all") count++;
    if (stateFilter !== "all") count++;
    if (employeeSizeFilter !== "all") count++;
    if (hasPhoneFilter) count++;
    if (hasEmailFilter) count++;
    if (showLostFilter) count++;
    return count;
  }, [industryFilter, stateFilter, employeeSizeFilter, hasPhoneFilter, hasEmailFilter, showLostFilter]);

  const clearAllFilters = () => {
    setSearchQuery("");
    setIndustryFilter("all");
    setStateFilter("all");
    setEmployeeSizeFilter("all");
    setHasPhoneFilter(false);
    setHasEmailFilter(false);
    setShowLostFilter(false);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Run ALL queries in parallel for speed
      const [activeResult, nullCadenceResult, notActiveResult] = await Promise.all([
        // Top table: All active cadence contacts
        insforge.database
          .from("contacts")
          .select("*")
          .eq("user_id", DEFAULT_USER_ID)
          .eq("cadence_status", "active")
          .order("next_action_date", { ascending: true, nullsFirst: true })
          .order("last_call_attempt_date", { ascending: false, nullsFirst: true })
          .order("priority_score", { ascending: false }),

        // Bottom table query 1: Contacts with NULL cadence_status
        insforge.database
          .from("contacts")
          .select("*")
          .eq("user_id", DEFAULT_USER_ID)
          .eq("status", "active")
          .is("cadence_status", null),

        // Bottom table query 2: Contacts with cadence_status not equal to "active"
        insforge.database
          .from("contacts")
          .select("*")
          .eq("user_id", DEFAULT_USER_ID)
          .eq("status", "active")
          .neq("cadence_status", "active"),
      ]);

      setActiveCadenceContacts((activeResult.data as Contact[]) || []);

      if (nullCadenceResult.error) {
        console.error("Error loading NULL cadence contacts:", nullCadenceResult.error);
      }
      if (notActiveResult.error) {
        console.error("Error loading non-active cadence contacts:", notActiveResult.error);
      }

      // Combine bottom table results
      const combinedData = [
        ...(nullCadenceResult.data || []),
        ...(notActiveResult.data || []),
      ];

      // Remove duplicates
      const uniqueContacts = Array.from(
        new Map(combinedData.map(c => [c.id, c])).values()
      );

      // Terminal outcomes that should be hidden from the work queue by default
      const terminalOutcomes = new Set(["won", "lost", "wrong_number", "meeting_scheduled"]);

      // Filter out contacts that have been fully processed
      let filteredData = uniqueContacts.filter(c => {
        // Always exclude wrong number contacts
        if (c.wrong_number_flag) return false;

        // Exclude terminal outcomes unless showLostFilter is on
        if (!showLostFilter && c.cadence_outcome && terminalOutcomes.has(c.cadence_outcome)) {
          return false;
        }

        return true;
      });

      // Sort by industry and employee_count
      filteredData.sort((a, b) => {
        const industryA = a.industry || "";
        const industryB = b.industry || "";
        if (industryA !== industryB) return industryA.localeCompare(industryB);
        return (b.employee_count || 0) - (a.employee_count || 0);
      });

      setAllContacts(filteredData as Contact[]);
    } catch (error) {
      console.error("Error loading contacts:", error);
      toast.error("Failed to load contacts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [showLostFilter]);

  // Filter bottom table
  const filteredAllContacts = useMemo(() => {
    let filtered = allContacts;

    // Text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.first_name?.toLowerCase().includes(query) ||
          c.last_name?.toLowerCase().includes(query) ||
          c.company_name?.toLowerCase().includes(query) ||
          c.email?.toLowerCase().includes(query) ||
          c.title?.toLowerCase().includes(query) ||
          c.state?.toLowerCase().includes(query) ||
          c.city?.toLowerCase().includes(query)
      );
    }

    // Industry filter (supports comma-separated multi-industry values like "hvac, plumbing")
    if (industryFilter !== "all") {
      filtered = filtered.filter((c) => 
        c.industry?.toLowerCase().includes(industryFilter.toLowerCase())
      );
    }

    // State filter
    if (stateFilter !== "all") {
      filtered = filtered.filter((c) => c.state === stateFilter);
    }

    // Employee size filter
    if (employeeSizeFilter !== "all") {
      const range = EMPLOYEE_RANGES.find(r => r.value === employeeSizeFilter);
      if (range && range.min !== undefined) {
        filtered = filtered.filter((c) => {
          const count = c.employee_count;
          if (!count) return false;
          return count >= range.min! && count <= range.max!;
        });
      }
    }

    // Has phone filter
    if (hasPhoneFilter) {
      filtered = filtered.filter((c) => !!(c.phone || c.mobile));
    }

    // Has email filter
    if (hasEmailFilter) {
      filtered = filtered.filter((c) => !!c.email);
    }

    return filtered;
  }, [allContacts, searchQuery, industryFilter, stateFilter, employeeSizeFilter, hasPhoneFilter, hasEmailFilter]);

  // Filter cadence contacts by search
  const filteredCadenceContacts = useMemo(() => {
    if (!cadenceSearchQuery) return activeCadenceContacts;
    const q = cadenceSearchQuery.toLowerCase();
    return activeCadenceContacts.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.state?.toLowerCase().includes(q)
    );
  }, [activeCadenceContacts, cadenceSearchQuery]);

  const visibleCadenceContacts = useMemo(
    () => filteredCadenceContacts.slice(0, visibleCadenceRows),
    [filteredCadenceContacts, visibleCadenceRows]
  );

  const visibleAllContacts = useMemo(
    () => filteredAllContacts.slice(0, visibleAllRows),
    [filteredAllContacts, visibleAllRows]
  );

  // Reset visible rows when search changes so results aren't hidden
  useEffect(() => {
    setVisibleAllRows(INITIAL_TABLE_ROWS);
  }, [searchQuery]);

  useEffect(() => {
    setVisibleCadenceRows(INITIAL_TABLE_ROWS);
  }, [cadenceSearchQuery]);

  const handleStartCadence = async () => {
    if (selectedContacts.size === 0) {
      toast.error("Select contacts first");
      return;
    }

    setIsStartingCadence(true);
    try {
      const response = await fetch("/api/contacts/start-cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: Array.from(selectedContacts),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to start cadence");
      }

      // Show detailed stats
      if (data.stats) {
        const { started, emailsSent, errors, total } = data.stats;
        if (errors > 0) {
          // Show error details if available
          const errorMessage = data.errorDetails && data.errorDetails.length > 0
            ? `${data.message}\n\nErrors:\n${data.errorDetails.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')}`
            : data.message;
          
          toast.error(errorMessage, {
            duration: 10000, // Show longer for errors
          });
        } else if (emailsSent === 0 && started > 0) {
          toast.warning(
            `Started ${started}/${total} contact${started !== 1 ? 's' : ''}, but no emails were sent. Check Resend configuration.`
          );
        } else {
          toast.success(data.message);
        }
      } else {
        toast.success(data.message);
      }

      setSelectedContacts(new Set());
      setShowStartCadenceDialog(false);
      await loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to start cadence");
    } finally {
      setIsStartingCadence(false);
    }
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const allIds = visibleAllContacts.map((c) => c.id);
    const allSelected = allIds.every((id) => selectedContacts.has(id));

    if (allSelected) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(allIds));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Work Queue" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Top Table: Active Cadence Contacts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              Active Cadence - To Call
            </CardTitle>
            <CardDescription>
              Contacts in active cadence that need to be called ({filteredCadenceContacts.length}{cadenceSearchQuery ? ` of ${activeCadenceContacts.length}` : ""})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Cadence search */}
            {activeCadenceContacts.length > 0 && (
              <div className="relative max-w-md mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cadence contacts..."
                  value={cadenceSearchQuery}
                  onChange={(e) => setCadenceSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : filteredCadenceContacts.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Last Attempt</TableHead>
                      <TableHead>Step</TableHead>
                      <TableHead>Next Action</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleCadenceContacts.map((contact) => {
                      const phone = getValidPhone(contact.phone, contact.mobile);
                      return (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {contact.first_name} {contact.last_name}
                              {contact.wrong_number_flag && (
                                <WrongNumberFlag wrongNumberPhone={contact.wrong_number_phone} />
                              )}
                            </div>
                            {contact.title && (
                              <p className="text-sm text-muted-foreground">{contact.title}</p>
                            )}
                          </TableCell>
                          <TableCell>{contact.company_name}</TableCell>
                          <TableCell>
                            {phone ? (
                              <span className="font-mono text-sm">{phone}</span>
                            ) : (
                              <span className="text-muted-foreground">No phone</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.last_call_attempt_date && (
                              <DaysAgoBadge lastCallAttemptDate={contact.last_call_attempt_date} />
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.cadence_step !== null
                              ? STEP_NAMES[contact.cadence_step] || `Step ${contact.cadence_step}`
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {contact.next_action_type && (
                              <Badge
                                variant={contact.next_action_type === "email" ? "default" : "secondary"}
                                className={contact.next_action_type === "email" ? "bg-blue-500" : "bg-orange-500"}
                              >
                                {contact.next_action_type === "email" ? "Email" : "Call"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={contact.priority_score >= 70 ? "default" : "secondary"}>
                              {contact.priority_score || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/dialer?contact=${contact.id}`)}
                            >
                              <Phone className="h-4 w-4 mr-1" />
                              Call
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {filteredCadenceContacts.length > INITIAL_TABLE_ROWS && (
                  <div className="flex justify-center gap-2 pt-4">
                    {visibleCadenceRows < filteredCadenceContacts.length ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCadenceRows(filteredCadenceContacts.length)}
                      >
                        Show all ({filteredCadenceContacts.length - visibleCadenceRows} more)
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVisibleCadenceRows(INITIAL_TABLE_ROWS)}
                      >
                        Show less
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No active cadence contacts. Start a cadence from the bottom table.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom Table: All Contacts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Contacts
                </CardTitle>
                <CardDescription>
                  Select contacts and start cadence to move them to the top table ({filteredAllContacts.length} contacts)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllVisible}
                  disabled={visibleAllContacts.length === 0}
                >
                  {visibleAllContacts.length > 0 &&
                  visibleAllContacts.every((c) => selectedContacts.has(c.id))
                    ? "Deselect All"
                    : "Select All"}
                </Button>
                <Button
                  onClick={() => setShowStartCadenceDialog(true)}
                  disabled={selectedContacts.size === 0}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Cadence ({selectedContacts.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="space-y-3 mb-4">
              {/* Row 1: Search + Filter button */}
              <div className="flex gap-3 items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, company, title, city, state..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <SlidersHorizontal className="h-4 w-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Filters</h4>
                        {activeFilterCount > 0 && (
                          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
                            Clear all
                          </Button>
                        )}
                      </div>

                      {/* State */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" /> State / Region
                        </Label>
                        <Select value={stateFilter} onValueChange={setStateFilter}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="All States" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            <SelectItem value="all">All States</SelectItem>
                            {uniqueStates.map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Industry */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <Building2 className="h-3 w-3" /> Industry
                        </Label>
                        <Select value={industryFilter} onValueChange={setIndustryFilter}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="All Industries" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            <SelectItem value="all">All Industries</SelectItem>
                            {uniqueIndustries.map(i => (
                              <SelectItem key={i} value={i}>{i}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Employee count */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium flex items-center gap-1.5">
                          <Users className="h-3 w-3" /> Employee Count
                        </Label>
                        <Select value={employeeSizeFilter} onValueChange={setEmployeeSizeFilter}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Any Size" />
                          </SelectTrigger>
                          <SelectContent>
                            {EMPLOYEE_RANGES.map(r => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Quick toggles */}
                      <div className="space-y-2 pt-1 border-t">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="hasPhone"
                            checked={hasPhoneFilter}
                            onCheckedChange={(v) => setHasPhoneFilter(!!v)}
                          />
                          <Label htmlFor="hasPhone" className="text-xs cursor-pointer flex items-center gap-1.5">
                            <Phone className="h-3 w-3" /> Has phone number
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="hasEmail"
                            checked={hasEmailFilter}
                            onCheckedChange={(v) => setHasEmailFilter(!!v)}
                          />
                          <Label htmlFor="hasEmail" className="text-xs cursor-pointer flex items-center gap-1.5">
                            <Mail className="h-3 w-3" /> Has email
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="showLost"
                            checked={showLostFilter}
                            onCheckedChange={(v) => setShowLostFilter(!!v)}
                          />
                          <Label htmlFor="showLost" className="text-xs cursor-pointer">
                            Include lost contacts
                          </Label>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
                    <X className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>

              {/* Active filter badges */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {stateFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                      <MapPin className="h-3 w-3" /> {stateFilter}
                      <button onClick={() => setStateFilter("all")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {industryFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                      <Building2 className="h-3 w-3" /> {industryFilter}
                      <button onClick={() => setIndustryFilter("all")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {employeeSizeFilter !== "all" && (
                    <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                      <Users className="h-3 w-3" /> {EMPLOYEE_RANGES.find(r => r.value === employeeSizeFilter)?.label}
                      <button onClick={() => setEmployeeSizeFilter("all")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {hasPhoneFilter && (
                    <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                      <Phone className="h-3 w-3" /> Has phone
                      <button onClick={() => setHasPhoneFilter(false)} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {hasEmailFilter && (
                    <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                      <Mail className="h-3 w-3" /> Has email
                      <button onClick={() => setHasEmailFilter(false)} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {showLostFilter && (
                    <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                      Including lost
                      <button onClick={() => setShowLostFilter(false)} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : filteredAllContacts.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={visibleAllContacts.length > 0 && visibleAllContacts.every((c) => selectedContacts.has(c.id))}
                          onCheckedChange={selectAllVisible}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAllContacts.map((contact) => {
                      const phone = getValidPhone(contact.phone, contact.mobile);
                      return (
                        <TableRow key={contact.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedContacts.has(contact.id)}
                              onCheckedChange={() => toggleContactSelection(contact.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {contact.first_name} {contact.last_name}
                            {contact.title && (
                              <p className="text-sm text-muted-foreground">{contact.title}</p>
                            )}
                          </TableCell>
                          <TableCell>{contact.company_name}</TableCell>
                          <TableCell>
                            {contact.industry && (
                              <Badge variant="outline">{contact.industry}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.state ? (
                              <span className="text-sm">{contact.state}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.employee_count ? (
                              <span>{contact.employee_count} employees</span>
                            ) : contact.employee_range ? (
                              <span>{contact.employee_range}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {phone ? (
                              <span className="font-mono text-sm">{phone}</span>
                            ) : (
                              <span className="text-muted-foreground">No phone</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={contact.priority_score >= 70 ? "default" : "secondary"}>
                              {contact.priority_score || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {phone && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/dialer?contact=${contact.id}`)}
                              >
                                <Phone className="h-4 w-4 mr-1" />
                                Call
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

              {filteredAllContacts.length > INITIAL_TABLE_ROWS && (
                <div className="flex justify-center gap-2 pt-4">
                  {visibleAllRows < filteredAllContacts.length ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleAllRows(filteredAllContacts.length)}
                    >
                      Show all ({filteredAllContacts.length - visibleAllRows} more)
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleAllRows(INITIAL_TABLE_ROWS)}
                    >
                      Show less
                    </Button>
                  )}
                </div>
              )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No contacts found. {searchQuery && "Try adjusting your search."}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Start Cadence Dialog */}
        <AlertDialog open={showStartCadenceDialog} onOpenChange={setShowStartCadenceDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Sales Cadence</AlertDialogTitle>
              <AlertDialogDescription>
                This will start the cadence for {selectedContacts.size} contact
                {selectedContacts.size !== 1 ? "s" : ""}. They will be moved to the active cadence
                table and emails will be sent via Resend.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleStartCadence} disabled={isStartingCadence}>
                {isStartingCadence && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Cadence
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
