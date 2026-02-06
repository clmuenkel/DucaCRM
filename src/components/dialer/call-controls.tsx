"use client";

import { useState } from "react";
import { useDialerStore, type PhoneType } from "@/stores/dialer-store";
import { useLogCall } from "@/hooks/use-calls";
import { useUpdateContact, useContacts } from "@/hooks/use-contacts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDuration, copyToClipboard } from "@/lib/utils";
import { MeetingDialog } from "./meeting-dialog";
import {
  Phone,
  PhoneOff,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  Save,
  ExternalLink,
  X,
  Check,
  Calendar,
  Smartphone,
  Building2,
  Trophy,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { QuickActions } from "./quick-actions";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export function CallControlsHeader() {
  const userId = DEFAULT_USER_ID;
  const [copied, setCopied] = useState(false);
  const [showMeetingDialog, setShowMeetingDialog] = useState(false);
  const [isProcessingOutcome, setIsProcessingOutcome] = useState(false);
  const [callbackDate, setCallbackDate] = useState<string>("");
  
  const {
    currentContact,
    currentIndex,
    queue,
    isCallActive,
    callDuration,
    notes,
    outcome,
    disposition,
    confirmedBudget,
    confirmedAuthority,
    confirmedNeed,
    confirmedTimeline,
    timestampedNotes,
    selectedPhoneType,
    setSelectedPhoneType,
    getSelectedPhone,
    startCall,
    endCall,
    nextContact,
    previousContact,
    skipContact,
    endSession,
    telnyxClient,
    isConnecting,
    telnyxError,
    telnyxCallId,
    telnyxNumberUsed,
    initializeTelnyxClient,
    connectTelnyxCall,
    disconnectTelnyxCall,
    setTelnyxError,
  } = useDialerStore();

  const logCall = useLogCall();
  const updateContact = useUpdateContact();
  const { refetch: refetchContacts } = useContacts({});
  
  // Check if contact is in active cadence
  const isInCadence = currentContact?.cadence_status === "active" && 
                      currentContact?.cadence_outcome === "in_progress";

  // Handle cadence outcome (Won, Lost, No Answer, Callback)
  const handleCadenceOutcome = async (
    outcomeType: "won" | "lost" | "no_answer" | "callback",
    date?: string
  ) => {
    if (!currentContact) return;

    setIsProcessingOutcome(true);
    try {
      const response = await fetch("/api/contacts/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: currentContact.id,
          outcome: outcomeType,
          callbackDate: date,
          notes: notes || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process outcome");
      }

      toast.success(data.message);
      
      // Refetch contacts and move to next
      await refetchContacts();
      nextContact();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsProcessingOutcome(false);
      setCallbackDate("");
    }
  };

  // Get available phone numbers
  const mobileNumber = currentContact?.mobile;
  const officeNumber = currentContact?.phone;
  const hasBothNumbers = !!(mobileNumber && officeNumber && mobileNumber !== officeNumber);
  const selectedPhone = getSelectedPhone();

  const dialTelnyx = async () => {
    const phoneToCall = selectedPhone;
    if (!phoneToCall) {
      toast.error("No phone number available");
      return;
    }

    if (!currentContact) {
      toast.error("No contact selected");
      return;
    }

    try {
      // Check if client is initialized
      if (!telnyxClient) {
        // Get access token and initialize client
        const tokenResponse = await fetch("/api/telnyx/token");
        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          throw new Error(errorData.error || "Failed to get Telnyx token");
        }

        const { token } = await tokenResponse.json();
        await initializeTelnyxClient(token);
      }

      // Connect the call
      setTelnyxError(null);
      await connectTelnyxCall(phoneToCall);
      
      toast.success(`Connecting to ${selectedPhoneType === "mobile" ? "mobile" : "office"}...`);
    } catch (error: any) {
      console.error("Error dialing Telnyx:", error);
      toast.error(error.message || "Failed to connect call");
      setTelnyxError(error.message || "Failed to connect call");
    }
  };

  const handleCopyNumber = async () => {
    const phoneToCopy = selectedPhone;
    if (!phoneToCopy) return;
    await copyToClipboard(phoneToCopy);
    setCopied(true);
    toast.success("Phone number copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEndCall = () => {
    disconnectTelnyxCall();
    endCall();
    toast.info("Call ended. Don't forget to log your outcome.");
  };

  // Skip: Log that we didn't call this contact (for tracking who still needs to be called)
  const handleSkip = async () => {
    if (!currentContact) {
      skipContact();
      return;
    }

    try {
      await logCall.mutateAsync({
        call: {
          user_id: userId,
          contact_id: currentContact.id,
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: 0,
          outcome: "skipped",
          phone_used: selectedPhoneType,
        },
      });
      toast.info("Contact skipped");
      nextContact();
    } catch (error: any) {
      // If logging fails, still skip to next contact
      console.error("Failed to log skip:", error);
      skipContact();
    }
  };

  const handleSaveAndNext = async () => {
    if (!currentContact) {
      toast.error("Cannot save call");
      return;
    }

    if (!outcome) {
      toast.error("Please select a call outcome");
      return;
    }

    try {
      await logCall.mutateAsync({
        call: {
          user_id: userId,
          contact_id: currentContact.id,
          started_at: new Date(Date.now() - callDuration * 1000).toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: callDuration,
          outcome,
          disposition: disposition || undefined,
          phone_used: selectedPhoneType,
          telnyx_call_id: telnyxCallId || undefined,
          telnyx_number_used: telnyxNumberUsed || undefined,
          notes: notes || undefined,
          confirmed_budget: confirmedBudget,
          confirmed_authority: confirmedAuthority,
          confirmed_need: confirmedNeed,
          confirmed_timeline: confirmedTimeline,
          timestamped_notes: timestampedNotes.length > 0 ? timestampedNotes : undefined,
        },
      });

      await updateContact.mutateAsync({
        id: currentContact.id,
        updates: {
          has_budget: confirmedBudget,
          is_authority: confirmedAuthority,
          has_need: confirmedNeed,
          has_timeline: confirmedTimeline,
          stage: outcome === "connected" && disposition?.includes("interested") ? "qualified" : currentContact.stage,
        },
      });

      toast.success("Call saved!");
      nextContact();
    } catch (error: any) {
      toast.error(error.message || "Failed to save call");
    }
  };

  const formatPhoneDisplay = (phone: string | null | undefined, type: PhoneType) => {
    if (!phone) return null;
    // Show last 4 digits for quick reference
    const last4 = phone.replace(/\D/g, "").slice(-4);
    return `${type === "mobile" ? "📱" : "🏢"} ...${last4}`;
  };

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === queue.length - 1;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        {/* Left: Status + Navigation */}
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            isCallActive 
              ? "bg-green-500/20 ring-2 ring-green-500/50" 
              : "bg-primary/10"
          }`}>
            <Phone className={`h-5 w-5 ${isCallActive ? "text-green-500" : "text-primary"}`} />
          </div>
          
          {/* Position + Timer */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {isCallActive ? "Call Active" : "Ready to Dial"}
              </span>
              {isCallActive && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/30 font-mono">
                  {formatDuration(callDuration)}
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              Contact {currentIndex + 1} of {queue.length}
            </span>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={previousContact}
              disabled={isFirst}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={nextContact}
              disabled={isLast}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Center: Phone Selector + Main Call Actions */}
        <div className="flex items-center gap-3">
          {/* Telnyx Error Display */}
          {telnyxError && (
            <div className="px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-md text-sm text-red-600">
              {telnyxError}
            </div>
          )}

          {!isCallActive && !isConnecting ? (
            <>
              {/* Phone Number Selector */}
              {hasBothNumbers ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-10 gap-2 min-w-[140px] justify-between">
                      <div className="flex items-center gap-2">
                        {selectedPhoneType === "mobile" ? (
                          <Smartphone className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Building2 className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="font-mono text-sm">
                          {selectedPhoneType === "mobile" ? "Mobile" : "Office"}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem 
                      onClick={() => setSelectedPhoneType("mobile")}
                      className="gap-2"
                    >
                      <Smartphone className="h-4 w-4 text-blue-500" />
                      <span>Mobile</span>
                      <span className="text-xs text-muted-foreground ml-auto font-mono">
                        {mobileNumber}
                      </span>
                      {selectedPhoneType === "mobile" && <Check className="h-4 w-4 text-green-500 ml-2" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedPhoneType("office")}
                      className="gap-2"
                    >
                      <Building2 className="h-4 w-4 text-amber-500" />
                      <span>Office</span>
                      <span className="text-xs text-muted-foreground ml-auto font-mono">
                        {officeNumber}
                      </span>
                      {selectedPhoneType === "office" && <Check className="h-4 w-4 text-green-500 ml-2" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                // Single number display
                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md">
                  {mobileNumber ? (
                    <Smartphone className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Building2 className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="font-mono text-sm">{selectedPhone || "No number"}</span>
                </div>
              )}

              {/* Copy Number Button */}
              <Button 
                variant="outline" 
                size="default" 
                onClick={handleCopyNumber}
                className="h-10 gap-2"
                disabled={!selectedPhone}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy
              </Button>
              
              {/* DIAL BUTTON - Large and Prominent */}
              <Button 
                size="lg" 
                onClick={dialTelnyx}
                disabled={!selectedPhone || isConnecting}
                className="h-12 px-6 text-base font-semibold gap-2 bg-green-600 hover:bg-green-700 text-white shadow-lg disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Phone className="h-5 w-5" />
                    DIAL
                  </>
                )}
              </Button>

              {/* Meeting Button - Right next to Dial */}
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowMeetingDialog(true)}
                className="h-12 px-4 gap-2"
              >
                <Calendar className="h-5 w-5" />
                Meeting
              </Button>
            </>
          ) : (
            <>
              {/* Active Call or Connecting - Show which number */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md text-sm">
                {selectedPhoneType === "mobile" ? (
                  <Smartphone className="h-4 w-4 text-blue-500" />
                ) : (
                  <Building2 className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-muted-foreground">
                  {isConnecting ? "Connecting..." : selectedPhoneType === "mobile" ? "Mobile" : "Office"}
                </span>
              </div>

              {/* Active Call Timer */}
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono text-lg font-bold">
                  {formatDuration(callDuration)}
                </span>
              </div>
              
              {/* Schedule Meeting Button - Available during active call */}
              {currentContact && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowMeetingDialog(true)}
                  className="h-12 px-4 gap-2"
                >
                  <Calendar className="h-5 w-5" />
                  Meeting
                </Button>
              )}
              
              {/* End Call Button */}
              <Button 
                variant="destructive" 
                size="lg"
                onClick={handleEndCall}
                className="h-12 px-6 text-base font-semibold gap-2"
              >
                <PhoneOff className="h-5 w-5" />
                End Call
              </Button>
            </>
          )}
        </div>

        {/* Right: Cadence Outcomes + Save Actions */}
        <div className="flex items-center gap-2">
          {/* Cadence Outcome Buttons (only show if in active cadence) */}
          {isInCadence && (
            <div className="flex items-center gap-1 mr-2 border-r pr-3">
              {/* Won - Green */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCadenceOutcome("won")}
                disabled={isProcessingOutcome}
                className="h-9 gap-1 border-green-500/50 text-green-600 hover:bg-green-500/10 hover:text-green-600"
                title="Meeting Booked!"
              >
                {isProcessingOutcome ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trophy className="h-4 w-4" />
                )}
                Won
              </Button>

              {/* No Answer - Gray */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCadenceOutcome("no_answer")}
                disabled={isProcessingOutcome}
                className="h-9 gap-1"
                title="No Answer - Advance to next step"
              >
                {isProcessingOutcome ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff className="h-4 w-4" />
                )}
                No Answer
              </Button>

              {/* Callback - Yellow with date picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProcessingOutcome}
                    className="h-9 gap-1 border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10 hover:text-yellow-600"
                    title="Schedule Callback"
                  >
                    <Clock className="h-4 w-4" />
                    Callback
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="end">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Callback Date</Label>
                    <Input
                      type="date"
                      value={callbackDate}
                      onChange={(e) => setCallbackDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (callbackDate) {
                          handleCadenceOutcome("callback", callbackDate);
                        } else {
                          toast.error("Please select a callback date");
                        }
                      }}
                      disabled={!callbackDate || isProcessingOutcome}
                      className="w-full gap-2"
                    >
                      {isProcessingOutcome ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Calendar className="h-4 w-4" />
                      )}
                      Schedule
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Lost - Red */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCadenceOutcome("lost")}
                disabled={isProcessingOutcome}
                className="h-9 gap-1 border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                title="Not Interested - Archive"
              >
                {isProcessingOutcome ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Lost
              </Button>
            </div>
          )}

          {/* Standard Actions */}
          <Button 
            variant="outline" 
            size="default" 
            onClick={handleSkip}
            disabled={logCall.isPending}
            className="h-10 gap-2"
          >
            <SkipForward className="h-4 w-4" />
            Skip
          </Button>
          <Button
            size="default"
            onClick={handleSaveAndNext}
            disabled={!outcome || logCall.isPending}
            className="h-10 gap-2 font-semibold"
          >
            <Save className="h-4 w-4" />
            Save & Next
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={endSession} 
            className="h-10 w-10 text-muted-foreground hover:text-destructive"
            title="End Session"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Quick Actions - Replace old outcome buttons */}
      {currentContact && !isCallActive && (
        <QuickActions
          contact={currentContact}
          onActionComplete={async () => {
            await refetchContacts();
          }}
          onNextContact={nextContact}
        />
      )}

      {/* Meeting Dialog */}
      {currentContact && (
        <MeetingDialog
          open={showMeetingDialog}
          onOpenChange={setShowMeetingDialog}
          contact={currentContact}
          userId={userId}
        />
      )}
    </>
  );
}

// Keep the old component for backwards compatibility
/** @deprecated Use CallControlsHeader instead */
export function CallControls() {
  return <CallControlsHeader />;
}
