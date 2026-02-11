"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useDialerStore } from "@/stores/dialer-store";
import { useCallTimer } from "@/hooks/use-call-timer";
import { useContacts } from "@/hooks/use-contacts";
import { useCompanyColleagues } from "@/hooks/use-companies";
import { useDialerAutosave, useHydrateDraft } from "@/hooks/use-dialer-autosave";
import { CallQueue } from "./call-queue";
import { ContactPanelCompact } from "./contact-panel";
import { CallControlsHeader } from "./call-controls";
import { NotesAndTasks } from "./notes-and-tasks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Zap, Users, Save, CalendarClock, Flame, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { insforge } from "@/lib/neon/client";
import type { Contact } from "@/types/database";

type DialerMode = "cadence" | "all" | "hot";

export function PowerDialer() {
  const userId = DEFAULT_USER_ID;
  const searchParams = useSearchParams();
  const initialContactId = searchParams.get("contact");
  const [mode, setMode] = useState<DialerMode>("cadence");
  const [cadenceContacts, setCadenceContacts] = useState<Contact[]>([]);
  const [hotContacts, setHotContacts] = useState<Contact[]>([]);
  const [isLoadingCadence, setIsLoadingCadence] = useState(true);

  const {
    isActive,
    queue,
    currentContact,
    currentIndex,
    isCallActive,
    callDuration,
    timestampedNotes,
    startSession,
    addTimestampedNote,
    updateTimestampedNote,
    deleteTimestampedNote,
    goToContact,
  } = useDialerStore();

  // Fetch ALL active cadence contacts (not just calls due today)
  // Also refetch when page gains focus (e.g. user navigates back from work queue)
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    const handleFocus = () => setFetchKey(k => k + 1);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    const fetchCadenceContacts = async () => {
      setIsLoadingCadence(true);
      const today = new Date().toISOString().split("T")[0];
      const todayStartIso = `${today}T00:00:00.000Z`;
      const terminalOutcomes = new Set([
        "won",
        "lost",
        "wrong_number",
        "meeting_scheduled",
        "replied",
        "archived",
      ]);

      // Exclude contacts the user already skipped today for a true clean slate.
      const { data: skippedTodayData } = await insforge.database
        .from("calls")
        .select("contact_id")
        .eq("user_id", userId)
        .eq("outcome", "skipped")
        .gte("started_at", todayStartIso);
      const skippedTodayIds = new Set(
        ((skippedTodayData as { contact_id: string }[]) || []).map((row) => row.contact_id)
      );

      // Get ALL active cadence contacts (regardless of next_action_type)
      // Note: .or() filters can fail silently with InsForge, so we filter client-side
      const { data: cadenceData, error: cadenceError } = await insforge.database
        .from("contacts")
        .select("*")
        .eq("user_id", userId)
        .eq("cadence_status", "active")
        .order("next_action_date", { ascending: true, nullsFirst: true })
        .order("priority_score", { ascending: false });

      if (cadenceError) {
        console.error("Error fetching cadence contacts:", cadenceError);
      }

      // Client-side filter: must have at least one phone number, exclude wrong numbers,
      // and keep callback contacts out of queue until callback date is due.
      const cadenceWithPhone = ((cadenceData as Contact[]) || []).filter(
        c => {
          if (!c.phone && !c.mobile) return false;
          if (c.wrong_number_flag) return false;
          if (skippedTodayIds.has(c.id)) return false;
          if (c.cadence_outcome && terminalOutcomes.has(c.cadence_outcome)) return false;

          // Only show contacts that are actively in progress, or callbacks due now.
          if (!c.cadence_outcome || c.cadence_outcome === "in_progress") return true;

          if (c.cadence_outcome === "callback") {
            const callbackDate = (c.snooze_until || c.next_action_date || "").slice(0, 10);
            return !!callbackDate && callbackDate <= today;
          }

          return false;
        }
      );
      setCadenceContacts(cadenceWithPhone);

      // Get hot leads (opened email) — also filter client-side
      const { data: hotData } = await insforge.database
        .from("contacts")
        .select("*")
        .eq("user_id", userId)
        .eq("cadence_status", "active")
        .eq("email_opened", true)
        .eq("email_replied", false)
        .order("email_open_count", { ascending: false });

      const hotWithPhone = ((hotData as Contact[]) || []).filter(
        c => {
          if (!c.phone && !c.mobile) return false;
          if (c.wrong_number_flag) return false;
          if (skippedTodayIds.has(c.id)) return false;
          if (c.cadence_outcome && terminalOutcomes.has(c.cadence_outcome)) return false;

          if (!c.cadence_outcome || c.cadence_outcome === "in_progress") return true;

          if (c.cadence_outcome === "callback") {
            const callbackDate = (c.snooze_until || c.next_action_date || "").slice(0, 10);
            return !!callbackDate && callbackDate <= today;
          }

          return false;
        }
      );
      setHotContacts(hotWithPhone);
      setIsLoadingCadence(false);

      // If initial contact ID provided, start session with that contact
      if (initialContactId && cadenceWithPhone) {
        const targetContact = cadenceWithPhone.find((c: any) => c.id === initialContactId);
        if (targetContact) {
          startSession([targetContact as Contact]);
        }
      }
    };

    fetchCadenceContacts();
  }, [userId, initialContactId, fetchKey]);

  // Fallback: all fresh contacts
  const { data: allContacts, isLoading: isLoadingAll } = useContacts({
    stage: "fresh",
    orderBy: "priority_score",
    limit: 100,
  });

  const isLoading = isLoadingCadence || isLoadingAll;

  // Get contacts based on mode
  const getContactsForMode = () => {
    switch (mode) {
      case "cadence":
        return cadenceContacts;
      case "hot":
        return hotContacts;
      case "all":
        return allContacts?.filter(c => c.phone || c.mobile) || [];
      default:
        return cadenceContacts;
    }
  };

  const { data: colleagues } = useCompanyColleagues(
    currentContact?.id || "",
    currentContact?.company_id
  );

  // Initialize call timer
  useCallTimer();

  // Autosave dialer state (debounced)
  const { isSaving } = useDialerAutosave(userId);
  
  // Hydrate from saved draft when switching contacts
  useHydrateDraft(userId);

  const handleStartSession = () => {
    const contactsToCall = getContactsForMode();
    if (!contactsToCall || contactsToCall.length === 0) {
      toast.error("No contacts to call. Import some leads or start cadences first!");
      return;
    }
    startSession(contactsToCall);
  };

  if (isLoading) {
    return (
      <div className="h-full p-6 space-y-4">
        <Skeleton className="h-14 w-full" />
        <div className="flex gap-4 h-[calc(100%-5rem)]">
          <Skeleton className="w-64 h-full" />
          <Skeleton className="flex-1 h-full" />
          <Skeleton className="w-80 h-full" />
        </div>
      </div>
    );
  }

  const cadenceCount = cadenceContacts.length;
  const hotCount = hotContacts.length;
  const allCount = allContacts?.filter(c => c.phone).length || 0;
  const currentModeCount = getContactsForMode().length;

  // Start Screen
  if (!isActive) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="text-center max-w-lg mx-auto px-6">
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
            <Phone className="h-12 w-12 text-primary" />
          </div>
          <h2 className="text-3xl font-bold mb-3 tracking-tight">Power Dialer</h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Work through your cadence calls efficiently.
          </p>

          {/* Mode Selection Tabs */}
          <div className="mb-6">
            <Tabs value={mode} onValueChange={(v) => setMode(v as DialerMode)} className="inline-flex">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="cadence" className="gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Active Cadence
                  {cadenceCount > 0 && (
                    <Badge variant="secondary" className="ml-1">{cadenceCount}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="hot" className="gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Hot
                  {hotCount > 0 && (
                    <Badge variant="secondary" className="ml-1 bg-orange-500/20 text-orange-500">{hotCount}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="all" className="gap-2">
                  <ListTodo className="h-4 w-4" />
                  All Fresh
                  {allCount > 0 && (
                    <Badge variant="secondary" className="ml-1">{allCount}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {currentModeCount > 0 ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-card rounded-full border">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {currentModeCount} {mode === "cadence" ? "active cadence contacts" : mode === "hot" ? "hot leads" : "contacts"} ready
                </span>
              </div>
              <div className="block">
                <Button size="lg" onClick={handleStartSession} className="h-14 px-8 text-lg gap-3">
                  <Zap className="h-5 w-5" />
                  Start Calling {mode === "cadence" ? "Cadence" : mode === "hot" ? "Hot Leads" : "Session"}
                </Button>
              </div>
              {mode === "cadence" && cadenceCount === 0 && (
                <p className="text-sm text-muted-foreground mt-4">
                  No active cadence contacts. Start a cadence from Work Queue.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {mode === "cadence" 
                  ? "No active cadence contacts. Start a cadence from Work Queue!"
                  : mode === "hot"
                  ? "No hot leads yet. Wait for email opens."
                  : "No contacts with phone numbers found."}
              </p>
              <Button variant="outline" size="lg" asChild>
                <a href={mode === "cadence" ? "/workqueue" : "/import"}>
                  {mode === "cadence" ? "Go to Work Queue" : "Import from Apollo"}
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active Dialer - 3-Column Layout
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top Bar: Call Controls */}
      <div className="relative">
        <CallControlsHeader />
        {/* Autosave indicator */}
        {isSaving && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] gap-1">
            <Save className="h-3 w-3 animate-pulse" />
            Saving...
          </Badge>
        )}
      </div>

      {/* Main Content: 3-Column Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Column 1: Call Queue (keep same width) */}
        <div className="w-64 border-r bg-card/30 flex flex-col shrink-0">
          <CallQueue />
        </div>

        {/* Column 2: Contact + Company Info (flex grow) */}
        <div className="flex-1 border-r flex flex-col min-w-0">
          {currentContact ? (
            <div className="flex-1 overflow-y-auto p-4">
              <ContactPanelCompact />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">No contact selected</p>
            </div>
          )}
        </div>

        {/* Column 3: Notes + Tasks (fixed width) */}
        <div className="w-80 flex flex-col shrink-0 bg-card/30">
          {currentContact ? (
            <NotesAndTasks
              contact={currentContact}
              colleagues={(colleagues as Contact[]) || []}
              userId={userId}
              notes={timestampedNotes}
              elapsedSeconds={callDuration}
              isCallActive={isCallActive}
              onAddNote={addTimestampedNote}
              onUpdateNote={updateTimestampedNote}
              onDeleteNote={deleteTimestampedNote}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">Select a contact</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
