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
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
  ArrowRight,
  Filter,
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

const INDUSTRIES = [
  { value: "all", label: "All Industries" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "solar", label: "Solar" },
  { value: "construction", label: "General Contractors" },
];

export default function WorkQueuePage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [activeCadenceContacts, setActiveCadenceContacts] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isStartingCadence, setIsStartingCadence] = useState(false);
  const [showStartCadenceDialog, setShowStartCadenceDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [showLostFilter, setShowLostFilter] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      // Top table: Active cadence contacts (to call)
      // Show contacts that are in active cadence AND (have call action due OR have been called before)
      const { data: activeData } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .eq("cadence_status", "active")
        .or(`next_action_type.eq.call,last_call_attempt_date.not.is.null`)
        .order("next_action_date", { ascending: true, nullsFirst: true })
        .order("last_call_attempt_date", { ascending: false, nullsFirst: true })
        .order("priority_score", { ascending: false });

      setActiveCadenceContacts((activeData as Contact[]) || []);

      // Bottom table: All other contacts (not in active cadence)
      let bottomQuery = supabase
        .from("contacts")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .or("cadence_status.is.null,cadence_status.eq.none,cadence_status.eq.completed");

      if (!showLostFilter) {
        bottomQuery = bottomQuery.neq("cadence_outcome", "lost");
      }

      const { data: bottomData } = await bottomQuery
        .order("industry", { ascending: true, nullsFirst: true })
        .order("employee_count", { ascending: false, nullsFirst: true });

      setAllContacts((bottomData as Contact[]) || []);
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

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.first_name?.toLowerCase().includes(query) ||
          c.last_name?.toLowerCase().includes(query) ||
          c.company_name?.toLowerCase().includes(query) ||
          c.email?.toLowerCase().includes(query)
      );
    }

    if (industryFilter !== "all") {
      filtered = filtered.filter((c) => c.industry === industryFilter);
    }

    return filtered;
  }, [allContacts, searchQuery, industryFilter]);

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
      if (!response.ok) throw new Error(data.error);

      toast.success(data.message);
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
    const allIds = filteredAllContacts.map((c) => c.id);
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
              Contacts in active cadence that need to be called ({activeCadenceContacts.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : activeCadenceContacts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Last Attempt</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeCadenceContacts.map((contact) => {
                    const phone = getValidPhone(contact);
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
                  disabled={filteredAllContacts.length === 0}
                >
                  {filteredAllContacts.every((c) => selectedContacts.has(c.id))
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
            <div className="flex gap-4 mb-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind.value} value={ind.value}>
                      {ind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLostFilter(!showLostFilter)}
              >
                <Filter className="h-4 w-4 mr-2" />
                {showLostFilter ? "Hide Lost" : "Show Lost"}
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : filteredAllContacts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={filteredAllContacts.every((c) => selectedContacts.has(c.id))}
                        onCheckedChange={selectAllVisible}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAllContacts.map((contact) => {
                    const phone = getValidPhone(contact);
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
                table and emails will be sent slowly via Instantly.
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
