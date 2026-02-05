"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { insforge } from "@/lib/insforge/client";
import { seedDummyData, clearDummyData } from "@/lib/seed-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, User, Key, Bell, Database, Trash2, Download, AlertTriangle, Mail, Phone, Zap, CheckCircle2, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Profile } from "@/types/database";


export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("user@pezcrm.local");
  const [phone, setPhone] = useState("");
  const [calendarLink, setCalendarLink] = useState("");

  // API Keys
  const [apolloApiKey, setApolloApiKey] = useState("");


  // Cadence Settings
  const [emailsPerWeek, setEmailsPerWeek] = useState(3);
  const [callsPerWeek, setCallsPerWeek] = useState(5);

  // Goals
  const [dailyCallGoal, setDailyCallGoal] = useState(50);
  const [dailyEmailGoal, setDailyEmailGoal] = useState(20);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load profile
        const { data: profileData } = await insforge.database
          .from("profiles")
          .select("*")
          .eq("id", DEFAULT_USER_ID)
          .single();
        
        const profile = profileData as Profile | null;

        if (profile) {
          setFullName(profile.full_name || "");
          setPhone(profile.phone || "");
          setCalendarLink(profile.calendar_link || "");
          setDailyCallGoal(profile.daily_call_goal || 50);
          setDailyEmailGoal(profile.daily_email_goal || 20);
        }

        // Load settings
        const { data: settingsData } = await insforge.database
          .from("user_settings")
          .select("*")
          .eq("user_id", DEFAULT_USER_ID)
          .single();
        
        const settings = settingsData as { apollo_api_key?: string } | null;

        if (settings) {
          setApolloApiKey(settings.apollo_api_key || "");
        }

        // Load cadence settings
        const { data: cadenceData } = await insforge.database
          .from("cadence_settings")
          .select("*")
          .eq("user_id", DEFAULT_USER_ID)
          .single();

        if (cadenceData) {
          setEmailsPerWeek(cadenceData.emails_per_week || 3);
          setCallsPerWeek(cadenceData.calls_per_week || 5);
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update profile
      await insforge.database
        .from("profiles")
        .upsert([{
          id: DEFAULT_USER_ID,
          full_name: fullName,
          email,
          phone,
          calendar_link: calendarLink,
          daily_call_goal: dailyCallGoal,
          daily_email_goal: dailyEmailGoal,
        }]);

      // Update settings
      await insforge.database
        .from("user_settings")
        .upsert([{
          user_id: DEFAULT_USER_ID,
          apollo_api_key: apolloApiKey,
        }]);

      // Update cadence settings
      await insforge.database
        .from("cadence_settings")
        .upsert([{
          user_id: DEFAULT_USER_ID,
          emails_per_week: emailsPerWeek,
          calls_per_week: callsPerWeek,
        }]);

      toast.success("Settings saved!");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const results = await seedDummyData();
      
      if (results.errors.length > 0) {
        console.error("Seed errors:", results.errors);
      }

      toast.success(
        `Created ${results.companies} companies, ${results.contacts} contacts, ${results.calls} calls, and ${results.tasks} tasks!`
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to seed data");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearData = async () => {
    if (!confirm("Are you sure you want to delete ALL data? This cannot be undone.")) {
      return;
    }
    
    setIsClearing(true);
    try {
      await clearDummyData();
      toast.success("All data cleared!");
    } catch (error: any) {
      toast.error(error.message || "Failed to clear data");
    } finally {
      setIsClearing(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Settings" />
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-2xl space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" />
      
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl space-y-6">
          {/* Profile */}
          <Card
            className="opacity-0 animate-fade-in"
            style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
              <CardDescription>
                Your personal information used in emails and calls
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={email} disabled />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="calendarLink">Calendar Link</Label>
                  <Input
                    id="calendarLink"
                    value={calendarLink}
                    onChange={(e) => setCalendarLink(e.target.value)}
                    placeholder="https://calendly.com/..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card 
            id="api"
            className="opacity-0 animate-fade-in"
            style={{ animationDelay: "50ms", animationFillMode: "forwards" }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Connect external services to import leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apolloApiKey">Apollo API Key</Label>
                <Input
                  id="apolloApiKey"
                  type="password"
                  value={apolloApiKey}
                  onChange={(e) => setApolloApiKey(e.target.value)}
                  placeholder="Enter your Apollo API key"
                />
                <p className="text-xs text-muted-foreground">
                  Find your API key in Apollo Settings → API
                </p>
              </div>
            </CardContent>
          </Card>


          {/* Cadence Settings */}
          <Card
            className="opacity-0 animate-fade-in"
            style={{ animationDelay: "125ms", animationFillMode: "forwards" }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Cadence Settings
              </CardTitle>
              <CardDescription>
                Configure your sales outreach cadence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="emailsPerWeek">Emails per Week</Label>
                  <Input
                    id="emailsPerWeek"
                    type="number"
                    min={1}
                    max={14}
                    value={emailsPerWeek}
                    onChange={(e) => setEmailsPerWeek(parseInt(e.target.value) || 3)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Automated via Resend
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="callsPerWeek">Calls per Week</Label>
                  <Input
                    id="callsPerWeek"
                    type="number"
                    min={1}
                    max={20}
                    value={callsPerWeek}
                    onChange={(e) => setCallsPerWeek(parseInt(e.target.value) || 5)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Manual via Power Dialer
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Goals */}
          <Card
            className="opacity-0 animate-fade-in"
            style={{ animationDelay: "150ms", animationFillMode: "forwards" }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Daily Goals
              </CardTitle>
              <CardDescription>
                Set your daily activity targets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dailyCallGoal">Daily Call Goal</Label>
                  <Input
                    id="dailyCallGoal"
                    type="number"
                    min={1}
                    value={dailyCallGoal}
                    onChange={(e) => setDailyCallGoal(parseInt(e.target.value) || 50)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dailyEmailGoal">Daily Email Goal</Label>
                  <Input
                    id="dailyEmailGoal"
                    type="number"
                    min={1}
                    value={dailyEmailGoal}
                    onChange={(e) => setDailyEmailGoal(parseInt(e.target.value) || 20)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Data Management */}
          <Card
            className="opacity-0 animate-fade-in border-amber-500/50"
            style={{ animationDelay: "200ms", animationFillMode: "forwards" }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Management
                <Badge variant="outline" className="text-amber-600 border-amber-600">
                  Dev Only
                </Badge>
              </CardTitle>
              <CardDescription>
                Seed dummy data for testing or clear all data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button 
                  variant="outline" 
                  onClick={handleSeedData} 
                  disabled={isSeeding}
                  className="gap-2"
                >
                  {isSeeding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Seed Dummy Data
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleClearData} 
                  disabled={isClearing}
                  className="gap-2"
                >
                  {isClearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Clear All Data
                </Button>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  Seeding will create 5 companies with 17 contacts, some calls, and tasks.
                  Clearing will delete ALL your data permanently.
                </p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Save */}
          <div 
            className="flex justify-end opacity-0 animate-fade-in"
            style={{ animationDelay: "250ms", animationFillMode: "forwards" }}
          >
            <Button onClick={handleSave} disabled={isSaving} className="press-scale">
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
