export const OUTREACH_STATES = [
  "fresh",
  "emailed",
  "email_follow_up",
  "called_no_answer",
  "call_connected",
  "call_back_scheduled",
  "meeting_booked",
  "email_replied",
  "dead",
] as const;

export type OutreachState = (typeof OUTREACH_STATES)[number];

const TRANSITION_MAP: Record<OutreachState, OutreachState[]> = {
  fresh: ["emailed", "called_no_answer", "call_connected", "dead"],
  emailed: ["email_follow_up", "called_no_answer", "call_connected", "dead"],
  email_follow_up: ["called_no_answer", "call_connected", "dead"],
  called_no_answer: ["call_connected", "emailed", "dead"],
  call_connected: ["call_back_scheduled", "meeting_booked", "dead"],
  call_back_scheduled: ["call_connected", "dead"],
  meeting_booked: [],
  email_replied: ["call_connected", "meeting_booked", "dead"],
  dead: [],
};

const EMAIL_BLOCKED_STATES: OutreachState[] = [
  "call_connected",
  "meeting_booked",
  "dead",
  "email_replied",
];

const CALL_BLOCKED_STATES: OutreachState[] = ["meeting_booked", "dead", "email_replied"];

const NEXT_ACTION_RULES: Record<OutreachState, { action: string; usesFollowUpDate?: boolean }> = {
  fresh: { action: "call_or_email_immediately" },
  emailed: { action: "schedule_email_follow_up", usesFollowUpDate: true },
  email_follow_up: { action: "call_lead" },
  called_no_answer: { action: "call_back", usesFollowUpDate: true },
  call_connected: { action: "advance_toward_meeting" },
  call_back_scheduled: { action: "call_back", usesFollowUpDate: true },
  meeting_booked: { action: "prepare_for_meeting", usesFollowUpDate: true },
  email_replied: { action: "respond_to_reply" },
  dead: { action: "no_action" },
};

function isOutreachState(value: string | null | undefined): value is OutreachState {
  return !!value && (OUTREACH_STATES as readonly string[]).includes(value);
}

function toOutreachState(value: string | null | undefined): OutreachState | null {
  return isOutreachState(value) ? value : null;
}

function normalizeState(value: string | null | undefined): OutreachState {
  return toOutreachState(value) || "fresh";
}

export function canTransition(currentState: string, event: string): boolean {
  const fromState = normalizeState(currentState);
  if (!isOutreachState(event)) {
    return false;
  }
  const allowedTargets = TRANSITION_MAP[fromState] ?? [];
  return allowedTargets.includes(event);
}

export function shouldSendEmail(outreachLock: string | null, allowOverride: boolean): boolean {
  if (allowOverride) {
    return true;
  }
  const state = toOutreachState(outreachLock);
  if (!state) {
    return true;
  }
  return !EMAIL_BLOCKED_STATES.includes(state);
}

export function shouldCall(outreachLock: string | null): boolean {
  const state = toOutreachState(outreachLock);
  if (!state) {
    return true;
  }
  return !CALL_BLOCKED_STATES.includes(state);
}

export function getNextAction(
  stage: string,
  followUpDate: string | null
): { action: string; dueDate: string | null } {
  const state = normalizeState(stage);
  const rule = NEXT_ACTION_RULES[state];
  return {
    action: rule.action,
    dueDate: rule.usesFollowUpDate ? followUpDate : null,
  };
}

export function getAllowedTransitions(currentState: string): OutreachState[] {
  const state = normalizeState(currentState);
  return [...(TRANSITION_MAP[state] ?? [])];
}
