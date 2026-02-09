"use client";

import { useDialerStore } from "@/stores/dialer-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Phone, Check, Clock, CalendarClock } from "lucide-react";

function formatCallbackDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  // Short date: "Feb 12"
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CallQueue() {
  const { queue, currentIndex, goToContact } = useDialerStore();

  return (
    <>
      <div className="p-4 border-b">
        <h3 className="font-semibold">Call Queue</h3>
        <p className="text-sm text-muted-foreground">
          {currentIndex + 1} of {queue.length}
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {queue.map((contact, index) => {
            const isCurrent = index === currentIndex;
            const isPast = index < currentIndex;
            const isCallback = contact.cadence_outcome === "callback";
            const callbackLabel = formatCallbackDate(contact.next_action_date);
            const isOverdue = callbackLabel === "Overdue" || callbackLabel === "Today";

            return (
              <button
                key={contact.id}
                onClick={() => goToContact(index)}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-colors",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isPast
                    ? "bg-muted/50 text-muted-foreground"
                    : isCallback
                    ? "bg-yellow-50 dark:bg-yellow-900/10 hover:bg-yellow-100 dark:hover:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/30"
                    : "hover:bg-muted"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                      isCurrent
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : isPast
                        ? "bg-green-100 text-green-600"
                        : isCallback
                        ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isPast ? (
                      <Check className="h-4 w-4" />
                    ) : isCallback ? (
                      <CalendarClock className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {contact.first_name} {contact.last_name}
                    </p>
                    <p
                      className={cn(
                        "text-xs truncate",
                        isCurrent
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {contact.company_name || contact.title || "No company"}
                    </p>
                    {/* Callback indicator */}
                    {isCallback && callbackLabel && !isCurrent && (
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                        <span className={cn(
                          "text-[10px] font-semibold",
                          isOverdue
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-yellow-600 dark:text-yellow-400"
                        )}>
                          Callback {callbackLabel}
                        </span>
                      </div>
                    )}
                    {isCallback && callbackLabel && isCurrent && (
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-primary-foreground/70" />
                        <span className="text-[10px] font-semibold text-primary-foreground/80">
                          Callback {callbackLabel}
                        </span>
                      </div>
                    )}
                  </div>
                  {isCurrent && (
                    <Phone className="h-4 w-4 animate-pulse" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
}
