"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import {
  Phone,
  Mail,
  Calendar,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
  PhoneOff,
  RefreshCw,
  Play,
  Loader2,
  ExternalLink,
  Building2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface ContactWithCadence {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company_name: string | null;
  title: string | null;
  industry: string | null;
  cadence_step: number | null;
  cadence_outcome: string | null;
  next_action_date: string | null;
  next_action_type: string | null;
  email_opened: boolean | null;
  email_replied: boolean | null;
  email_open_count: number | null;
  call_attempts: number | null;
  priority_score: number | null;
}

// Cadence step names
const STEP_NAMES: Record<number, string> = {
  0: "Email 1",
  1: "Call 1",
  2: "Email 2",
  3: "Call 2",
  4: "Email 3",
  5: "Call 3",
};

export default function TodayPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStartingCadence, setIsStartingCadence] = useState(false);

  // Contact lists
  const [callsDue, setCallsDue] = useState<ContactWithCadence[]>([]);
  const [hotLeads, setHotLeads] = useState<ContactWithCadence[]>([]);
  const [newContacts, setNewContacts] = useState<ContactWithCadence[]>([]);
  const [selectedNewContacts, setSelectedNewContacts] = useState<Set<string>>(new Set());

  // Stats
  const [stats, setStats] = useState({
    totalActive: 0,
    callsDueToday: 0,
    emailsDueToday: 0,
    hotLeads: 0,
    readyToStart: 0,
  });

  const supabase = createClient();

  const loadTodayData = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Get calls due today (contacts with next_action = call and date <= today)
      const { data: callsData } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .eq("cadence_status", "active")
        .eq("cadence_outcome", "in_progress")
        .eq("next_action_type", "call")
        .lte("next_action_date", today)
        .order("priority_score", { ascending: false });

      setCallsDue((callsData as unknown as ContactWithCadence[]) || []);

      // 2. Get hot leads (opened email but not replied)
      const { data: hotData } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .eq("cadence_status", "active")
        .eq("email_opened", true)
        .eq("email_replied", false)
        .order("email_open_count", { ascending: false });

      setHotLeads((hotData as unknown as ContactWithCadence[]) || []);

      // 3. Get new contacts ready to start cadence
      const { data: newData } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .or("cadence_status.is.null,cadence_status.eq.none")
        .not("email", "is", null)
        .order("priority_score", { ascending: false })
        .limit(50);

      setNewContacts((newData as unknown as ContactWithCadence[]) || []);

      // 4. Calculate stats
      const { count: totalActive } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", DEFAULT_USER_ID)
        .eq("cadence_status", "active");

      const { count: emailsDue } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", DEFAULT_USER_ID)
        .eq("cadence_status", "active")
        .eq("next_action_type", "email")
        .lte("next_action_date", today);

      setStats({
        totalActive: totalActive || 0,
        callsDueToday: (callsData as unknown as ContactWithCadence[])?.length || 0,
        emailsDueToday: emailsDue || 0,
        hotLeads: (hotData as unknown as ContactWithCadence[])?.length || 0,
        readyToStart: (newData as unknown as ContactWithCadence[])?.length || 0,
      });
    } catch (error: any) {
      toast.error("Failed to load today's data");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTodayData();
  }, []);

  const handleSyncEmails = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/instantly/sync", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Sync failed");
      }

      toast.success(data.message);
      loadTodayData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStartCadence = async () => {
    if (selectedNewContacts.size === 0) {
      toast.error("Select contacts to start cadence");
      return;
    }

    setIsStartingCadence(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const contactIds = Array.from(selectedNewContacts);

      // Start cadence for each contact
      for (const id of contactIds) {
        await supabase
          .from("contacts")
          .update({
            cadence_status: "active",
            cadence_step: 0,
            cadence_day_started: today,
            cadence_outcome: "in_progress",
            next_action_date: today,
            next_action_type: "email",
            email_opened: false,
            email_replied: false,
            call_attempts: 0,
          })
          .eq("id", id);
      }

      // Push to Instantly (if configured)
      const { data: settings } = await supabase
        .from("cadence_settings")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .single();

      if ((settings as any)?.instantly_api_key && (settings as any)?.instantly_campaign_id) {
        // Get contact details to push to Instantly
        const { data: contactsToAdd } = await supabase
          .from("contacts")
          .select("email, first_name, last_name, company_name, title, industry, city")
          .in("id", contactIds);

        if (contactsToAdd && contactsToAdd.length > 0) {
          try {
            const response = await fetch("/api/instantly/push", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contacts: contactsToAdd }),
            });
            
            if (response.ok) {
              toast.success(`Started cadence for ${contactIds.length} contacts (pushed to Instantly)`);
            }
          } catch {
            // Continue even if Instantly push fails
          }
        }
      }

      toast.success(`Started cadence for ${contactIds.length} contacts`);
      setSelectedNewContacts(new Set());
      loadTodayData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsStartingCadence(false);
    }
  };

  const handleOutcome = async (
    contactId: string,
    outcome: "won" | "lost" | "no_answer" | "callback",
    callbackDate?: string
  ) => {
    try {
      const response = await fetch("/api/contacts/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, outcome, callbackDate }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process outcome");
      }

      toast.success(data.message);
      loadTodayData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const goToDialer = () => {
    router.push("/dialer");
  };

  const toggleNewContact = (id: string) => {
    const newSet = new Set(selectedNewContacts);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedNewContacts(newSet);
  };

  const selectAllNew = () => {
    if (selectedNewContacts.size === newContacts.length) {
      setSelectedNewContacts(new Set());
    } else {
      setSelectedNewContacts(new Set(newContacts.map(c => c.id)));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Today" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Today" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Play className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Cadences</p>
                  <p className="text-2xl font-bold">{stats.totalActive}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={stats.callsDueToday > 0 ? "border-blue-500/50" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Phone className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Calls Due Today</p>
                  <p className="text-2xl font-bold text-blue-500">{stats.callsDueToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Mail className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Emails Due</p>
                  <p className="text-2xl font-bold">{stats.emailsDueToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={stats.hotLeads > 0 ? "border-orange-500/50" : ""}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Flame className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hot Leads</p>
                  <p className="text-2xl font-bold text-orange-500">{stats.hotLeads}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ready to Start</p>
                  <p className="text-2xl font-bold">{stats.readyToStart}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={goToDialer} className="gap-2" disabled={stats.callsDueToday === 0}>
            <Phone className="h-4 w-4" />
            Start Calling ({stats.callsDueToday})
          </Button>
          <Button variant="outline" onClick={handleSyncEmails} disabled={isSyncing} className="gap-2">
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync Email Activity
          </Button>
        </div>

        {/* Hot Leads Section */}
        {hotLeads.length > 0 && (
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-500">
                <Flame className="h-5 w-5" />
                Hot Leads - Opened Email
              </CardTitle>
              <CardDescription>
                These contacts opened your email but haven't replied. Call them first!
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Opens</TableHead>
                      <TableHead>Step</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hotLeads.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">
                          {contact.first_name} {contact.last_name}
                          <p className="text-xs text-muted-foreground">{contact.title}</p>
                        </TableCell>
                        <TableCell>{contact.company_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-500">
                            {contact.email_open_count}x opened
                          </Badge>
                        </TableCell>
                        <TableCell>{contact.cadence_step !== null ? STEP_NAMES[contact.cadence_step] : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => {
                              router.push(`/dialer?contact=${contact.id}`);
                            }}
                            className="gap-1"
                          >
                            <Phone className="h-3 w-3" />
                            Call
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Calls Due Today */}
        <Card className={stats.callsDueToday > 0 ? "border-blue-500/30" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-blue-500" />
              Calls Due Today
            </CardTitle>
            <CardDescription>
              {callsDue.length === 0
                ? "No calls scheduled for today"
                : `${callsDue.length} contacts ready to call`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {callsDue.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>All caught up! No calls due today.</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Step</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead className="text-right">Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callsDue.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {contact.email_opened && (
                              <Flame className="h-4 w-4 text-orange-500" />
                            )}
                            {contact.first_name} {contact.last_name}
                          </div>
                          <p className="text-xs text-muted-foreground">{contact.title}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {contact.company_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <a
                            href={`tel:${contact.phone || contact.mobile}`}
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            {contact.phone || contact.mobile}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{contact.cadence_step !== null ? STEP_NAMES[contact.cadence_step] : "—"}</Badge>
                        </TableCell>
                        <TableCell>{contact.call_attempts || 0}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleOutcome(contact.id, "won")}
                              className="h-7 px-2 bg-green-600 hover:bg-green-700"
                              title="Won - Meeting Booked"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOutcome(contact.id, "no_answer")}
                              className="h-7 px-2"
                              title="No Answer"
                            >
                              <PhoneOff className="h-3 w-3" />
                            </Button>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 border-yellow-500 text-yellow-500"
                                  title="Callback"
                                >
                                  <Calendar className="h-3 w-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-3">
                                <div className="space-y-2">
                                  <Label>Callback Date</Label>
                                  <Input
                                    type="date"
                                    min={new Date().toISOString().split("T")[0]}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleOutcome(contact.id, "callback", e.target.value);
                                      }
                                    }}
                                  />
                                </div>
                              </PopoverContent>
                            </Popover>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOutcome(contact.id, "lost")}
                              className="h-7 px-2 border-red-500 text-red-500"
                              title="Lost"
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* New Contacts to Start */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Ready to Start Cadence
            </CardTitle>
            <CardDescription>
              Contacts imported but not yet in a cadence. Select and start to begin outreach.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {newContacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No new contacts to start. Import more leads!</p>
                <Button variant="link" onClick={() => router.push("/leadgen")}>
                  Go to Lead Gen <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllNew}
                  >
                    {selectedNewContacts.size === newContacts.length ? "Deselect All" : "Select All"}
                  </Button>
                  <Button
                    onClick={handleStartCadence}
                    disabled={selectedNewContacts.size === 0 || isStartingCadence}
                    className="gap-2"
                  >
                    {isStartingCadence ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Start Cadence ({selectedNewContacts.size})
                  </Button>
                </div>
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedNewContacts.size === newContacts.length && newContacts.length > 0}
                            onCheckedChange={selectAllNew}
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Industry</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newContacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedNewContacts.has(contact.id)}
                              onCheckedChange={() => toggleNewContact(contact.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {contact.first_name} {contact.last_name}
                            <p className="text-xs text-muted-foreground">{contact.title}</p>
                          </TableCell>
                          <TableCell>{contact.company_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{contact.industry || "—"}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {contact.email || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {contact.phone || contact.mobile || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={contact.priority_score >= 70 ? "default" : "secondary"}
                            >
                              {contact.priority_score || 0}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
