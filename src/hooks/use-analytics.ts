"use client";

import { useQuery } from "@tanstack/react-query";
import { insforge } from "@/lib/insforge/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  subDays,
  subWeeks,
  format,
  differenceInDays,
} from "date-fns";
import type {
  DailyCallStats,
  WeeklyCallStats,
  HourlyPerformance,
  TimezonePerformance,
  AnalyticsSummary,
  TrendDataPoint,
  OutcomeBreakdown,
  CallingStreak,
  DispositionBreakdown,
  DateRange,
} from "@/types/analytics";

// Get date range bounds
function getDateBounds(range: DateRange, customStart?: string, customEnd?: string) {
  const now = new Date();
  
  switch (range) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday":
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfDay(now) };
    case "last_week":
      const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      return { start: lastWeekStart, end: lastWeekEnd };
    case "this_month":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "last_month":
      const lastMonth = subDays(startOfMonth(now), 1);
      return { start: startOfMonth(lastMonth), end: endOfDay(lastMonth) };
    case "custom":
      return {
        start: customStart ? new Date(customStart) : startOfDay(now),
        end: customEnd ? new Date(customEnd) : endOfDay(now),
      };
    default:
      return { start: startOfDay(now), end: endOfDay(now) };
  }
}

// Main analytics summary hook
export function useAnalyticsSummary(
  range: DateRange = "today",
  customStart?: string,
  customEnd?: string
) {
    const { start, end } = getDateBounds(range, customStart, customEnd);

  return useQuery({
    queryKey: ["analytics-summary", DEFAULT_USER_ID, range, customStart, customEnd],
    queryFn: async (): Promise<AnalyticsSummary> => {
      // Get call stats
      const { data: calls, error: callsError } = await supabase
        .from("calls")
        .select("outcome, duration_seconds, disposition")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", start.toISOString())
        .lte("started_at", end.toISOString());

      if (callsError && callsError.code !== "42P01") throw callsError;

      // Get meetings booked in this period
      const { data: meetings, error: meetingsError } = await supabase
        .from("meetings")
        .select("id")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (meetingsError && meetingsError.code !== "42P01") throw meetingsError;

      const callsList = calls || [];
      const meetingsList = meetings || [];

      const totalCalls = callsList.length;
      const connectedCalls = callsList.filter((c) => c.outcome === "connected").length;
      const voicemails = callsList.filter((c) => c.outcome === "voicemail").length;
      const skipped = callsList.filter((c) => c.outcome === "skipped").length;
      const noAnswers = callsList.filter((c) => c.outcome === "no_answer").length;
      const actualAttempts = totalCalls - skipped;

      const totalTalkTime = callsList
        .filter((c) => c.outcome === "connected")
        .reduce((sum, c) => sum + (c.duration_seconds || 0), 0);

      return {
        totalCalls,
        connectedCalls,
        meetingsBooked: meetingsList.length,
        voicemails,
        skipped,
        noAnswers,
        answerRate: actualAttempts > 0 ? Math.round((connectedCalls / actualAttempts) * 100) : 0,
        setRate: connectedCalls > 0 ? Math.round((meetingsList.length / connectedCalls) * 100) : 0,
        totalTalkTime,
        avgCallDuration: connectedCalls > 0 ? Math.round(totalTalkTime / connectedCalls) : 0,
      };
    },
  });
}

// Daily stats for trend charts
export function useDailyStats(days: number = 14) {
    const end = new Date();
  const start = subDays(end, days);

  return useQuery({
    queryKey: ["daily-stats", DEFAULT_USER_ID, days],
    queryFn: async (): Promise<TrendDataPoint[]> => {
      const { data: calls, error } = await supabase
        .from("calls")
        .select("started_at, outcome")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", start.toISOString())
        .lte("started_at", end.toISOString())
        .order("started_at", { ascending: true });

      if (error && error.code !== "42P01") throw error;

      const { data: meetings } = await supabase
        .from("meetings")
        .select("created_at")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Group by date
      const callsByDate: Record<string, { total: number; connected: number }> = {};
      const meetingsByDate: Record<string, number> = {};

      (calls || []).forEach((call) => {
        const date = format(new Date(call.started_at), "yyyy-MM-dd");
        if (!callsByDate[date]) callsByDate[date] = { total: 0, connected: 0 };
        if (call.outcome !== "skipped") {
          callsByDate[date].total++;
          if (call.outcome === "connected") callsByDate[date].connected++;
        }
      });

      (meetings || []).forEach((meeting) => {
        const date = format(new Date(meeting.created_at), "yyyy-MM-dd");
        meetingsByDate[date] = (meetingsByDate[date] || 0) + 1;
      });

      // Build trend data for each day
      const result: TrendDataPoint[] = [];
      for (let i = 0; i <= days; i++) {
        const date = format(subDays(end, days - i), "yyyy-MM-dd");
        const dayStats = callsByDate[date] || { total: 0, connected: 0 };
        result.push({
          date,
          calls: dayStats.total,
          connected: dayStats.connected,
          meetings: meetingsByDate[date] || 0,
          answerRate: dayStats.total > 0 
            ? Math.round((dayStats.connected / dayStats.total) * 100) 
            : 0,
        });
      }

      return result;
    },
  });
}

// Outcome breakdown for pie chart
export function useOutcomeBreakdown(range: DateRange = "this_week") {
    const { start, end } = getDateBounds(range);

  return useQuery({
    queryKey: ["outcome-breakdown", DEFAULT_USER_ID, range],
    queryFn: async (): Promise<OutcomeBreakdown[]> => {
      const { data: calls, error } = await supabase
        .from("calls")
        .select("outcome")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", start.toISOString())
        .lte("started_at", end.toISOString())
        .neq("outcome", "skipped");

      if (error && error.code !== "42P01") throw error;

      const counts: Record<string, number> = {};
      (calls || []).forEach((call) => {
        counts[call.outcome] = (counts[call.outcome] || 0) + 1;
      });

      const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
      const colors: Record<string, string> = {
        connected: "#22c55e",
        voicemail: "#f59e0b",
        no_answer: "#ef4444",
        busy: "#6366f1",
        gatekeeper: "#8b5cf6",
        wrong_number: "#ec4899",
      };

      return Object.entries(counts).map(([outcome, count]) => ({
        outcome,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        color: colors[outcome] || "#94a3b8",
      }));
    },
  });
}

// Hourly performance for heatmap
export function useHourlyPerformance() {
    return useQuery({
    queryKey: ["hourly-performance", DEFAULT_USER_ID],
    queryFn: async (): Promise<HourlyPerformance[]> => {
      // Query calls from the last 30 days
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      const { data: calls, error } = await supabase
        .from("calls")
        .select("started_at, outcome")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", thirtyDaysAgo.toISOString())
        .neq("outcome", "skipped");

      if (error && error.code !== "42P01") throw error;

      // Group by day of week and hour
      const grid: Record<string, { total: number; connected: number }> = {};
      
      (calls || []).forEach((call) => {
        const date = new Date(call.started_at);
        const dayOfWeek = date.getDay(); // 0-6
        const hour = date.getHours(); // 0-23
        const key = `${dayOfWeek}-${hour}`;
        
        if (!grid[key]) grid[key] = { total: 0, connected: 0 };
        grid[key].total++;
        if (call.outcome === "connected") grid[key].connected++;
      });

      // Convert to array
      const result: HourlyPerformance[] = [];
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${day}-${hour}`;
          const stats = grid[key] || { total: 0, connected: 0 };
          result.push({
            user_id: DEFAULT_USER_ID,
            day_of_week: day,
            hour_of_day: hour,
            total_calls: stats.total,
            connected: stats.connected,
            answer_rate: stats.total > 0 
              ? Math.round((stats.connected / stats.total) * 100) 
              : null,
          });
        }
      }

      return result;
    },
  });
}

// Timezone performance
export function useTimezonePerformance() {
    return useQuery({
    queryKey: ["timezone-performance", DEFAULT_USER_ID],
    queryFn: async (): Promise<TimezonePerformance[]> => {
      const thirtyDaysAgo = subDays(new Date(), 30);

      const { data: calls, error } = await supabase
        .from("calls")
        .select(`
          outcome,
          contacts!inner(timezone)
        `)
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", thirtyDaysAgo.toISOString())
        .neq("outcome", "skipped");

      if (error && error.code !== "42P01") throw error;

      // Group by timezone
      const byTimezone: Record<string, { total: number; connected: number }> = {};
      
      (calls || []).forEach((call: any) => {
        const tz = call.contacts?.timezone || "Unknown";
        if (!byTimezone[tz]) byTimezone[tz] = { total: 0, connected: 0 };
        byTimezone[tz].total++;
        if (call.outcome === "connected") byTimezone[tz].connected++;
      });

      return Object.entries(byTimezone)
        .map(([timezone, stats]) => ({
          user_id: DEFAULT_USER_ID,
          timezone,
          total_calls: stats.total,
          connected: stats.connected,
          answer_rate: stats.total > 0 
            ? Math.round((stats.connected / stats.total) * 100) 
            : null,
        }))
        .sort((a, b) => b.total_calls - a.total_calls);
    },
  });
}

// Disposition breakdown for connected calls
export function useDispositionBreakdown(range: DateRange = "this_week") {
    const { start, end } = getDateBounds(range);

  return useQuery({
    queryKey: ["disposition-breakdown", DEFAULT_USER_ID, range],
    queryFn: async (): Promise<DispositionBreakdown[]> => {
      const { data: calls, error } = await supabase
        .from("calls")
        .select("disposition")
        .eq("user_id", DEFAULT_USER_ID)
        .eq("outcome", "connected")
        .gte("started_at", start.toISOString())
        .lte("started_at", end.toISOString())
        .not("disposition", "is", null);

      if (error && error.code !== "42P01") throw error;

      const counts: Record<string, number> = {};
      (calls || []).forEach((call) => {
        if (call.disposition) {
          counts[call.disposition] = (counts[call.disposition] || 0) + 1;
        }
      });

      const total = Object.values(counts).reduce((sum, c) => sum + c, 0);

      return Object.entries(counts).map(([disposition, count]) => ({
        disposition,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));
    },
  });
}

// Calling streak
export function useCallingStreak() {
    return useQuery({
    queryKey: ["calling-streak", DEFAULT_USER_ID],
    queryFn: async (): Promise<CallingStreak> => {
      // Get all unique calling dates in the last 90 days
      const ninetyDaysAgo = subDays(new Date(), 90);
      
      const { data: calls, error } = await supabase
        .from("calls")
        .select("started_at")
        .eq("user_id", DEFAULT_USER_ID)
        .gte("started_at", ninetyDaysAgo.toISOString())
        .neq("outcome", "skipped")
        .order("started_at", { ascending: false });

      if (error && error.code !== "42P01") throw error;

      // Get unique dates
      const dates = new Set<string>();
      (calls || []).forEach((call) => {
        dates.add(format(new Date(call.started_at), "yyyy-MM-dd"));
      });

      const sortedDates = Array.from(dates).sort().reverse();
      
      // Calculate current streak
      let currentStreak = 0;
      let today = format(new Date(), "yyyy-MM-dd");
      let checkDate = today;
      
      for (let i = 0; i < sortedDates.length; i++) {
        if (sortedDates[i] === checkDate || sortedDates[i] === format(subDays(new Date(checkDate), 1), "yyyy-MM-dd")) {
          currentStreak++;
          checkDate = sortedDates[i];
        } else if (currentStreak === 0 && sortedDates[i] === format(subDays(new Date(), 1), "yyyy-MM-dd")) {
          // Started counting from yesterday
          currentStreak = 1;
          checkDate = sortedDates[i];
        } else {
          break;
        }
      }

      // Calculate longest streak
      let longestStreak = 0;
      let tempStreak = 0;
      const allDates = Array.from(dates).sort();
      
      for (let i = 0; i < allDates.length; i++) {
        if (i === 0) {
          tempStreak = 1;
        } else {
          const diff = differenceInDays(new Date(allDates[i]), new Date(allDates[i - 1]));
          if (diff === 1) {
            tempStreak++;
          } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
          }
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);

      // Days called this month
      const thisMonth = startOfMonth(new Date());
      const daysThisMonth = Array.from(dates).filter(
        (d) => new Date(d) >= thisMonth
      ).length;

      return {
        currentStreak,
        longestStreak,
        lastCallingDate: sortedDates[0] || null,
        totalDaysThisMonth: daysThisMonth,
      };
    },
  });
}

// Week over week comparison
export function useWeekComparison() {
  const thisWeek = useAnalyticsSummary("this_week");
  const lastWeek = useAnalyticsSummary("last_week");

  const isLoading = thisWeek.isLoading || lastWeek.isLoading;
  const error = thisWeek.error || lastWeek.error;

  const data = thisWeek.data && lastWeek.data ? {
    current: thisWeek.data,
    previous: lastWeek.data,
    changes: {
      totalCalls: thisWeek.data.totalCalls - lastWeek.data.totalCalls,
      connectedCalls: thisWeek.data.connectedCalls - lastWeek.data.connectedCalls,
      meetingsBooked: thisWeek.data.meetingsBooked - lastWeek.data.meetingsBooked,
      answerRate: thisWeek.data.answerRate - lastWeek.data.answerRate,
      setRate: thisWeek.data.setRate - lastWeek.data.setRate,
    },
  } : null;

  return { data, isLoading, error };
}
