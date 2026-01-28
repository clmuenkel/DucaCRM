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

  // Twilio-specific state
  twilioDevice: any | null; // Twilio Voice SDK Device
  twilioCall: any | null; // Active Twilio Call
  isConnecting: boolean;
  twilioError: string | null;
  twilioCallSid: string | null;
  twilioNumberUsed: string | null;

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

  // Twilio actions
  initializeTwilioDevice: (token: string) => Promise<void>;
  connectTwilioCall: (phoneNumber: string) => Promise<void>;
  disconnectTwilioCall: () => void;
  setTwilioError: (error: string | null) => void;
  setTwilioCallSid: (callSid: string | null) => void;
  setTwilioNumberUsed: (number: string | null) => void;

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
  twilioDevice: null,
  twilioCall: null,
  isConnecting: false,
  twilioError: null,
  twilioCallSid: null,
  twilioNumberUsed: null,

  startSession: (contacts) => {
    set({
      isActive: true,
      queue: contacts,
      currentIndex: 0,
      currentContact: contacts[0] || null,
    });
  },

  endSession: () => {
    // Disconnect Twilio call if active
    const { twilioCall, twilioDevice } = get();
    if (twilioCall) {
      twilioCall.disconnect();
    }
    if (twilioDevice) {
      twilioDevice.destroy();
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
      twilioDevice: null,
      twilioCall: null,
      isConnecting: false,
      twilioError: null,
      twilioCallSid: null,
      twilioNumberUsed: null,
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

  initializeTwilioDevice: async (token: string) => {
    try {
      // Dynamically import Twilio Voice SDK (browser only)
      const { Device } = await import("@twilio/voice-sdk");

      const { twilioDevice } = get();
      // Destroy existing device if any
      if (twilioDevice) {
        twilioDevice.destroy();
      }

      // Create new device
      const device = new Device(token, {
        logLevel: 1, // Error level logging
      });

      // Set up event handlers
      device.on("registered", () => {
        console.log("Twilio device registered");
        set({ twilioError: null });
      });

      device.on("error", (error: any) => {
        console.error("Twilio device error:", error);
        set({ twilioError: error.message || "Twilio device error" });
      });

      device.on("incoming", (call: any) => {
        // We don't handle incoming calls (outbound only)
        console.log("Incoming call (ignored):", call);
      });

      set({ twilioDevice: device, twilioError: null });
    } catch (error: any) {
      console.error("Error initializing Twilio device:", error);
      set({ twilioError: error.message || "Failed to initialize Twilio device" });
      throw error;
    }
  },

  connectTwilioCall: async (phoneNumber: string) => {
    const { twilioDevice, currentContact } = get();

    if (!twilioDevice) {
      throw new Error("Twilio device not initialized. Please initialize first.");
    }

    if (!currentContact) {
      throw new Error("No contact selected");
    }

    set({ isConnecting: true, twilioError: null });

    try {
      // First, initiate call via API to get number and track usage
      const initiateResponse = await fetch("/api/twilio/call/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: currentContact.id,
          toNumber: phoneNumber,
        }),
      });

      if (!initiateResponse.ok) {
        const errorData = await initiateResponse.json();
        throw new Error(errorData.error || "Failed to initiate call");
      }

      const { phoneNumber: twilioNumberUsed, twilioCallId } = await initiateResponse.json();
      set({ twilioNumberUsed });

      // Connect call using Twilio Voice SDK
      const params = {
        To: phoneNumber, // Contact's phone number
        From: twilioNumberUsed, // Twilio number to use
      };

      const call = await twilioDevice.connect({ params });

      // Set up call event handlers
      call.on("accept", () => {
        console.log("Call accepted");
        set({
          isConnecting: false,
          isCallActive: true,
          callStartTime: new Date(),
          callDuration: 0,
          twilioCall: call,
          twilioCallSid: call.parameters.CallSid,
        });
        get().startCall();
      });

      call.on("disconnect", () => {
        console.log("Call disconnected");
        const { callStartTime } = get();
        const duration = callStartTime
          ? Math.floor((new Date().getTime() - callStartTime.getTime()) / 1000)
          : 0;
        set({
          isConnecting: false,
          isCallActive: false,
          callDuration: duration,
          twilioCall: null,
        });
        get().endCall();
      });

      call.on("error", (error: any) => {
        console.error("Call error:", error);
        set({
          isConnecting: false,
          isCallActive: false,
          twilioError: error.message || "Call error",
          twilioCall: null,
        });
      });

      call.on("cancel", () => {
        console.log("Call cancelled");
        set({
          isConnecting: false,
          isCallActive: false,
          twilioCall: null,
        });
      });

      // Store call reference
      set({ twilioCall: call });
    } catch (error: any) {
      console.error("Error connecting Twilio call:", error);
      set({
        isConnecting: false,
        isCallActive: false,
        twilioError: error.message || "Failed to connect call",
        twilioCall: null,
      });
      throw error;
    }
  },

  disconnectTwilioCall: () => {
    const { twilioCall } = get();
    if (twilioCall) {
      twilioCall.disconnect();
    }
    set({
      twilioCall: null,
      isConnecting: false,
      isCallActive: false,
    });
    get().endCall();
  },

  setTwilioError: (error) => set({ twilioError: error }),
  setTwilioCallSid: (callSid) => set({ twilioCallSid: callSid }),
  setTwilioNumberUsed: (number) => set({ twilioNumberUsed: number }),

  resetCallState: () => {
    const { currentContact, twilioCall } = get();
    
    // Disconnect any active Twilio call
    if (twilioCall) {
      twilioCall.disconnect();
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
      twilioCall: null,
      twilioError: null,
      twilioCallSid: null,
      twilioNumberUsed: null,
    });
  },
}));
