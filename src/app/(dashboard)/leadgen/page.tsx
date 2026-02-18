"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  BadgeCheck,
  Bug,
  CheckCircle2,
  CreditCard,
  Download,
  Droplets,
  Flame,
  Gauge,
  Hammer,
  Leaf,
  Layers,
  Mail,
  PauseCircle,
  PhoneCall,
  Play,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TrendingUp,
  Users,
} from "lucide-react";

const TARGET_LEADS = 500;
const CONTACTS_PER_COMPANY = 3;
const DEFAULT_CREDIT_BALANCE = 1500;
const DAILY_EMAIL_LIMIT = 1200;
const BASELINE_SCHEDULED = 640;

type IndustryOption = {
  label: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const HOME_SERVICE_INDUSTRIES: IndustryOption[] = [
  { label: "Plumbing", value: "plumbing", description: "Pipe repair & repipes", icon: Droplets },
  { label: "HVAC", value: "hvac", description: "Heating & cooling pros", icon: Flame },
  { label: "Roofing", value: "roofing", description: "Roof repair & storm", icon: Layers },
  { label: "Landscaping", value: "landscaping", description: "Lawn & outdoor care", icon: Leaf },
  { label: "Pest Control", value: "pest_control", description: "Exterminators", icon: Bug },
];

type CompanySizeValue = "1,10" | "11,20" | "21,50" | "51,100" | "custom";

const COMPANY_SIZE_PRESETS: Array<{ label: string; value: CompanySizeValue; description: string; range: [number, number] }> = [
  { label: "1-10", value: "1,10", description: "Owner-led crews", range: [1, 10] },
  { label: "11-20", value: "11,20", description: "2nd crew added", range: [11, 20] },
  { label: "21-50", value: "21,50", description: "Operations manager in place", range: [21, 50] },
  { label: "51-100", value: "51,100", description: "Multi-crew ops", range: [51, 100] },
  { label: "Custom", value: "custom", description: "Pick your own", range: [15, 75] },
];

interface ProgressEvent {
  id: string;
  label: string;
  detail?: string;
  state: "running" | "done" | "error";
  timestamp: number;
}

interface PreviewContact {
  name: string;
  email: string;
  title: string;
  company: string;
  city?: string;
}

const liveMessages = [
  "Syncing filters with Apollo…",
  "Matching decision makers at each company…",
  "Revealing mobile numbers securely…",
  "Saving contacts directly to DucaCRM…",
  "Requesting webhook for phone reveals…",
];

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

const formatDuration = (seconds: number) => {
  if (!seconds) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
};

export default function LeadGenPage() {
  const router = useRouter();
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(HOME_SERVICE_INDUSTRIES.map(i => i.value));
  const [companySizePreset, setCompanySizePreset] = useState<CompanySizeValue>("1,10");
  const [customRange, setCustomRange] = useState<[number, number]>([1, 10]);
  const [dataType, setDataType] = useState<"email" | "email_phone">("email_phone");
  const [useCredits, setUseCredits] = useState(true);
  const [creditBalance, setCreditBalance] = useState(DEFAULT_CREDIT_BALANCE);
  const [addToCampaign, setAddToCampaign] = useState(true);
  const [campaignQueued, setCampaignQueued] = useState(0);

  const [runState, setRunState] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("Ready to run a new batch");
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [previewContacts, setPreviewContacts] = useState<PreviewContact[]>([]);

  const [stats, setStats] = useState({
    leadsGenerated: 0,
    emails: 0,
    phones: 0,
    creditsUsed: 0,
    duration: 0,
  });

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (companySizePreset !== "custom") {
      const preset = COMPANY_SIZE_PRESETS.find(p => p.value === companySizePreset);
      if (preset) {
        setCustomRange(preset.range);
      }
    }
  }, [companySizePreset]);

  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  const estimatedCredits = useMemo(() => {
    if (!useCredits) return 0;
    return dataType === "email_phone" ? TARGET_LEADS : Math.round(TARGET_LEADS * 0.25);
  }, [useCredits, dataType]);

  const estimatedMinutes = useMemo(() => {
    const perLeadSeconds = dataType === "email_phone" ? 2.2 : 1.3;
    return Math.max(5, Math.round((TARGET_LEADS * perLeadSeconds) / 60));
  }, [dataType]);

  const employeeRangeLabel = `${customRange[0]}-${customRange[1]} employees`;

  const campaignImpact = useMemo(() => {
    const projected = campaignQueued + stats.leadsGenerated;
    const totalTomorrow = BASELINE_SCHEDULED + (addToCampaign ? projected : 0);
    const remaining = Math.max(0, DAILY_EMAIL_LIMIT - totalTomorrow);
    return { totalTomorrow, remaining };
  }, [campaignQueued, stats.leadsGenerated, addToCampaign]);

  const resetProgressInterval = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = null;
  };

  const updateEventState = (id: string, state: ProgressEvent["state"], detail?: string) => {
    setProgressEvents(prev => prev.map(event => (event.id === id ? { ...event, state, detail } : event)));
  };

  const handleIndustryToggle = (value: string) => {
    setSelectedIndustries(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const handleCustomRangeChange = (index: 0 | 1, nextValue: number) => {
    setCompanySizePreset("custom");
    setCustomRange(prev => {
      const updated: [number, number] = [...prev] as [number, number];
      updated[index] = Math.min(500, Math.max(1, nextValue));
      if (updated[0] > updated[1]) {
        return index === 0 ? [updated[1], updated[1]] : [updated[0], updated[0]];
      }
      return updated;
    });
  };

  const handleGenerate = async () => {
    if (runState === "running") {
      toast.info("A batch is already running");
      return;
    }

    if (selectedIndustries.length === 0) {
      toast.error("Select at least one industry");
      return;
    }

    if (!useCredits && dataType === "email_phone") {
      toast.warning("Phone reveals require credits. Enable credits or pick Emails Only.");
      return;
    }

    setRunState("running");
    setLatestError(null);
    setPreviewContacts([]);
    setProgress(4);
    setProgressMessage("Queuing Apollo batch…");

    const jobId = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();

    const initialEvent: ProgressEvent = {
      id: jobId,
      label: `Queued ${TARGET_LEADS} leads`,
      state: "running",
      timestamp: startTime,
    };

    setProgressEvents(prev => [initialEvent, ...prev].slice(0, 5));

    const companiesTarget = Math.ceil(TARGET_LEADS / CONTACTS_PER_COMPANY);

    resetProgressInterval();
    progressInterval.current = setInterval(() => {
      setProgress(current => (current >= 92 ? current : Math.min(92, current + Math.random() * 6)));
      setProgressMessage(liveMessages[Math.floor(Math.random() * liveMessages.length)]);
    }, 2400);

    try {
      const response = await fetch("/api/leads/apollo/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: selectedIndustries,
          maxCompanies: companiesTarget,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Lead generation failed");
      }

      resetProgressInterval();
      setProgress(100);
      setProgressMessage("Batch completed");

      const duration = data.stats?.duration || Math.round((Date.now() - startTime) / 1000);
      setStats({
        leadsGenerated: data.stats?.contactsSaved || 0,
        emails: data.stats?.contactsSaved || 0,
        phones: data.stats?.mobilesFound || 0,
        creditsUsed: data.stats?.creditsUsed || 0,
        duration,
      });
      setPreviewContacts(data.preview || []);

      if (useCredits) {
        setCreditBalance(prev => Math.max(0, prev - (data.stats?.creditsUsed || estimatedCredits)));
      }

      if (addToCampaign) {
        setCampaignQueued(prev => prev + (data.stats?.contactsSaved || 0));
      }

      updateEventState(jobId, "done", `${data.stats?.contactsSaved || 0} leads saved`);
      setRunState("completed");
      toast.success(`Saved ${data.stats?.contactsSaved || 0} leads to DucaCRM`);
    } catch (error: any) {
      resetProgressInterval();
      setProgress(8);
      setRunState("error");
      setProgressMessage("Batch failed");
      setLatestError(error.message);
      updateEventState(jobId, "error", error.message);
      toast.error(error.message || "Lead generation failed");
    }
  };

  const handleExport = () => {
    window.open("/api/leads/export?format=csv", "_blank");
    toast.info("Export started – check your downloads");
  };

  const goToDialer = () => router.push("/dialer");
  const goToTemplates = () => router.push("/templates");

  const running = runState === "running";

  return (
    <div className="flex h-full flex-col">
      <Header title="Apollo Lead Generation" showSearch={false} />
      <div className="flex-1 space-y-6 overflow-auto p-6">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Sparkles className="h-6 w-6 text-primary" />
                One-Click Mass Generation
              </CardTitle>
              <CardDescription>
                Generate a 500-lead batch, monitor progress in real time, and auto-route contacts into tomorrow’s outreach.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                Estimated time: ~{estimatedMinutes} min
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Estimated credits: {estimatedCredits}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" className="gap-2" onClick={handleGenerate} disabled={running}>
                {running ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {running ? "Batch Running" : `Generate ${TARGET_LEADS} Leads`}
              </Button>
              <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                <span>
                  <TimerReset className="mr-1 inline h-4 w-4" />
                  {running ? "Live" : "Last"} duration: {stats.duration ? formatDuration(stats.duration) : "--"}
                </span>
                <span>
                  <CreditCard className="mr-1 inline h-4 w-4" />
                  Credits used: {stats.creditsUsed || 0}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{progressMessage}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {progressEvents.map(event => (
                <div key={event.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{event.label}</p>
                    <p className="text-muted-foreground">{event.detail || new Date(event.timestamp).toLocaleTimeString()}</p>
                  </div>
                  {event.state === "running" && <Badge variant="secondary">Running</Badge>}
                  {event.state === "done" && <Badge className="bg-green-600 text-white">Done</Badge>}
                  {event.state === "error" && <Badge variant="destructive">Error</Badge>}
                </div>
              ))}
            </div>

            {latestError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mr-2 inline h-4 w-4" />
                {latestError}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Industry Selector
                </CardTitle>
                <CardDescription>Select the home-service verticals you want to target. "All Home Services" activates every card.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIndustries(HOME_SERVICE_INDUSTRIES.map(i => i.value))}>
                  Select All
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIndustries([])}>
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {HOME_SERVICE_INDUSTRIES.map(industry => {
                const Icon = industry.icon;
                const active = selectedIndustries.includes(industry.value);
                return (
                  <button
                    key={industry.value}
                    onClick={() => handleIndustryToggle(industry.value)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition hover:border-primary",
                      active ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", active ? "bg-primary text-primary-foreground" : "bg-muted") }>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold">{industry.label}</p>
                        <p className="text-xs text-muted-foreground">{industry.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Company Size Controls
              </CardTitle>
              <CardDescription>Pick preset employee buckets or set a custom min/max.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {COMPANY_SIZE_PRESETS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setCompanySizePreset(option.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left",
                      companySizePreset === option.value ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <p className="font-semibold">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">Min employees</p>
                  <Input
                    type="number"
                    value={customRange[0]}
                    onChange={e => handleCustomRangeChange(0, Number(e.target.value))}
                    min={1}
                    max={customRange[1]}
                  />
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">Max employees</p>
                  <Input
                    type="number"
                    value={customRange[1]}
                    onChange={e => handleCustomRangeChange(1, Number(e.target.value))}
                    min={customRange[0]}
                    max={500}
                  />
                </div>
              </div>
              <Badge variant="secondary" className="w-full justify-center py-1 text-xs">
                {employeeRangeLabel}
              </Badge>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Data Type Options
              </CardTitle>
              <CardDescription>Choose what contact data to harvest from Apollo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                className={cn(
                  "w-full rounded-lg border p-3 text-left",
                  dataType === "email" ? "border-primary bg-primary/5" : "border-border"
                )}
                onClick={() => setDataType("email")}
              >
                <p className="font-semibold">Emails Only</p>
                <p className="text-xs text-muted-foreground">Zero credits. Public & verified emails only.</p>
              </button>
              <button
                className={cn(
                  "w-full rounded-lg border p-3 text-left",
                  dataType === "email_phone" ? "border-primary bg-primary/5" : "border-border"
                )}
                onClick={() => setDataType("email_phone")}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Emails + Phone Numbers</p>
                    <p className="text-xs text-muted-foreground">Unlock mobile & direct lines. Credits required.</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary">+{estimatedCredits} credits</Badge>
                </div>
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Credit Management
              </CardTitle>
              <CardDescription>Decide whether to spend credits on this batch.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Use Credits</p>
                  <p className="text-xs text-muted-foreground">Current balance: {formatNumber(creditBalance)} credits</p>
                </div>
                <button
                  onClick={() => setUseCredits(v => !v)}
                  className={cn(
                    "relative flex h-6 w-12 items-center rounded-full transition",
                    useCredits ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white transition",
                      useCredits ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {useCredits ? (
                  <>
                    Estimated spend: {estimatedCredits} credits · Remaining after run: {formatNumber(Math.max(0, creditBalance - estimatedCredits))}
                  </>
                ) : (
                  <>Free mode enabled. We’ll keep the batch to email-only data.</>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Email Campaign Integration
              </CardTitle>
              <CardDescription>Auto-add generated leads to tomorrow’s drip.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-3 text-sm font-medium">
                <Checkbox checked={addToCampaign} onCheckedChange={value => setAddToCampaign(Boolean(value))} />
                Add to tomorrow’s campaign
              </label>
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                <p>Projected send tomorrow: {campaignImpact.totalTomorrow}/{DAILY_EMAIL_LIMIT}</p>
                <p>Remaining capacity: {campaignImpact.remaining} emails</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Progress & Results
              </CardTitle>
              <CardDescription>Live stats from the latest Apollo batch.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Leads found</p>
                <p className="text-2xl font-semibold">{formatNumber(stats.leadsGenerated)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Emails collected</p>
                <p className="text-2xl font-semibold">{formatNumber(stats.emails)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Phone numbers</p>
                <p className="text-2xl font-semibold">{formatNumber(stats.phones)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Credits spent</p>
                <p className="text-2xl font-semibold">{formatNumber(stats.creditsUsed)}</p>
              </div>
            </CardContent>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" className="gap-2" onClick={() => toast.info("Test email queued for tomorrow morning")}
                >
                  <Mail className="h-4 w-4" />
                  Send Test Email
                </Button>
                <Button variant="outline" className="gap-2" onClick={goToDialer}>
                  <PhoneCall className="h-4 w-4" />
                  Start Calling
                </Button>
                <Button variant="outline" className="gap-2" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button variant="ghost" className="gap-2" onClick={goToTemplates}>
                  <BadgeCheck className="h-4 w-4" />
                  View Email Templates
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest Contacts Preview</CardTitle>
              <CardDescription>
                A quick peek at the last 10 contacts we saved. Full list lives in Companies & Contacts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previewContacts.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Run a batch to see fresh contacts here.
                </div>
              ) : (
                <ScrollArea className="h-72 pr-3">
                  <div className="space-y-3">
                    {previewContacts.slice(0, 10).map(contact => (
                      <div key={`${contact.email}-${contact.company}`} className="rounded-lg border p-3 text-sm">
                        <p className="font-semibold">{contact.name}</p>
                        <p className="text-muted-foreground">{contact.title} · {contact.company}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <Mail className="h-3 w-3" />
                          {contact.email || "Pending reveal"}
                        </div>
                        {contact.city && (
                          <p className="text-xs text-muted-foreground">{contact.city}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
