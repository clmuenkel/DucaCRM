"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { TodayTasks } from "@/components/dashboard/today-tasks";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { PipelineOverview } from "@/components/dashboard/pipeline-overview";
import { MeetingsWidget } from "@/components/dashboard/meetings-widget";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Download, Target, BarChart3, Users, ListTodo } from "lucide-react";
import Link from "next/link";
import { useDailyTargets, useUpdateTarget } from "@/hooks/use-targets";
import { InlineEditableTarget } from "@/components/dashboard/editable-target";
import { insforge } from "@/lib/neon/client";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const greeting = getGreeting();
  const { data: targets } = useDailyTargets();
  const updateTarget = useUpdateTarget();
  const [leadCounts, setLeadCounts] = useState({ total: 0, toBework: 0 });

  const handleUpdateCallsTarget = async (value: number) => {
    await updateTarget.mutateAsync({
      targetType: "daily",
      updates: { calls_target: value },
    });
  };

  useEffect(() => {
    const loadLeadCounts = async () => {
      const { count: total } = await insforge.database
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", DEFAULT_USER_ID)
        .eq("status", "active");

      const { count: toBework } = await insforge.database
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", DEFAULT_USER_ID)
        .eq("status", "active")
        .or("cadence_status.is.null,cadence_status.eq.none");

      setLeadCounts({ total: total || 0, toBework: toBework || 0 });
    };

    loadLeadCounts();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Greeting & Quick Actions */}
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-0 animate-fade-in"
          style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
        >
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{greeting}!</h2>
            <p className="text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Today's target:{" "}
              <InlineEditableTarget
                value={targets?.calls_target || 50}
                suffix=" calls"
                onSave={handleUpdateCallsTarget}
                isPending={updateTarget.isPending}
              />
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dialer">
              <Button size="lg" className="gap-2 shadow-lg shadow-primary/25 press-scale">
                <Zap className="h-5 w-5" />
                Start Calling
              </Button>
            </Link>
            <Link href="/analytics">
              <Button size="lg" variant="outline" className="gap-2 press-scale">
                <BarChart3 className="h-5 w-5" />
                Analytics
              </Button>
            </Link>
            <Link href="/import">
              <Button size="lg" variant="outline" className="gap-2 press-scale">
                <Download className="h-5 w-5" />
                Import Leads
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div 
          className="grid gap-4 grid-cols-1 md:grid-cols-2 opacity-0 animate-fade-in"
          style={{ animationDelay: "25ms", animationFillMode: "forwards" }}
        >
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                  <p className="text-2xl font-bold">{leadCounts.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <ListTodo className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">To Bework</p>
                  <p className="text-2xl font-bold">{leadCounts.toBework}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div 
          className="opacity-0 animate-fade-in"
          style={{ animationDelay: "50ms", animationFillMode: "forwards" }}
        >
          <StatsCards />
        </div>

        {/* Pipeline Overview */}
        <div 
          className="opacity-0 animate-fade-in"
          style={{ animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <PipelineOverview />
        </div>

        {/* Three Column Layout */}
        <div 
          className="grid gap-6 lg:grid-cols-3 opacity-0 animate-fade-in"
          style={{ animationDelay: "150ms", animationFillMode: "forwards" }}
        >
          <TodayTasks />
          <MeetingsWidget userId={DEFAULT_USER_ID} />
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
