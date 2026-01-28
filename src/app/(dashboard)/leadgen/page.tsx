"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Search,
  Building2,
  Users,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Globe,
  Phone,
  Mail,
  Sparkles,
  RefreshCw,
  Play,
  TestTube,
  User,
  Building,
  XCircle,
  ShieldCheck,
  ShieldQuestion,
  ShieldAlert,
  Linkedin,
  BadgeCheck,
  HelpCircle,
} from "lucide-react";

// Home services industries
const INDUSTRIES = [
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "solar", label: "Solar & Renewables" },
  { value: "construction", label: "General Contractors" },
];

interface TestResult {
  service: string;
  status: "pass" | "fail" | "skip";
  message: string;
}

interface LeadCompany {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  industry_tag: string | null;
  enrichment_status: string;
  contact_type: string;
  fallback_email: string | null;
  fallback_phone: string | null;
  lead_people?: LeadPerson[];
}

interface LeadPerson {
  id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  email_status: string;
  email_verified: boolean;
  phone: string | null;
  linkedin_url: string | null;
  confidence_score: number;
  is_primary_contact: boolean;
  source: string;
  quality_badge: string;
  needs_manual_review: boolean;
}

type StepStatus = "idle" | "loading" | "done" | "error";

export default function LeadGenPage() {
  // Search params
  const [industry, setIndustry] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [maxCompanies, setMaxCompanies] = useState<number>(20);
  
  // API test status
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testPassed, setTestPassed] = useState<boolean | null>(null);
  
  // Pipeline status
  const [pipelineStatus, setPipelineStatus] = useState<StepStatus>("idle");
  const [pipelineProgress, setPipelineProgress] = useState<string>("");
  
  // Individual step status (for manual mode)
  const [placesStatus, setPlacesStatus] = useState<StepStatus>("idle");
  const [enrichStatus, setEnrichStatus] = useState<StepStatus>("idle");
  const [scrapeStatus, setScrapeStatus] = useState<StepStatus>("idle");
  const [verifyStatus, setVerifyStatus] = useState<StepStatus>("idle");
  
  // Stats
  const [stats, setStats] = useState({
    companiesFound: 0,
    companiesWithDM: 0,
    companiesWithFallback: 0,
    peopleFound: 0,
    pendingEnrich: 0,
  });
  
  // Results
  const [companies, setCompanies] = useState<LeadCompany[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  
  // Selection for import
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  
  // Filter
  const [contactFilter, setContactFilter] = useState<"all" | "dm_verified" | "dm_guessed" | "fallback" | "needs_review">("all");
  
  // Manual review dialog
  const [reviewCompany, setReviewCompany] = useState<LeadCompany | null>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewPhone, setReviewPhone] = useState("");
  
  // Bulk Apollo extraction
  const [bulkIndustries, setBulkIndustries] = useState<string[]>([]);
  const [bulkLocations, setBulkLocations] = useState<string>(""); // Comma or newline separated
  const [bulkMaxCompanies, setBulkMaxCompanies] = useState<number>(20);
  const [bulkStatus, setBulkStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [bulkProgress, setBulkProgress] = useState<string>("");
  const [bulkProgressPercent, setBulkProgressPercent] = useState<number>(0);
  const [bulkStartTime, setBulkStartTime] = useState<number | null>(null);
  const [bulkStats, setBulkStats] = useState<{
    locationsSearched: number;
    companiesFound: number;
    companiesEnriched: number;
    contactsSaved: number;
    creditsUsed: number;
    duration?: number;
  } | null>(null);

  // Company Discovery (simple Places search)
  const [discoverIndustry, setDiscoverIndustry] = useState<string>("");
  const [discoverLocation, setDiscoverLocation] = useState<string>("");
  const [discoveredCompanies, setDiscoveredCompanies] = useState<Array<{
    name: string;
    website: string | null;
    domain: string | null;
    phone: string | null;
    address: string;
    city: string;
    state: string;
  }>>([]);
  const [discoverStatus, setDiscoverStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [discoverNextToken, setDiscoverNextToken] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Company Discovery handlers
  const handleDiscover = async (loadMore = false) => {
    if (!discoverIndustry || !discoverLocation) {
      toast.error("Please select an industry and enter a location");
      return;
    }

    setDiscoverStatus("loading");
    
    try {
      const response = await fetch("/api/leads/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: discoverIndustry,
          location: discoverLocation,
          pageToken: loadMore ? discoverNextToken : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Discovery failed");
      }

      if (loadMore) {
        setDiscoveredCompanies(prev => [...prev, ...data.companies]);
      } else {
        setDiscoveredCompanies(data.companies);
      }
      
      setDiscoverNextToken(data.nextPageToken);
      setDiscoverStatus("done");
      toast.success(`Found ${data.count} companies`);
      
    } catch (error: any) {
      toast.error(error.message);
      setDiscoverStatus("error");
    }
  };

  const copyCompanyName = (name: string, index: number) => {
    navigator.clipboard.writeText(name);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const loadCompanies = async () => {
    setIsLoadingCompanies(true);
    try {
      const params = new URLSearchParams();
      if (industry) params.set("industry", industry);
      params.set("limit", "200");
      
      const response = await fetch(`/api/leads/places/search?${params}`);
      const data = await response.json();
      
      if (data.companies) {
        setCompanies(data.companies);
        
        // Update stats
        const enriched = data.companies.filter((c: LeadCompany) => c.enrichment_status === "enriched").length;
        const withDM = data.companies.filter((c: LeadCompany) => c.contact_type === "dm").length;
        const withFallback = data.companies.filter((c: LeadCompany) => c.contact_type === "fallback").length;
        const pending = data.companies.filter((c: LeadCompany) => 
          ["pending", "no_match"].includes(c.enrichment_status)
        ).length;
        
        setStats(prev => ({
          ...prev,
          companiesFound: data.companies.length,
          companiesWithDM: withDM,
          companiesWithFallback: withFallback,
          pendingEnrich: pending,
        }));
      }
    } catch (error) {
      console.error("Error loading companies:", error);
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  // Test API connections
  const handleTestAPIs = async () => {
    setIsTesting(true);
    setTestResults([]);
    setTestPassed(null);
    
    try {
      const response = await fetch("/api/leads/test");
      const data = await response.json();
      
      setTestResults(data.results || []);
      setTestPassed(data.overall === "pass");
      
      if (data.overall === "pass") {
        toast.success("All API connections verified!");
      } else if (data.overall === "fail") {
        toast.error("Some API connections failed - check results below");
      } else {
        toast.warning("Some APIs skipped due to missing keys");
      }
    } catch (error: any) {
      toast.error(`Test failed: ${error.message}`);
      setTestPassed(false);
    } finally {
      setIsTesting(false);
    }
  };

  // Run full pipeline
  const handleRunPipeline = async () => {
    if (!industry || !location) {
      toast.error("Please select an industry and enter a location");
      return;
    }

    setPipelineStatus("loading");
    setPipelineProgress("Starting pipeline...");
    
    try {
      const response = await fetch("/api/leads/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, location, maxCompanies }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Pipeline failed");
      }
      
      toast.success(data.message);
      setStats({
        companiesFound: data.stats.companiesFound,
        companiesWithDM: data.stats.companiesWithDM,
        companiesWithFallback: data.stats.companiesWithFallback,
        peopleFound: data.stats.totalPeopleFound,
        pendingEnrich: 0,
      });
      
      setPipelineStatus("done");
      setPipelineProgress("Pipeline completed!");
      
      // Reload companies list
      await loadCompanies();
      
    } catch (error: any) {
      toast.error(error.message);
      setPipelineStatus("error");
      setPipelineProgress(`Error: ${error.message}`);
    }
  };

  // Manual Places search
  const handlePlacesSearch = async () => {
    if (!industry || !location) {
      toast.error("Please select an industry and enter a location");
      return;
    }

    setPlacesStatus("loading");
    
    try {
      const response = await fetch("/api/leads/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, location }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }
      
      toast.success(data.message);
      setStats(prev => ({
        ...prev,
        companiesFound: prev.companiesFound + data.stats.inserted,
      }));
      
      setPlacesStatus("done");
      await loadCompanies();
      
    } catch (error: any) {
      toast.error(error.message);
      setPlacesStatus("error");
    }
  };

  // Manual Apollo enrichment
  const handleApolloEnrich = async () => {
    setEnrichStatus("loading");
    
    try {
      const response = await fetch("/api/leads/apollo/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          industry: industry || undefined,
          limit: 50,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Enrichment failed");
      }
      
      toast.success(`Enriched ${data.stats.enriched} companies, found ${data.stats.peopleFound} contacts`);
      setStats(prev => ({
        ...prev,
        companiesWithDM: prev.companiesWithDM + data.stats.enriched,
        peopleFound: prev.peopleFound + data.stats.peopleFound,
      }));
      
      setEnrichStatus("done");
      await loadCompanies();
      
    } catch (error: any) {
      toast.error(error.message);
      setEnrichStatus("error");
    }
  };

  // Manual scrape
  const handleScrape = async () => {
    setScrapeStatus("loading");
    
    try {
      const response = await fetch("/api/leads/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Scraping failed");
      }
      
      toast.success(`Scraped ${data.stats.scraped} companies, found ${data.stats.peopleFound} contacts`);
      setStats(prev => ({
        ...prev,
        peopleFound: prev.peopleFound + data.stats.peopleFound,
      }));
      
      setScrapeStatus("done");
      await loadCompanies();
      
    } catch (error: any) {
      toast.error(error.message);
      setScrapeStatus("error");
    }
  };

  // Verify guessed emails
  const handleVerifyEmails = async () => {
    setVerifyStatus("loading");
    
    try {
      const response = await fetch("/api/leads/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }
      
      toast.success(`Verified ${data.stats.processed} emails: ${data.stats.verified} valid, ${data.stats.invalid} invalid`);
      
      setVerifyStatus("done");
      await loadCompanies();
      
    } catch (error: any) {
      toast.error(error.message);
      setVerifyStatus("error");
    }
  };


  // Export CSV
  const handleExport = async () => {
    const params = new URLSearchParams();
    if (industry) params.set("industry", industry);
    params.set("format", "csv");
    
    window.open(`/api/leads/export?${params}`, "_blank");
    toast.success("Export started - check your downloads");
  };

  // Bulk Apollo extraction
  const handleBulkExtraction = async () => {
    if (bulkIndustries.length === 0) {
      toast.error("Please select at least one industry");
      return;
    }

    setBulkStatus("loading");
    setBulkProgress("Starting bulk extraction...");
    setBulkProgressPercent(0);
    setBulkStats(null);
    setBulkStartTime(Date.now());

    // Parse locations (comma or newline separated)
    const locations = bulkLocations
      .split(/[,\n]/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Estimated time: ~1.5 seconds per company (3 contacts * 400ms enrichment + overhead)
    const estimatedDuration = bulkMaxCompanies * 1.5 * 1000; // milliseconds
    
    // Start progress simulation
    const progressInterval = setInterval(() => {
      setBulkProgressPercent(prev => {
        if (prev >= 95) return prev; // Cap at 95% until complete
        const elapsed = Date.now() - (bulkStartTime || Date.now());
        const estimatedProgress = Math.min(95, (elapsed / estimatedDuration) * 100);
        return Math.max(prev, estimatedProgress);
      });
      
      // Update progress message
      setBulkProgress(prev => {
        const messages = [
          "Searching Google Places for companies...",
          "Finding home services contractors...",
          "Looking up decision makers in Apollo...",
          "Enriching contacts...",
          "Saving verified contacts...",
        ];
        const idx = Math.floor(Math.random() * messages.length);
        return messages[idx];
      });
    }, 2000);

    try {
      const response = await fetch("/api/leads/apollo/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industries: bulkIndustries,
          locations: locations.length > 0 ? locations : undefined, // Use defaults if empty
          maxCompanies: bulkMaxCompanies,
        }),
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Bulk extraction failed");
      }

      setBulkProgressPercent(100);
      setBulkStats({
        locationsSearched: data.stats.locationsSearched,
        companiesFound: data.stats.companiesFound,
        companiesEnriched: data.stats.companiesEnriched,
        contactsSaved: data.stats.contactsSaved,
        creditsUsed: data.stats.creditsUsed,
        duration: data.stats.duration,
      });
      setBulkStatus("done");
      setBulkProgress(`Completed in ${data.stats.duration}s`);
      toast.success(data.message);

      // Refresh companies list
      await loadCompanies();

    } catch (error: any) {
      clearInterval(progressInterval);
      toast.error(error.message);
      setBulkStatus("error");
      setBulkProgress(error.message);
      setBulkProgressPercent(0);
    }
  };

  // Toggle industry selection for bulk extraction
  const toggleBulkIndustry = (ind: string) => {
    setBulkIndustries(prev => 
      prev.includes(ind) 
        ? prev.filter(i => i !== ind)
        : [...prev, ind]
    );
  };

  // Select all industries
  const selectAllIndustries = () => {
    setBulkIndustries(INDUSTRIES.map(i => i.value));
  };

  // Clear all industries
  const clearAllIndustries = () => {
    setBulkIndustries([]);
  };

  const getStatusIcon = (status: StepStatus) => {
    switch (status) {
      case "loading":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  // Get quality badge display info
  const getQualityBadge = (badge: string | undefined, emailStatus: string, confidence: number, source: string) => {
    // If we have a quality_badge from DB, use it; otherwise compute
    const computedBadge = badge || (() => {
      if (source?.includes("apollo") && emailStatus === "found") return "verified_dm";
      if (emailStatus === "verified" || confidence >= 70) return "likely_dm";
      if (emailStatus === "found" || (emailStatus === "guessed" && confidence >= 50)) return "unverified";
      return "needs_review";
    })();

    switch (computedBadge) {
      case "verified_dm":
        return {
          label: "Verified DM",
          variant: "default" as const,
          icon: ShieldCheck,
          color: "text-green-500",
          description: "Confirmed decision maker from Apollo",
        };
      case "likely_dm":
        return {
          label: "Likely DM",
          variant: "secondary" as const,
          icon: BadgeCheck,
          color: "text-blue-500",
          description: "Name found, email verified",
        };
      case "unverified":
        return {
          label: "Unverified",
          variant: "outline" as const,
          icon: ShieldQuestion,
          color: "text-yellow-500",
          description: "Email guessed, needs verification",
        };
      case "needs_review":
      default:
        return {
          label: "Review",
          variant: "destructive" as const,
          icon: ShieldAlert,
          color: "text-red-500",
          description: "Low confidence, manual check needed",
        };
    }
  };

  const getBestContact = (company: LeadCompany): { 
    name: string; 
    email: string | null; 
    phone: string | null; 
    title: string | null; 
    isDM: boolean;
    linkedinUrl: string | null;
    qualityBadge: ReturnType<typeof getQualityBadge>;
    emailStatus: string;
    source: string;
    confidence: number;
  } => {
    const people = company.lead_people || [];
    
    // Find primary or highest confidence person
    let bestPerson = people.find(p => p.is_primary_contact);
    if (!bestPerson && people.length > 0) {
      bestPerson = people.reduce((best, current) => 
        (current.confidence_score || 0) > (best?.confidence_score || 0) ? current : best
      , people[0]);
    }
    
    if (bestPerson?.email) {
      const badge = getQualityBadge(
        bestPerson.quality_badge, 
        bestPerson.email_status,
        bestPerson.confidence_score,
        bestPerson.source
      );
      return {
        name: bestPerson.full_name,
        email: bestPerson.email,
        phone: bestPerson.phone || company.fallback_phone || company.phone,
        title: bestPerson.title,
        isDM: true,
        linkedinUrl: bestPerson.linkedin_url,
        qualityBadge: badge,
        emailStatus: bestPerson.email_status,
        source: bestPerson.source,
        confidence: bestPerson.confidence_score,
      };
    }
    
    // Fallback
    const fallbackBadge = getQualityBadge(undefined, "guessed", 20, "fallback");
    return {
      name: "Owner",
      email: company.fallback_email,
      phone: company.fallback_phone || company.phone,
      title: "Owner",
      isDM: false,
      linkedinUrl: null,
      qualityBadge: fallbackBadge,
      emailStatus: "guessed",
      source: "fallback",
      confidence: 20,
    };
  };

  const toggleCompanySelection = (companyId: string) => {
    setSelectedCompanies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const filtered = filteredCompanies;
    const allSelected = filtered.every(c => selectedCompanies.has(c.id));
    
    if (allSelected) {
      // Deselect all
      setSelectedCompanies(new Set());
    } else {
      // Select all visible
      setSelectedCompanies(new Set(filtered.map(c => c.id)));
    }
  };

  // Filter companies based on contact type
  const filteredCompanies = companies.filter(c => {
    if (contactFilter === "all") return true;
    if (contactFilter === "needs_review") {
      // Show companies with low confidence or no DM
      const people = c.lead_people || [];
      const bestPerson = people.find(p => p.is_primary_contact) || people[0];
      if (!bestPerson) return true;
      return (bestPerson.confidence_score || 0) < 50 || bestPerson.email_status === "guessed";
    }
    return c.contact_type === contactFilter;
  });
  
  // Get companies needing review
  const needsReviewCount = companies.filter(c => {
    const people = c.lead_people || [];
    const bestPerson = people.find(p => p.is_primary_contact) || people[0];
    if (!bestPerson) return true;
    return (bestPerson.confidence_score || 0) < 50 || bestPerson.email_status === "guessed";
  }).length;
  
  // Handle manual review submission
  const handleManualReview = async () => {
    if (!reviewCompany) return;
    
    try {
      // Update the lead person with manually entered info
      const response = await fetch("/api/leads/manual-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: reviewCompany.id,
          ownerName: reviewName,
          email: reviewEmail,
          phone: reviewPhone,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Update failed");
      }
      
      toast.success("Contact updated successfully!");
      setReviewCompany(null);
      setReviewName("");
      setReviewEmail("");
      setReviewPhone("");
      await loadCompanies();
      
    } catch (error: any) {
      toast.error(error.message);
    }
  };
  
  // Open review dialog for a company
  const openReviewDialog = (company: LeadCompany) => {
    const contact = getBestContact(company);
    setReviewCompany(company);
    setReviewName(contact.name === "Owner" ? "" : contact.name);
    setReviewEmail(contact.email?.includes("info@") ? "" : (contact.email || ""));
    setReviewPhone(contact.phone || "");
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Lead Generation" />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* API Test Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TestTube className="h-5 w-5" />
                  API Connection Test
                </CardTitle>
                <CardDescription>
                  Verify your API keys work before running the pipeline
                </CardDescription>
              </div>
              <Button 
                onClick={handleTestAPIs}
                disabled={isTesting}
                variant={testPassed === true ? "outline" : "default"}
                className="gap-2"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : testPassed === true ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : testPassed === false ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <TestTube className="h-4 w-4" />
                )}
                {testPassed === true ? "Tests Passed" : "Test APIs"}
              </Button>
            </div>
          </CardHeader>
          {testResults.length > 0 && (
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {testResults.map((result, i) => (
                  <Badge 
                    key={i} 
                    variant={
                      result.status === "pass" ? "default" : 
                      result.status === "fail" ? "destructive" : 
                      "outline"
                    }
                    className="gap-1"
                  >
                    {result.status === "pass" && <CheckCircle2 className="h-3 w-3" />}
                    {result.status === "fail" && <XCircle className="h-3 w-3" />}
                    {result.status === "skip" && <AlertCircle className="h-3 w-3" />}
                    {result.service}: {result.message.slice(0, 50)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Company Discovery - Simple Places Search */}
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-green-600" />
              Company Discovery
              <Badge variant="outline" className="ml-2 border-green-500 text-green-600">Manual Mode</Badge>
            </CardTitle>
            <CardDescription>
              Find company names to manually look up in Apollo. Copy names and search them in Apollo to get contacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search Controls */}
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={discoverIndustry} onValueChange={setDiscoverIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map(ind => (
                      <SelectItem key={ind.value} value={ind.value}>
                        {ind.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="Houston, TX"
                  value={discoverLocation}
                  onChange={(e) => setDiscoverLocation(e.target.value)}
                />
              </div>
              
              <div className="space-y-2 sm:col-span-2 flex items-end gap-2">
                <Button 
                  onClick={() => handleDiscover(false)}
                  disabled={discoverStatus === "loading" || !discoverIndustry || !discoverLocation}
                  className="gap-2 flex-1 bg-green-600 hover:bg-green-700"
                >
                  {discoverStatus === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Find Companies
                </Button>
                
                {discoveredCompanies.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDiscoveredCompanies([]);
                      setDiscoverNextToken(null);
                    }}
                    className="gap-2"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Results */}
            {discoveredCompanies.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {discoveredCompanies.length} Companies Found
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Click company name to copy → Paste in Apollo search
                  </span>
                </div>
                
                <ScrollArea className="h-[400px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {discoveredCompanies.map((company, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/50 group"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground w-6 shrink-0">
                            {idx + 1}.
                          </span>
                          <button
                            onClick={() => copyCompanyName(company.name, idx)}
                            className="font-medium text-left hover:text-green-600 transition-colors truncate"
                            title="Click to copy company name"
                          >
                            {copiedIndex === idx ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4" />
                                Copied!
                              </span>
                            ) : (
                              company.name
                            )}
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                          {company.domain && (
                            <a 
                              href={company.website || `https://${company.domain}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary flex items-center gap-1"
                              title={company.website || ""}
                            >
                              <Globe className="h-3 w-3" />
                              {company.domain.length > 20 ? company.domain.slice(0, 20) + "..." : company.domain}
                            </a>
                          )}
                          {company.phone && (
                            <span className="flex items-center gap-1 font-mono text-xs">
                              <Phone className="h-3 w-3" />
                              {company.phone}
                            </span>
                          )}
                          <span className="text-xs w-24 text-right">
                            {company.city}, {company.state}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                
                {/* Load More Button */}
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => handleDiscover(true)}
                    disabled={discoverStatus === "loading"}
                    className="gap-2"
                  >
                    {discoverStatus === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Load More Companies
                  </Button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {discoverStatus === "done" && discoveredCompanies.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No companies found for this search</p>
                <p className="text-sm">Try a different location or industry</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Apollo Extraction */}
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Bulk Apollo Extraction
              <Badge variant="secondary" className="ml-2">Direct</Badge>
            </CardTitle>
            <CardDescription>
              Extract verified decision maker contacts directly from Apollo. Each contact uses 1 credit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Industry Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Industries</Label>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={selectAllIndustries}
                    className="h-7 text-xs"
                  >
                    Select All
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearAllIndustries}
                    className="h-7 text-xs"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {INDUSTRIES.map(ind => (
                  <div 
                    key={ind.value}
                    onClick={() => toggleBulkIndustry(ind.value)}
                    className={`
                      p-3 rounded-lg border cursor-pointer transition-all
                      ${bulkIndustries.includes(ind.value) 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-border hover:border-primary/50"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        checked={bulkIndustries.includes(ind.value)}
                        className="pointer-events-none"
                      />
                      <span className="text-sm font-medium">{ind.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Locations Input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Locations (optional)</Label>
                <span className="text-xs text-muted-foreground">
                  Leave empty to use 20 default US cities
                </span>
              </div>
              <textarea
                value={bulkLocations}
                onChange={(e) => setBulkLocations(e.target.value)}
                placeholder="Houston, TX&#10;Dallas, TX&#10;Phoenix, AZ&#10;(one per line or comma-separated)"
                className="w-full h-24 p-3 text-sm rounded-lg border bg-background resize-none"
              />
            </div>

            {/* Batch Size Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Max Companies: <span className="font-bold text-primary">{bulkMaxCompanies}</span></Label>
                <span className="text-sm text-muted-foreground">
                  ~{bulkMaxCompanies * 3} contacts ({bulkMaxCompanies * 3} Apollo credits)
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">5</span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={bulkMaxCompanies}
                  onChange={(e) => setBulkMaxCompanies(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-xs text-muted-foreground">100</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>~{Math.ceil(bulkMaxCompanies * 1.5 / 60)} minutes estimated</span>
                <span>{bulkIndustries.length} industries selected</span>
              </div>
            </div>

            {/* Progress Bar (shown during extraction) */}
            {bulkStatus === "loading" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground animate-pulse">{bulkProgress}</span>
                  <span className="text-primary font-medium">{Math.round(bulkProgressPercent)}%</span>
                </div>
                <Progress value={bulkProgressPercent} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Estimated: ~{Math.ceil(bulkMaxCompanies * 1.5 / 60)} minutes</span>
                  <span>~{bulkMaxCompanies * 3} credits max</span>
                </div>
              </div>
            )}

            {/* Action Button and Stats */}
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                onClick={handleBulkExtraction}
                disabled={bulkStatus === "loading" || bulkIndustries.length === 0}
                className="gap-2"
                size="lg"
              >
                {bulkStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {bulkStatus === "loading" ? "Extracting..." : `Extract ${bulkMaxCompanies} Companies (${bulkMaxCompanies * 3} contacts)`}
              </Button>
              
              {bulkStatus === "done" && bulkStats && (
                <div className="flex gap-4 text-sm flex-wrap">
                  <span className="text-green-600 font-medium">
                    <CheckCircle2 className="h-4 w-4 inline mr-1" />
                    {bulkStats.contactsSaved} contacts saved
                  </span>
                  <span className="text-blue-500">
                    {bulkStats.companiesFound} companies found
                  </span>
                  <span className="text-muted-foreground">
                    {bulkStats.creditsUsed} credits used
                  </span>
                  {bulkStats.duration && (
                    <span className="text-muted-foreground">
                      {bulkStats.duration}s
                    </span>
                  )}
                </div>
              )}
              
              {bulkStatus === "error" && (
                <span className="text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  {bulkProgress}
                </span>
              )}
            </div>

            {/* Results Preview */}
            {bulkStatus === "done" && bulkStats && bulkStats.contactsSaved > 0 && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-sm text-green-600 font-medium">
                  Successfully extracted {bulkStats.contactsSaved} verified contacts from {bulkStats.companiesFound} companies! 
                  Check the Work Queue to see them.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find Home Services Companies
            </CardTitle>
            <CardDescription>
              Search Google Places for contractors, then enrich with decision maker contact info
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Search Inputs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map(ind => (
                      <SelectItem key={ind.value} value={ind.value}>
                        {ind.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="City, State or ZIP"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Max Companies</Label>
                <Input
                  type="number"
                  value={maxCompanies}
                  onChange={(e) => setMaxCompanies(parseInt(e.target.value) || 20)}
                  min={5}
                  max={100}
                />
              </div>
              
              <div className="space-y-2 sm:col-span-2 flex items-end gap-2">
                <Button 
                  onClick={handleRunPipeline}
                  disabled={pipelineStatus === "loading" || !industry || !location}
                  className="gap-2 flex-1"
                  size="lg"
                >
                  {pipelineStatus === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Run Full Pipeline
                </Button>
                
                <Button
                  variant="outline"
                  onClick={loadCompanies}
                  disabled={isLoadingCompanies}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingCompanies ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Pipeline Progress */}
            {pipelineStatus === "loading" && (
              <div className="space-y-2">
                <Progress value={33} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">{pipelineProgress}</p>
              </div>
            )}

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Companies</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.companiesFound}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">With DM</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{stats.companiesWithDM}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Building className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Fallback</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-600">{stats.companiesWithFallback}</p>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Contacts</span>
                  </div>
                  <p className="text-2xl font-bold">{stats.peopleFound}</p>
                </CardContent>
              </Card>
            </div>

            {/* Manual Pipeline Steps (collapsed by default) */}
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Manual Pipeline Steps (click to expand)
              </summary>
              <div className="grid gap-4 sm:grid-cols-4 pt-2">
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">1. Google Places</span>
                      {getStatusIcon(placesStatus)}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handlePlacesSearch}
                      disabled={placesStatus === "loading" || !industry || !location}
                      className="w-full"
                    >
                      {placesStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">2. Apollo Enrich</span>
                      {getStatusIcon(enrichStatus)}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleApolloEnrich}
                      disabled={enrichStatus === "loading"}
                      className="w-full"
                    >
                      {enrichStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enrich"}
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">3. Scrape Sites</span>
                      {getStatusIcon(scrapeStatus)}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleScrape}
                      disabled={scrapeStatus === "loading"}
                      className="w-full"
                    >
                      {scrapeStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scrape"}
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">4. Verify Emails</span>
                      {getStatusIcon(verifyStatus)}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleVerifyEmails}
                      disabled={verifyStatus === "loading"}
                      className="w-full"
                    >
                      {verifyStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </details>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button 
                onClick={handleExport}
                disabled={stats.companiesFound === 0}
                variant="outline"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Lead Companies
                {companies.length > 0 && (
                  <Badge variant="secondary">{filteredCompanies.length}</Badge>
                )}
              </CardTitle>
              
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Filter:</Label>
                <Select value={contactFilter} onValueChange={(v) => setContactFilter(v as any)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({companies.length})</SelectItem>
                    <SelectItem value="dm_verified">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3 w-3 text-green-500" />
                        Verified DM
                      </div>
                    </SelectItem>
                    <SelectItem value="dm_guessed">
                      <div className="flex items-center gap-2">
                        <ShieldQuestion className="h-3 w-3 text-yellow-500" />
                        Guessed DM
                      </div>
                    </SelectItem>
                    <SelectItem value="fallback">Fallback Only</SelectItem>
                    <SelectItem value="needs_review">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-3 w-3 text-red-500" />
                        Needs Review ({needsReviewCount})
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingCompanies ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : companies.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No companies found yet</p>
                <p className="text-sm">Select an industry and location, then run the pipeline</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox 
                          checked={filteredCompanies.length > 0 && filteredCompanies.every(c => selectedCompanies.has(c.id))}
                          onCheckedChange={selectAllVisible}
                        />
                      </TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map(company => {
                      const contact = getBestContact(company);
                      const QualityIcon = contact.qualityBadge.icon;
                      return (
                        <TableRow key={company.id}>
                          <TableCell>
                            <Checkbox 
                              checked={selectedCompanies.has(company.id)}
                              onCheckedChange={() => toggleCompanySelection(company.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{company.name}</div>
                            {company.website && (
                              <a 
                                href={company.website} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary"
                              >
                                {company.domain}
                              </a>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {[company.city, company.state].filter(Boolean).join(", ") || "-"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="font-medium text-sm">{contact.name}</div>
                                <div className="text-xs text-muted-foreground">{contact.title}</div>
                              </div>
                              {contact.linkedinUrl && (
                                <a 
                                  href={contact.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:text-blue-600"
                                  title="View LinkedIn"
                                >
                                  <Linkedin className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {contact.email ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm font-mono">{contact.email}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Badge 
                                    variant="outline" 
                                    className="text-[10px] h-4 px-1"
                                  >
                                    {contact.emailStatus}
                                  </Badge>
                                  {contact.source && contact.source !== "fallback" && (
                                    <span className="text-[10px] text-muted-foreground">
                                      via {contact.source.replace("scrape_", "").replace("apollo_", "Apollo ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {contact.phone && (
                              <div className="flex items-center gap-1 text-sm font-mono">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {contact.phone.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div 
                              className="flex items-center gap-1"
                              title={`${contact.qualityBadge.description} (${contact.confidence}% confidence)`}
                            >
                              <Badge 
                                variant={contact.qualityBadge.variant}
                                className="gap-1 cursor-help"
                              >
                                <QualityIcon className={`h-3 w-3 ${contact.qualityBadge.color}`} />
                                {contact.qualityBadge.label}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => openReviewDialog(company)}
                              title="Edit / Review"
                            >
                              <HelpCircle className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
        
        {/* Manual Review Dialog */}
        <AlertDialog open={!!reviewCompany} onOpenChange={(open) => !open && setReviewCompany(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
                Manual Review: {reviewCompany?.name}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Enter the correct owner/decision maker information for this company.
                Search their website, LinkedIn, or Google to find accurate contact details.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
              {reviewCompany?.website && (
                <div className="flex gap-2">
                  <a 
                    href={reviewCompany.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Globe className="h-3 w-3" />
                    Visit Website
                  </a>
                  <a 
                    href={`https://www.google.com/search?q="${reviewCompany.name}"+owner+${reviewCompany.city}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Search className="h-3 w-3" />
                    Search Google
                  </a>
                  <a 
                    href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(reviewCompany.name)}%20owner`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Linkedin className="h-3 w-3" />
                    Search LinkedIn
                  </a>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="review-name">Owner Name</Label>
                <Input
                  id="review-name"
                  placeholder="John Smith"
                  value={reviewName}
                  onChange={(e) => setReviewName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="review-email">Email</Label>
                <Input
                  id="review-email"
                  type="email"
                  placeholder="john@company.com"
                  value={reviewEmail}
                  onChange={(e) => setReviewEmail(e.target.value)}
                />
                {reviewCompany?.domain && (
                  <p className="text-xs text-muted-foreground">
                    Suggestion: {reviewName.split(" ")[0]?.toLowerCase()}@{reviewCompany.domain}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="review-phone">Phone (Mobile preferred)</Label>
                <Input
                  id="review-phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={reviewPhone}
                  onChange={(e) => setReviewPhone(e.target.value)}
                />
              </div>
            </div>
            
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleManualReview}
                disabled={!reviewName || !reviewEmail}
              >
                Save Contact
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
