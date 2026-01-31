"use client";

import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface DaysAgoBadgeProps {
  lastCallAttemptDate: string | null;
}

export function DaysAgoBadge({ lastCallAttemptDate }: DaysAgoBadgeProps) {
  if (!lastCallAttemptDate) {
    return null;
  }

  const date = new Date(lastCallAttemptDate);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  let className = "";

  if (daysAgo <= 2) {
    variant = "default";
    className = "bg-green-500 text-white border-green-600";
  } else if (daysAgo <= 5) {
    variant = "secondary";
    className = "bg-yellow-500 text-white border-yellow-600";
  } else if (daysAgo <= 7) {
    variant = "secondary";
    className = "bg-orange-500 text-white border-orange-600";
  } else {
    variant = "destructive";
    className = "bg-red-500 text-white border-red-600";
  }

  return (
    <Badge variant={variant} className={className}>
      {daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`}
    </Badge>
  );
}
