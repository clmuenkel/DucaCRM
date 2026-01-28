"use client";

import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Search,
  Users,
  Phone,
  Mail,
  Loader2,
  CheckCircle2,
  Play,
  Pause,
  ListTodo,
  Sparkles,
  Building2,
  ArrowUpDown,
  Zap,
  RefreshCw,
  User,
  Crown,
  Briefcase,
  MapPin,
  Globe,
  MoreVertical,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

// Industries for filtering
const INDUSTRIES = [
  { value: "all", label: "All Industries" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "solar", label: "Solar" },
  { value: "construction", label: "General Contractors" },
];

const CADENCE_STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "none", label: "Not Started" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

interface Contact {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  title: string | null;
  company_name: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  stage: string;
  source: string | null;
  priority_score: number;
  cadence_status: string;
  cadence_started_at: string | null;
  last_contacted_at: string | null;
  last_email_sent_at: string | null;
  total_calls: number;
  total_emails: number;
  employee_count: number | null;
  employee_range: string | null;
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  employeeCount: number | null;
  employeeRange: string | null;
  contacts: Contact[];
}

export default function WorkQueuePage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [industryFilter, setIndustryFilter] = useState("all");
  const [cadenceFilter, setCadenceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isStartingCadence, setIsStartingCadence] = useState(false);
  const [isCalculatingPriority, setIsCalculatingPriority] = useState(false);
  const [showStartCadenceDialog, setShowStartCadenceDialog] = useState(false);
  const [expandedCompanies, setExpandedCompanies] = useState<string[]>([]);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    companies: 0,
    active: 0,
    notStarted: 0,
    avgPriority: 0,
  });

  // Group contacts by company
  const companiesWithContacts = useMemo(() => {
    const grouped = new Map<string, Contact[]>();
    
    for (const contact of contacts) {
      const key = contact.company_id || contact.company_name || contact.id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(contact);
    }
    
    return Array.from(grouped.entries())
      .map(([companyId, contacts]): CompanyGroup => ({
        companyId,
        companyName: contacts[0]?.company_name || "Unknown Company",
        industry: contacts[0]?.industry || null,
        city: contacts[0]?.city || null,
        state: contacts[0]?.state || null,
        employeeCount: contacts[0]?.employee_count || null,
        employeeRange: contacts[0]?.employee_range || null,
        contacts: contacts.sort((a, b) => 
          (b.priority_score || 0) - (a.priority_score || 0)
        ),
      }))
      .sort((a, b) => 
        (b.contacts[0]?.priority_score || 0) - (a.contacts[0]?.priority_score || 0)
      );
  }, [contacts]);

  // Filter companies based on search
  const filteredCompanies = useMemo(() => {
    if (!searchQuery) return companiesWithContacts;
    
    const query = searchQuery.toLowerCase();
    return companiesWithContacts.filter(company => {
      if (company.companyName.toLowerCase().includes(query)) return true;
      return company.contacts.some(c => 
        c.first_name?.toLowerCase().includes(query) ||
        c.last_name?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
      );
    });
  }, [companiesWithContacts, searchQuery]);

  const loadContacts = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (industryFilter !== "all") params.set("industry", industryFilter);
      if (cadenceFilter !== "all") params.set("cadence_status", cadenceFilter);
      params.set("order_by", "priority_score");
      params.set("limit", "500");

      const response = await fetch(`/api/contacts/queue?${params}`);
      const data = await response.json();

      if (data.contacts) {
        setContacts(data.contacts);
        
        const total = data.counts?.totalLeads ?? data.contacts.length;
        const active = data.contacts.filter((c: Contact) => c.cadence_status === "active").length;
        const notStarted = data.counts?.toBework ?? data.contacts.filter((c: Contact) => c.cadence_status === "none").length;
        const avgPriority = total > 0 
          ? Math.round(data.contacts.reduce((sum: number, c: Contact) => sum + (c.priority_score || 0), 0) / total)
          : 0;

        const uniqueCompanies = new Set(data.contacts.map((c: Contact) => c.company_id || c.company_name)).size;

        setStats({ total, companies: uniqueCompanies, active, notStarted, avgPriority });
      }
    } catch (error) {
      console.error("Error loading contacts:", error);
      toast.error("Failed to load contacts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [industryFilter, cadenceFilter]);

  const handleCalculatePriority = async () => {
    setIsCalculatingPriority(true);
    try {
      const response = await fetch("/api/contacts/calculate-priority", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success(data.message);
      await loadContacts();
    } catch (error: any) {
      toast.error(error.message || "Failed to calculate priorities");
    } finally {
      setIsCalculatingPriority(false);
    }
  };

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
      await loadContacts();
    } catch (error: any) {
      toast.error(error.message || "Failed to start cadence");
    } finally {
      setIsStartingCadence(false);
    }
  };

  const handlePauseCadence = async (contactId: string) => {
    try {
      const response = await fetch("/api/contacts/pause-cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success("Cadence paused");
      await loadContacts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) newSet.delete(contactId);
      else newSet.add(contactId);
      return newSet;
    });
  };

  const toggleCompanySelection = (companyId: string) => {
    const company = companiesWithContacts.find(c => c.companyId === companyId);
    if (!company) return;
    
    const contactIds = company.contacts.map(c => c.id);
    const allSelected = contactIds.every(id => selectedContacts.has(id));
    
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (allSelected) contactIds.forEach(id => next.delete(id));
      else contactIds.forEach(id => next.add(id));
      return next;
    });
  };

  const isCompanySelected = (companyId: string): boolean | "indeterminate" => {
    const company = companiesWithContacts.find(c => c.companyId === companyId);
    if (!company) return false;
    
    const contactIds = company.contacts.map(c => c.id);
    const selectedCount = contactIds.filter(id => selectedContacts.has(id)).length;
    
    if (selectedCount === 0) return false;
    if (selectedCount === contactIds.length) return true;
    return "indeterminate";
  };

  const selectAllVisible = () => {
    const allContactIds = filteredCompanies.flatMap(c => c.contacts.map(contact => contact.id));
    const allSelected = allContactIds.every(id => selectedContacts.has(id));
    
    if (allSelected) setSelectedContacts(new Set());
    else setSelectedContacts(new Set(allContactIds));
  };

  const getPriorityBadge = (score: number) => {
    if (score >= 70) return { label: "High", variant: "default" as const, color: "text-green-500" };
    if (score >= 40) return { label: "Medium", variant: "secondary" as const, color: "text-yellow-500" };
    return { label: "Low", variant: "outline" as const, color: "text-red-500" };
  };

  const getCadenceBadge = (status: string) => {
    switch (status) {
      case "active": return { label: "Active", variant: "default" as const, icon: Play };
      case "paused": return { label: "Paused", variant: "secondary" as const, icon: Pause };
      case "completed": return { label: "Completed", variant: "outline" as const, icon: CheckCircle2 };
      default: return { label: "Not Started", variant: "outline" as const, icon: ListTodo };
    }
  };

  const getTitleIcon = (title: string | null, index: number) => {
    const t = (title || "").toLowerCase();
    if (t.includes("owner") || t.includes("ceo") || t.includes("president") || t.includes("founder")) {
      return <Crown className="h-4 w-4 text-yellow-500" />;
    }
    if (t.includes("director") || t.includes("vp") || t.includes("manager")) {
      return <Briefcase className="h-4 w-4 text-blue-500" />;
    }
    return <User className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col h-full bg-background/95">
      <Header title="Work Queue" />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-5">
          <Card className="bg-card shadow-sm border-none ring-1 ring-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Contacts</span>
              </div>
              <p className="text-2xl font-black">{stats.total}</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-none ring-1 ring-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Companies</span>
              </div>
              <p className="text-2xl font-black">{stats.companies}</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-none ring-1 ring-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-green-500" />
                <span className="text-xs font-medium text-muted-foreground">Active</span>
              </div>
              <p className="text-2xl font-black text-green-500">{stats.active}</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-none ring-1 ring-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <ListTodo className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-medium text-muted-foreground">To Bework</span>
              </div>
              <p className="text-2xl font-black text-yellow-500">{stats.notStarted}</p>
            </CardContent>
          </Card>

          <Card className="bg-card shadow-sm border-none ring-1 ring-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Avg Score</span>
              </div>
              <p className="text-2xl font-black">{stats.avgPriority}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="border-none shadow-sm ring-1 ring-border/50">
          <CardHeader className="pb-3 border-b border-border/30">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-black tracking-tight">
                  <Building2 className="h-5 w-5 text-primary" />
                  COMPANIES & CONTACTS
                </CardTitle>
                <CardDescription className="text-xs">
                  {filteredCompanies.length} companies • {contacts.length} total decision makers
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCalculatePriority}
                  disabled={isCalculatingPriority}
                  className="gap-2 h-9 rounded-lg font-bold"
                >
                  {isCalculatingPriority ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  RECALC
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowStartCadenceDialog(true)}
                  disabled={selectedContacts.size === 0}
                  className="gap-2 h-9 rounded-lg font-black bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Sparkles className="h-4 w-4" />
                  START CADENCE ({selectedContacts.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search company or person..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-muted/20 border-transparent focus:bg-muted/30 transition-all h-10 rounded-lg"
                />
              </div>

              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="w-[160px] h-10 rounded-lg bg-muted/20 border-transparent">
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(ind => (
                    <SelectItem key={ind.value} value={ind.value} className="font-medium">
                      {ind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={cadenceFilter} onValueChange={setCadenceFilter}>
                <SelectTrigger className="w-[160px] h-10 rounded-lg bg-muted/20 border-transparent">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_STATUSES.map(status => (
                    <SelectItem key={status.value} value={status.value} className="font-medium">
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllVisible} className="h-10 px-3 gap-2 font-bold hover:bg-muted/30">
                  <Checkbox
                    checked={filteredCompanies.length > 0 && 
                      filteredCompanies.flatMap(c => c.contacts).every(c => selectedContacts.has(c.id))}
                  />
                  SELECT ALL
                </Button>

                <Button variant="ghost" size="sm" onClick={loadContacts} className="h-10 w-10 p-0 hover:bg-muted/30">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Accordion List */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="text-center py-20 bg-muted/10 rounded-2xl border-2 border-dashed border-muted/50">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-bold">No leads found</h3>
                <p className="text-sm text-muted-foreground mt-1">Extract some fresh leads to get started.</p>
                <Link href="/leadgen">
                  <Button variant="outline" className="mt-6 font-bold rounded-lg border-primary/20 hover:bg-primary/5">
                    GO TO LEAD GEN
                  </Button>
                </Link>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-420px)] pr-4">
                <Accordion
                  type="multiple"
                  value={expandedCompanies}
                  onValueChange={setExpandedCompanies}
                  className="space-y-3"
                >
                  {filteredCompanies.map((company) => {
                    const companySelected = isCompanySelected(company.companyId);
                    const hasActiveContacts = company.contacts.some(c => c.cadence_status === "active");
                    
                    return (
                      <AccordionItem
                        key={company.companyId}
                        value={company.companyId}
                        className="border-none ring-1 ring-border/50 rounded-xl px-4 bg-card/50 overflow-hidden mb-3 last:mb-0"
                      >
                        <AccordionTrigger className="hover:no-underline py-4">
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={companySelected === true}
                                  onCheckedChange={() => toggleCompanySelection(company.companyId)}
                                  onClick={(e) => e.stopPropagation()}
                                  data-state={companySelected === "indeterminate" ? "indeterminate" : undefined}
                                  className={companySelected === "indeterminate" ? "data-[state=indeterminate]:bg-primary/50" : ""}
                                />
                                <div className="p-2.5 bg-primary/10 rounded-xl">
                                  <Building2 className="h-5 w-5 text-primary" />
                                </div>
                              </div>
                              <div className="text-left">
                                <h3 className="font-black text-base leading-tight tracking-tight">{company.companyName}</h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {company.city && company.state && (
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                                      <MapPin className="h-3 w-3" />
                                      {company.city}, {company.state}
                                    </span>
                                  )}
                                  {(company.employeeCount || company.employeeRange) && (
                                    <>
                                      <span className="text-[10px] text-muted-foreground/30">•</span>
                                      <span className="text-[11px] text-primary flex items-center gap-1 font-bold">
                                        {company.employeeCount 
                                          ? `${company.employeeCount.toLocaleString()} employees`
                                          : `${company.employeeRange} employees`}
                                      </span>
                                    </>
                                  )}
                                  <span className="text-[10px] text-muted-foreground/30">•</span>
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                                    <Users className="h-3 w-3" />
                                    {company.contacts.length} Decision Maker{company.contacts.length !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {hasActiveContacts && (
                                <Badge variant="default" className="bg-green-500/10 text-green-500 border-green-500/20 gap-1 rounded-lg px-2 py-0.5 font-bold text-[10px]">
                                  <Zap className="h-3 w-3 fill-current" />
                                  ACTIVE
                                </Badge>
                              )}
                              {company.industry && (
                                <Badge variant="secondary" className="bg-muted/50 rounded-lg text-[10px] font-bold py-0.5">{company.industry}</Badge>
                              )}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-3 pt-2">
                            <Separator className="mb-4 opacity-5" />
                            {company.contacts.map((contact, index) => {
                              const priorityBadge = getPriorityBadge(contact.priority_score || 0);
                              const cadenceBadge = getCadenceBadge(contact.cadence_status || "none");
                              const CadenceIcon = cadenceBadge.icon;

                              return (
                                <div
                                  key={contact.id}
                                  className={`group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${
                                    selectedContacts.has(contact.id) 
                                      ? "bg-primary/5 border-primary/30" 
                                      : "bg-muted/20 border-transparent hover:bg-muted/40 hover:border-muted-foreground/20"
                                  }`}
                                >
                                  <Checkbox
                                    checked={selectedContacts.has(contact.id)}
                                    onCheckedChange={() => toggleContactSelection(contact.id)}
                                  />
                                  
                                  {/* Rank indicator */}
                                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background border-none ring-1 ring-border/50 text-[11px] font-black text-muted-foreground shadow-sm shrink-0">
                                    #{index + 1}
                                  </div>

                                  {/* Contact info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-black text-base truncate tracking-tight">
                                        {contact.first_name} {contact.last_name}
                                      </span>
                                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-primary/10 text-[9px] font-black text-primary border border-primary/20">
                                        SCORE {contact.priority_score || 0}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 font-bold uppercase tracking-wider">
                                      {getTitleIcon(contact.title, index)}
                                      <span className="truncate">{contact.title || "Decision Maker"}</span>
                                    </div>
                                  </div>

                                  {/* Contact methods */}
                                  <div className="flex flex-col gap-2 min-w-[200px]">
                                    {contact.email && (
                                      <div className="flex items-center gap-2 text-[11px] group/item cursor-pointer">
                                        <div className="p-1 rounded bg-background ring-1 ring-border/50">
                                          <Mail className="h-3 w-3 text-muted-foreground group-hover/item:text-primary transition-colors" />
                                        </div>
                                        <span className="font-mono truncate max-w-[160px] group-hover/item:text-primary transition-colors font-medium">
                                          {contact.email}
                                        </span>
                                      </div>
                                    )}
                                    {contact.mobile && (
                                      <div className="flex items-center gap-2 text-[11px] group/item cursor-pointer">
                                        <div className="p-1 rounded bg-background ring-1 ring-green-500/30">
                                          <Phone className="h-3 w-3 text-green-500 group-hover/item:text-green-400 transition-colors" />
                                        </div>
                                        <span className="font-mono group-hover/item:text-primary transition-colors font-medium">
                                          {contact.mobile}
                                        </span>
                                        <Badge variant="outline" className="text-[8px] h-4 px-1 py-0 border-green-500/30 text-green-500 uppercase font-black rounded-sm">
                                          Mobile
                                        </Badge>
                                      </div>
                                    )}
                                    {contact.phone && (
                                      <div className="flex items-center gap-2 text-[11px] group/item cursor-pointer">
                                        <div className="p-1 rounded bg-background ring-1 ring-blue-500/30">
                                          <Phone className="h-3 w-3 text-blue-500 group-hover/item:text-blue-400 transition-colors" />
                                        </div>
                                        <span className="font-mono group-hover/item:text-primary transition-colors font-medium">
                                          {contact.phone}
                                        </span>
                                        <Badge variant="outline" className="text-[8px] h-4 px-1 py-0 border-blue-500/30 text-blue-500 uppercase font-black rounded-sm">
                                          Office
                                        </Badge>
                                      </div>
                                    )}
                                    {!contact.mobile && !contact.phone && (
                                      <span className="text-[11px] text-muted-foreground">No phone</span>
                                    )}
                                  </div>

                                  {/* Cadence status */}
                                  <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-end gap-1">
                                      <Badge variant={cadenceBadge.variant} className="gap-1 px-2 py-0.5 font-black uppercase text-[9px] rounded-lg">
                                        <CadenceIcon className="h-3 w-3" />
                                        {cadenceBadge.label}
                                      </Badge>
                                      {contact.last_contacted_at && (
                                        <span className="text-[10px] text-muted-foreground font-bold">
                                          {formatDistanceToNow(new Date(contact.last_contacted_at), { addSuffix: true })}
                                        </span>
                                      )}
                                    </div>
                                    {contact.cadence_status === "active" && (
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 rounded-xl bg-background border-none ring-1 ring-red-500/20 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handlePauseCadence(contact.id);
                                        }}
                                        title="Pause Cadence"
                                      >
                                        <Pause className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Start Cadence Dialog */}
        <AlertDialog open={showStartCadenceDialog} onOpenChange={setShowStartCadenceDialog}>
          <AlertDialogContent className="rounded-2xl border-none shadow-2xl p-8">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-3 text-xl font-black tracking-tight">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                START SALES CADENCE
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base font-medium leading-relaxed pt-2">
                This will activate outreach for <span className="text-primary font-black underline underline-offset-4">{selectedContacts.size} decision makers</span>:
                <ul className="list-disc list-inside mt-4 space-y-3 pl-2">
                  <li className="text-foreground/80">Push to Instantly for <span className="font-bold">automated emails</span></li>
                  <li className="text-foreground/80">Add to Power Dialer for <span className="font-bold">outbound calling</span></li>
                  <li className="text-foreground/80">Track all interactions <span className="font-bold">automatically</span></li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-8 gap-3">
              <AlertDialogCancel className="rounded-xl border-none bg-muted/30 font-bold h-12">CANCEL</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleStartCadence}
                disabled={isStartingCadence}
                className="rounded-xl bg-primary text-primary-foreground font-black h-12 px-8 hover:bg-primary/90"
              >
                {isStartingCadence && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                START NOW
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
