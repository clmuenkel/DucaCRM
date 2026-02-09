import { create } from "zustand";
import type { Contact, TimestampedNote } from "@/types/database";

export type CallOutcome = "connected" | "voicemail" | "no_answer" | "busy" | "wrong_number" | "gatekeeper" | "skipped";
export type CallDisposition = "interested_meeting" | "interested_info" | "callback" | "not_interested_fit" | "not_interested_solution" | "not_interested_budget" | "do_not_contact";
export type PhoneType = "mobile" | "office";

export interface ReferralContext {
  type: "direct" | "company" | "manual" | "none";
  name?: string;
  title?: string;
  contactId?: string;
  date?: string;
  note?: string;
}

interface DialerState {
  // Session state
  isActive: boolean;
  queue: Contact[];
  currentIndex: number;

  // Current call state
  currentContact: Contact | null;
  callStartTime: Date | null;
  callDuration: number;
  isCallActive: boolean;
  selectedPhoneType: PhoneType;

  // Telnyx-specific state
  telnyxClient: any | null; // Telnyx WebRTC Client
  telnyxCall: any | null; // Active Telnyx Call
  isConnecting: boolean;
  telnyxError: string | null;
  telnyxCallId: string | null;
  telnyxNumberUsed: string | null;

  // Call data
  notes: string;
  timestampedNotes: TimestampedNote[];
  outcome: CallOutcome | null;
  disposition: CallDisposition | null;

  // Referral context for opener
  referralContext: ReferralContext;

  // Qualification during call
  confirmedBudget: boolean;
  confirmedAuthority: boolean;
  confirmedNeed: boolean;
  confirmedTimeline: boolean;

  // Follow-up
  followUpDate: Date | null;

  // Actions
  startSession: (contacts: Contact[]) => void;
  endSession: () => void;
  setQueue: (contacts: Contact[]) => void;
  
  startCall: () => void;
  endCall: () => void;
  updateDuration: (seconds: number) => void;

  nextContact: () => void;
  previousContact: () => void;
  skipContact: () => void;
  goToContact: (index: number) => void;

  setNotes: (notes: string) => void;
  addTimestampedNote: (note: TimestampedNote) => void;
  updateTimestampedNote: (index: number, note: TimestampedNote) => void;
  deleteTimestampedNote: (index: number) => void;
  clearTimestampedNotes: () => void;
  
  setOutcome: (outcome: CallOutcome | null) => void;
  setDisposition: (disposition: CallDisposition | null) => void;
  
  setReferralContext: (context: ReferralContext) => void;
  clearReferralContext: () => void;
  
  setQualification: (field: "budget" | "authority" | "need" | "timeline", value: boolean) => void;
  setFollowUpDate: (date: Date | null) => void;
  setSelectedPhoneType: (phoneType: PhoneType) => void;
  getSelectedPhone: () => string | null;

  // Telnyx actions
  initializeTelnyxClient: (token: string) => Promise<void>;
  connectTelnyxCall: (phoneNumber: string) => Promise<void>;
  disconnectTelnyxCall: () => void;
  setTelnyxError: (error: string | null) => void;
  setTelnyxCallId: (callId: string | null) => void;
  setTelnyxNumberUsed: (number: string | null) => void;

  resetCallState: () => void;
}

export const useDialerStore = create<DialerState>((set, get) => ({
  // Initial state
  isActive: false,
  queue: [],
  currentIndex: 0,
  currentContact: null,
  callStartTime: null,
  callDuration: 0,
  isCallActive: false,
  selectedPhoneType: "mobile",
  notes: "",
  timestampedNotes: [],
  outcome: null,
  disposition: null,
  referralContext: { type: "none" },
  confirmedBudget: false,
  confirmedAuthority: false,
  confirmedNeed: false,
  confirmedTimeline: false,
  followUpDate: null,
  telnyxClient: null,
  telnyxCall: null,
  isConnecting: false,
  telnyxError: null,
  telnyxCallId: null,
  telnyxNumberUsed: null,

  startSession: (contacts) => {
    set({
      isActive: true,
      queue: contacts,
      currentIndex: 0,
      currentContact: contacts[0] || null,
    });
  },

  endSession: () => {
    // Disconnect Telnyx call if active
    const { telnyxCall, telnyxClient } = get();
    if (telnyxCall) {
      try {
        telnyxCall.hangup();
      } catch (e) {
        console.error("Error hanging up call:", e);
      }
    }
    if (telnyxClient) {
      try {
        telnyxClient.disconnect();
      } catch (e) {
        console.error("Error disconnecting client:", e);
      }
    }

    set({
      isActive: false,
      queue: [],
      currentIndex: 0,
      currentContact: null,
      callStartTime: null,
      callDuration: 0,
      isCallActive: false,
      notes: "",
      timestampedNotes: [],
      outcome: null,
      disposition: null,
      referralContext: { type: "none" },
      confirmedBudget: false,
      confirmedAuthority: false,
      confirmedNeed: false,
      confirmedTimeline: false,
      followUpDate: null,
      telnyxClient: null,
      telnyxCall: null,
      isConnecting: false,
      telnyxError: null,
      telnyxCallId: null,
      telnyxNumberUsed: null,
    });
  },

  setQueue: (contacts) => {
    set({
      queue: contacts,
      currentContact: contacts[get().currentIndex] || null,
    });
  },

  startCall: () => {
    set({
      isCallActive: true,
      callStartTime: new Date(),
      callDuration: 0,
    });
  },

  endCall: () => {
    const { callStartTime } = get();
    const duration = callStartTime
      ? Math.floor((new Date().getTime() - callStartTime.getTime()) / 1000)
      : 0;
    set({
      isCallActive: false,
      callDuration: duration,
    });
  },

  updateDuration: (seconds) => {
    set({ callDuration: seconds });
  },

  nextContact: () => {
    const { queue, currentIndex } = get();
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      set({
        currentIndex: nextIndex,
        currentContact: queue[nextIndex],
      });
      get().resetCallState();
    }
  },

  previousContact: () => {
    const { queue, currentIndex } = get();
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      set({
        currentIndex: prevIndex,
        currentContact: queue[prevIndex],
      });
      get().resetCallState();
    }
  },

  skipContact: () => {
    get().nextContact();
  },

  goToContact: (index) => {
    const { queue } = get();
    if (index >= 0 && index < queue.length) {
      set({
        currentIndex: index,
        currentContact: queue[index],
      });
      get().resetCallState();
    }
  },

  setNotes: (notes) => set({ notes }),
  
  addTimestampedNote: (note) => {
    set((state) => ({
      timestampedNotes: [...state.timestampedNotes, note],
    }));
  },

  updateTimestampedNote: (index, note) => {
    set((state) => {
      const updated = [...state.timestampedNotes];
      updated[index] = note;
      return { timestampedNotes: updated };
    });
  },

  deleteTimestampedNote: (index) => {
    set((state) => ({
      timestampedNotes: state.timestampedNotes.filter((_, i) => i !== index),
    }));
  },

  clearTimestampedNotes: () => {
    set({ timestampedNotes: [] });
  },

  setOutcome: (outcome) => set({ outcome }),
  setDisposition: (disposition) => set({ disposition }),

  setReferralContext: (context) => set({ referralContext: context }),
  clearReferralContext: () => set({ referralContext: { type: "none" } }),

  setQualification: (field, value) => {
    switch (field) {
      case "budget":
        set({ confirmedBudget: value });
        break;
      case "authority":
        set({ confirmedAuthority: value });
        break;
      case "need":
        set({ confirmedNeed: value });
        break;
      case "timeline":
        set({ confirmedTimeline: value });
        break;
    }
  },

  setFollowUpDate: (date) => set({ followUpDate: date }),

  setSelectedPhoneType: (phoneType) => set({ selectedPhoneType: phoneType }),

  getSelectedPhone: () => {
    const { currentContact, selectedPhoneType } = get();
    if (!currentContact) return null;
    
    if (selectedPhoneType === "mobile") {
      return currentContact.mobile || currentContact.phone || null;
    }
    return currentContact.phone || currentContact.mobile || null;
  },

  initializeTelnyxClient: async (token: string) => {
    try {
      // Dynamically import Telnyx WebRTC SDK (browser only)
      const { TelnyxRTC } = await import("@telnyx/webrtc");

      const { telnyxClient } = get();
      // Disconnect existing client if any
      if (telnyxClient) {
        try {
          telnyxClient.disconnect();
        } catch (e) {
          console.error("Error disconnecting existing client:", e);
        }
      }

      // Create new client
      const client = new TelnyxRTC({
        login_token: token,
      });

      // Set up event handlers
      client.on("telnyx.ready", () => {
        console.log("Telnyx client ready");
        set({ telnyxError: null });
      });

      client.on("telnyx.error", (error: any) => {
        console.error("Telnyx client error:", error);
        set({ telnyxError: error.message || "Telnyx client error" });
      });

      client.on("telnyx.socket.error", (error: any) => {
        console.error("Telnyx socket error:", error);
        set({ telnyxError: "Connection error. Please try again." });
      });

      // Connect the client
      await client.connect();

      // Attach remote audio element so we can hear the other party
      // Telnyx WebRTC requires an <audio> element for playback
      let audioEl = document.getElementById("telnyx-remote-audio") as HTMLAudioElement | null;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = "telnyx-remote-audio";
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
      client.remoteElement = audioEl;

      set({ telnyxClient: client, telnyxError: null });
    } catch (error: any) {
      console.error("Error initializing Telnyx client:", error);
      set({ telnyxError: error.message || "Failed to initialize Telnyx client" });
      throw error;
    }
  },

  connectTelnyxCall: async (phoneNumber: string) => {
    const { telnyxClient, currentContact } = get();

    if (!telnyxClient) {
      throw new Error("Telnyx client not initialized. Please initialize first.");
    }

    if (!currentContact) {
      throw new Error("No contact selected");
    }

    // Normalize phone number to E.164 format
    const { normalizeToE164 } = await import("@/lib/utils");
    const normalizedNumber = normalizeToE164(phoneNumber);
    
    if (!normalizedNumber) {
      throw new Error(`Invalid phone number format: ${phoneNumber}. Please use E.164 format (e.g., +18322941575)`);
    }

    set({ isConnecting: true, telnyxError: null });

    try {
      // First, initiate call via API to get number and track usage
      // Pass contact's state so the backend can geo-match the best number
      const initiateResponse = await fetch("/api/telnyx/call/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: currentContact.id,
          toNumber: normalizedNumber,
          contactState: currentContact.state || null,
        }),
      });

      if (!initiateResponse.ok) {
        const errorData = await initiateResponse.json();
        throw new Error(errorData.error || "Failed to initiate call");
      }

      const { phoneNumber: telnyxNumberUsed, telnyxCallId } = await initiateResponse.json();
      set({ telnyxNumberUsed, telnyxCallId });

      // Normalize Telnyx number as well
      const normalizedTelnyxNumber = normalizeToE164(telnyxNumberUsed) || telnyxNumberUsed;

      // Set up call notification handler on the CLIENT (Telnyx SDK sends
      // notifications through the client, not individual call objects)
      telnyxClient.on("telnyx.notification", (notification: any) => {
        const callState = notification?.call?.state;
        console.log("Telnyx call notification:", callState);

        switch (callState) {
          case "ringing":
            console.log("Call ringing");
            break;
          case "active":
            console.log("Call active");
            set({
              isConnecting: false,
              isCallActive: true,
              callStartTime: new Date(),
              callDuration: 0,
            });
            get().startCall();
            break;
          case "hangup":
          case "destroy":
            console.log("Call ended");
            const { callStartTime } = get();
            const duration = callStartTime
              ? Math.floor((new Date().getTime() - callStartTime.getTime()) / 1000)
              : 0;
            set({
              isConnecting: false,
              isCallActive: false,
              callDuration: duration,
              telnyxCall: null,
            });
            get().endCall();
            break;
        }
      });

      // Create the call using Telnyx WebRTC SDK
      const call = telnyxClient.newCall({
        destinationNumber: normalizedNumber,
        callerNumber: normalizedTelnyxNumber,
      });

      // Store call reference
      set({ telnyxCall: call });
    } catch (error: any) {
      console.error("Error connecting Telnyx call:", error);
      set({
        isConnecting: false,
        isCallActive: false,
        telnyxError: error.message || "Failed to connect call",
        telnyxCall: null,
      });
      throw error;
    }
  },

  disconnectTelnyxCall: () => {
    const { telnyxCall } = get();
    if (telnyxCall) {
      try {
        telnyxCall.hangup();
      } catch (e) {
        console.error("Error hanging up call:", e);
      }
    }
    set({
      telnyxCall: null,
      isConnecting: false,
      isCallActive: false,
    });
    get().endCall();
  },

  setTelnyxError: (error) => set({ telnyxError: error }),
  setTelnyxCallId: (callId) => set({ telnyxCallId: callId }),
  setTelnyxNumberUsed: (number) => set({ telnyxNumberUsed: number }),

  resetCallState: () => {
    const { currentContact, telnyxCall } = get();
    
    // Disconnect any active Telnyx call
    if (telnyxCall) {
      try {
        telnyxCall.hangup();
      } catch (e) {
        console.error("Error hanging up call:", e);
      }
    }

    // Default to mobile if available, otherwise office
    const defaultPhoneType: PhoneType = currentContact?.mobile ? "mobile" : "office";
    set({
      callStartTime: null,
      callDuration: 0,
      isCallActive: false,
      isConnecting: false,
      selectedPhoneType: defaultPhoneType,
      notes: "",
      timestampedNotes: [],
      outcome: null,
      disposition: null,
      referralContext: { type: "none" },
      confirmedBudget: currentContact?.has_budget || false,
      confirmedAuthority: currentContact?.is_authority || false,
      confirmedNeed: currentContact?.has_need || false,
      confirmedTimeline: currentContact?.has_timeline || false,
      followUpDate: null,
      telnyxCall: null,
      telnyxError: null,
      telnyxCallId: null,
      telnyxNumberUsed: null,
    });
  },
}));
