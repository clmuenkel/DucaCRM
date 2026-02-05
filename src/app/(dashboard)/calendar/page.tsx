"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { useUpcomingMeetings, useTodaysMeetings, useCancelMeeting, useCompleteMeeting, useAllMeetings } from "@/hooks/use-meetings";
import { MeetingDetailDialog } from "@/components/meetings/meeting-detail";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { insforge } from "@/lib/insforge/client";
import { 
  format, 
  format as formatDate,
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  isSameDay, 
  isToday, 
  isPast,
  isFuture,
  formatDistanceToNow,
  addMonths, 
  subMonths,
  isSameMonth 
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  Clock,
  MapPin,
  Link as LinkIcon,
  User,
  Building2,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import type { MeetingWithContact } from "@/types/database";

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingWithContact | null>(null);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionOutcome, setCompletionOutcome] = useState("successful");
  const [completionNotes, setCompletionNotes] = useState("");

  const { data: upcomingMeetings, isLoading } = useUpcomingMeetings(60); // Get 60 days of meetings
  const { data: todaysMeetings } = useTodaysMeetings();
  const cancelMeeting = useCancelMeeting();
  const completeMeeting = useCompleteMeeting();

  // Generate calendar days for the month view
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  // Generate all days to display in the calendar grid
  const calendarDays: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  // Combine and dedupe meetings
  const todayMeetingsList = todaysMeetings ?? [];
  const upcomingMeetingsList = upcomingMeetings ?? [];
  const allMeetings = [...todayMeetingsList, ...upcomingMeetingsList];
  
  const seenIds = new Set<string>();
  const uniqueMeetings = allMeetings.filter((m) => {
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });
  
  const getMeetingsForDate = (date: Date) => {
    return uniqueMeetings.filter((m) => 
      isSameDay(new Date(m.scheduled_at), date)
    );
  };

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(new Date());
  };

  const handleCancelMeeting = async (meetingId: string) => {
    try {
      await cancelMeeting.mutateAsync(meetingId);
      toast.success("Meeting cancelled");
      setSelectedMeeting(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel meeting");
    }
  };

  const handleCompleteMeeting = async () => {
    if (!selectedMeeting) return;
    
    try {
      await completeMeeting.mutateAsync({
        id: selectedMeeting.id,
        outcome: completionOutcome,
        notes: completionNotes,
      });
      toast.success("Meeting marked as complete");
      setShowCompleteDialog(false);
      setSelectedMeeting(null);
      setCompletionOutcome("successful");
      setCompletionNotes("");
    } catch (error: any) {
      toast.error(error.message || "Failed to complete meeting");
    }
  };

  // Get meetings for selected date (sidebar)
  const selectedDateMeetings = selectedDate ? getMeetingsForDate(selectedDate) : todayMeetingsList;
  const sidebarTitle = selectedDate 
    ? (isToday(selectedDate) ? "Today's Schedule" : format(selectedDate, "MMM d, yyyy"))
    : "Today's Schedule";

  // Day names header
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Meetings list state
  const [activeTab, setActiveTab] = useState<"calendar" | "meetings" | "scheduling">("calendar");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [meetingSearchQuery, setMeetingSearchQuery] = useState("");
  const [meetingFilter, setMeetingFilter] = useState<"all" | "upcoming" | "past" | "completed">("all");
  const { data: allMeetingsData } = useAllMeetings();

  // Filter meetings for list view
  const filteredMeetings = (allMeetingsData ?? []).filter((meeting) => {
    const meetingDate = new Date(meeting.scheduled_at);
    let matchesTab = true;
    switch (meetingFilter) {
      case "upcoming":
        matchesTab = meeting.status === "scheduled" && isFuture(meetingDate);
        break;
      case "past":
        matchesTab = isPast(meetingDate) && meeting.status !== "completed";
        break;
      case "completed":
        matchesTab = meeting.status === "completed";
        break;
      default:
        matchesTab = true;
    }

    const contact = meeting.contacts;
    const searchLower = meetingSearchQuery.toLowerCase();
    const matchesSearch = !meetingSearchQuery || 
      meeting.title.toLowerCase().includes(searchLower) ||
      contact?.first_name?.toLowerCase().includes(searchLower) ||
      contact?.last_name?.toLowerCase().includes(searchLower) ||
      contact?.company_name?.toLowerCase().includes(searchLower);

    return matchesTab && matchesSearch;
  }) || [];

  const meetingCounts = {
    all: allMeetingsData?.length || 0,
    upcoming: allMeetingsData?.filter(m => m.status === "scheduled" && isFuture(new Date(m.scheduled_at))).length || 0,
    past: allMeetingsData?.filter(m => isPast(new Date(m.scheduled_at)) && m.status !== "completed").length || 0,
    completed: allMeetingsData?.filter(m => m.status === "completed").length || 0,
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Calendar" />
      
      <div className="flex-1 p-6 overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "calendar" | "meetings" | "scheduling")} className="h-full flex flex-col">
          <TabsList className="mb-4">
            <TabsTrigger value="calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="meetings">Meetings List</TabsTrigger>
            <TabsTrigger value="scheduling">Scheduling Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="flex-1 overflow-hidden">
        <div className="flex gap-6 h-full">
          {/* Main Calendar - Month View */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleToday}>
                  Today
                </Button>
              </div>
              <h2 className="text-xl font-semibold">
                {format(currentMonth, "MMMM yyyy")}
              </h2>
              <div className="w-32" /> {/* Spacer for balance */}
            </div>

            {/* Day Names Header */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayNames.map((dayName) => (
                <div
                  key={dayName}
                  className="text-center text-xs font-medium text-muted-foreground py-2"
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 grid grid-cols-7 gap-1 auto-rows-fr">
              {calendarDays.map((calDay) => {
                const dayMeetings = getMeetingsForDate(calDay);
                const isCurrentDay = isToday(calDay);
                const isCurrentMonth = isSameMonth(calDay, currentMonth);
                const isSelected = selectedDate && isSameDay(calDay, selectedDate);
                const hasMeetings = dayMeetings.length > 0;

                return (
                  <button
                    key={calDay.toISOString()}
                    onClick={() => setSelectedDate(calDay)}
                    className={`
                      relative flex flex-col items-center p-1 rounded-lg border transition-all min-h-[60px]
                      ${isCurrentMonth ? "bg-card" : "bg-muted/30 opacity-50"}
                      ${isCurrentDay ? "border-primary ring-1 ring-primary/50" : "border-transparent hover:border-border"}
                      ${isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted/50"}
                    `}
                  >
                    {/* Day Number */}
                    <span className={`
                      text-sm font-medium
                      ${isCurrentDay ? "text-primary" : isCurrentMonth ? "" : "text-muted-foreground"}
                    `}>
                      {format(calDay, "d")}
                    </span>

                    {/* Meeting Indicators */}
                    {hasMeetings && (
                      <div className="flex flex-wrap gap-0.5 justify-center mt-1 max-w-full">
                        {dayMeetings.slice(0, 3).map((meeting, idx) => (
                          <div
                            key={meeting.id}
                            className={`
                              w-1.5 h-1.5 rounded-full
                              ${meeting.status === "cancelled" 
                                ? "bg-muted-foreground" 
                                : meeting.status === "completed"
                                  ? "bg-green-500"
                                  : isPast(new Date(meeting.scheduled_at))
                                    ? "bg-amber-500"
                                    : "bg-primary"
                              }
                            `}
                            title={meeting.title}
                          />
                        ))}
                        {dayMeetings.length > 3 && (
                          <span className="text-[8px] text-muted-foreground">
                            +{dayMeetings.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Meeting count for days with meetings */}
                    {hasMeetings && (
                      <span className="text-[10px] text-muted-foreground mt-auto">
                        {dayMeetings.length} {dayMeetings.length === 1 ? "meeting" : "meetings"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Meetings Sidebar */}
          <div className="w-80 shrink-0">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-3 shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {sidebarTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  {isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : selectedDateMeetings.length > 0 ? (
                    <div className="space-y-3 pr-2">
                      {selectedDateMeetings.map((meeting) => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          onClick={() => setSelectedMeeting(meeting)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        {selectedDate 
                          ? `No meetings on ${format(selectedDate, "MMM d")}`
                          : "No meetings today"
                        }
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="meetings" className="flex-1 overflow-auto">
            <div className="space-y-6">
              {/* Search and Filters */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search meetings..."
                    value={meetingSearchQuery}
                    onChange={(e) => setMeetingSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Filter Tabs */}
              <Tabs value={meetingFilter} onValueChange={(v) => setMeetingFilter(v as typeof meetingFilter)}>
                <TabsList>
                  <TabsTrigger value="all" className="gap-2">
                    All
                    <Badge variant="secondary" className="text-xs">{meetingCounts.all}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="upcoming" className="gap-2">
                    Upcoming
                    <Badge variant="secondary" className="text-xs">{meetingCounts.upcoming}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="past" className="gap-2">
                    Past
                    <Badge variant="secondary" className="text-xs">{meetingCounts.past}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="completed" className="gap-2">
                    Completed
                    <Badge variant="secondary" className="text-xs">{meetingCounts.completed}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Meetings List */}
              {filteredMeetings.length > 0 ? (
                <div className="space-y-2">
                  {filteredMeetings.map((meeting) => (
                    <MeetingRowComponent
                      key={meeting.id}
                      meeting={meeting}
                      onClick={() => setSelectedMeetingId(meeting.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    {meetingSearchQuery ? "No meetings match your search" : "No meetings found"}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="scheduling" className="flex-1 overflow-auto">
            <SchedulingQueue />
          </TabsContent>
        </Tabs>
      </div>

      {/* Meeting Detail Dialog (for meetings list) */}
      {selectedMeetingId && (
        <MeetingDetailDialog
          meetingId={selectedMeetingId}
          userId={DEFAULT_USER_ID}
          open={!!selectedMeetingId}
          onOpenChange={(open) => !open && setSelectedMeetingId(null)}
        />
      )}

      {/* Meeting Detail Dialog (for calendar view) */}
      <Dialog open={!!selectedMeeting && !showCompleteDialog} onOpenChange={(open) => !open && setSelectedMeeting(null)}>
        <DialogContent className="sm:max-w-[500px]">
          {selectedMeeting && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedMeeting.title}</DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedMeeting.scheduled_at), "EEEE, MMMM d, yyyy 'at' h:mm a")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Contact Info */}
                {selectedMeeting.contacts && (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {selectedMeeting.contacts.first_name} {selectedMeeting.contacts.last_name}
                      </p>
                      {selectedMeeting.contacts.title && (
                        <p className="text-sm text-muted-foreground">
                          {selectedMeeting.contacts.title}
                        </p>
                      )}
                      {selectedMeeting.contacts.company_name && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {selectedMeeting.contacts.company_name}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Meeting Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedMeeting.duration_minutes} minutes</span>
                  </div>

                  {selectedMeeting.location && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedMeeting.location}</span>
                    </div>
                  )}

                  {selectedMeeting.meeting_link && (
                    <div className="flex items-center gap-2 text-sm">
                      <LinkIcon className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={selectedMeeting.meeting_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Join Meeting
                      </a>
                    </div>
                  )}

                  {selectedMeeting.description && (
                    <div className="pt-2">
                      <p className="text-sm text-muted-foreground">
                        {selectedMeeting.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                <div>
                  <Badge variant={
                    selectedMeeting.status === "completed" ? "default" :
                    selectedMeeting.status === "cancelled" ? "destructive" :
                    isPast(new Date(selectedMeeting.scheduled_at)) ? "secondary" : "outline"
                  }>
                    {selectedMeeting.status === "completed" ? "Completed" :
                     selectedMeeting.status === "cancelled" ? "Cancelled" :
                     isPast(new Date(selectedMeeting.scheduled_at)) ? "Past Due" : "Scheduled"}
                  </Badge>
                </div>
              </div>

              <DialogFooter className="gap-2">
                {selectedMeeting.status === "scheduled" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => handleCancelMeeting(selectedMeeting.id)}
                      disabled={cancelMeeting.isPending}
                    >
                      {cancelMeeting.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <X className="h-4 w-4 mr-2" />
                      )}
                      Cancel
                    </Button>
                    <Button onClick={() => setShowCompleteDialog(true)}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Mark Complete
                    </Button>
                  </>
                )}
                {selectedMeeting.contacts && (
                  <Button variant="outline" asChild>
                    <Link href={`/contacts/${selectedMeeting.contact_id}`}>
                      View Contact
                    </Link>
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Complete Meeting Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Meeting</DialogTitle>
            <DialogDescription>
              How did the meeting go?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={completionOutcome} onValueChange={setCompletionOutcome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="successful">Successful - Good meeting</SelectItem>
                  <SelectItem value="follow_up_needed">Follow-up needed</SelectItem>
                  <SelectItem value="no_show">No show</SelectItem>
                  <SelectItem value="rescheduled">Rescheduled</SelectItem>
                  <SelectItem value="not_interested">Not interested</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="What was discussed? Any action items?"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCompleteMeeting} disabled={completeMeeting.isPending}>
              {completeMeeting.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MeetingRowComponent({ meeting, onClick }: { meeting: MeetingWithContact; onClick: () => void }) {
  const contact = meeting.contacts;
  const meetingDate = new Date(meeting.scheduled_at);
  const isPastMeeting = isPast(meetingDate);
  const isTodayMeeting = isToday(meetingDate);

  const getStatusBadge = () => {
    if (meeting.status === "completed") {
      return <Badge className="bg-green-500 text-white">Completed</Badge>;
    }
    if (meeting.status === "cancelled") {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    if (isTodayMeeting) {
      return <Badge className="bg-blue-500 text-white">Today</Badge>;
    }
    if (isPastMeeting) {
      return <Badge variant="secondary">Past Due</Badge>;
    }
    return <Badge variant="outline">Scheduled</Badge>;
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border bg-card transition-colors hover:bg-muted group ${
        meeting.status === "cancelled" ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="w-20 shrink-0 text-center">
          <p className="text-2xl font-bold">{formatDate(meetingDate, "d")}</p>
          <p className="text-xs text-muted-foreground uppercase">
            {formatDate(meetingDate, "MMM yyyy")}
          </p>
        </div>
        <div className="w-px h-12 bg-border" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold truncate">{meeting.title}</p>
            {getStatusBadge()}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(meetingDate, "h:mm a")} • {meeting.duration_minutes}min
            </span>
            {contact && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {contact.first_name} {contact.last_name}
              </span>
            )}
            {contact?.company_name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {contact.company_name}
              </span>
            )}
          </div>
          {meeting.status === "completed" && meeting.outcome && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Outcome: {meeting.outcome}
            </p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
    </button>
  );
}

function SchedulingQueue() {
  const [schedulingQueue, setSchedulingQueue] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
    const loadSchedulingQueue = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await insforge.database
          .from("meeting_scheduling_queue")
          .select(`
            *,
            contacts:contact_id (
              id,
              first_name,
              last_name,
              company_name,
              email,
              meeting_scheduling_status,
              scheduling_link_sent_at
            )
          `)
          .eq("user_id", DEFAULT_USER_ID)
          .eq("status", "pending")
          .order("scheduling_link_sent_at", { ascending: true });

        if (error) throw error;
        setSchedulingQueue(data || []);
      } catch (error) {
        console.error("Error loading scheduling queue:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSchedulingQueue();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (schedulingQueue.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No contacts waiting for scheduling</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schedulingQueue.map((item) => {
        const contact = item.contacts;
        const sentDate = new Date(item.scheduling_link_sent_at);
        const daysWaiting = Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24));

        return (
          <Card key={item.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium">
                    {contact?.first_name} {contact?.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {contact?.company_name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Link sent {formatDistanceToNow(sentDate, { addSuffix: true })} ({daysWaiting} days ago)
                  </p>
                </div>
                <Badge variant={daysWaiting > 7 ? "destructive" : daysWaiting > 3 ? "secondary" : "outline"}>
                  {daysWaiting} days
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MeetingCard({
  meeting,
  onClick,
}: {
  meeting: MeetingWithContact;
  onClick: () => void;
}) {
  const contact = meeting.contacts;
  const isPastMeeting = isPast(new Date(meeting.scheduled_at));

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        meeting.status === "cancelled" 
          ? "opacity-50 line-through" 
          : meeting.status === "completed"
            ? "border-green-200 bg-green-50 dark:bg-green-900/10"
            : isPastMeeting && meeting.status === "scheduled"
              ? "border-amber-200 bg-amber-50 dark:bg-amber-900/10"
              : "bg-card hover:bg-muted"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="font-medium text-sm truncate">{meeting.title}</p>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {format(new Date(meeting.scheduled_at), "h:mm a")}
        </Badge>
      </div>
      {contact && (
        <p className="text-xs text-muted-foreground truncate">
          {contact.first_name} {contact.last_name}
          {contact.company_name && ` • ${contact.company_name}`}
        </p>
      )}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {meeting.duration_minutes}m
        </span>
        {meeting.location && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {meeting.location}
          </span>
        )}
        {meeting.status === "completed" && (
          <Badge variant="default" className="text-[8px] px-1 py-0">
            Done
          </Badge>
        )}
      </div>
    </button>
  );
}
