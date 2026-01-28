"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimezoneDisplay, getFriendlyTimezoneName, isBusinessHours } from "@/lib/timezone";
import { 
  Building2, 
  Globe, 
  Linkedin, 
  MapPin, 
  Users, 
  Clock,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Company } from "@/types/database";

interface CompanyCardProps {
  company: Company;
  contactCount?: number;
  lastContactedAt?: string | null;
  showActions?: boolean;
}

export function CompanyCard({ 
  company, 
  contactCount = 0, 
  lastContactedAt,
  showActions = true 
}: CompanyCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const location = [company.city, company.state].filter(Boolean).join(", ");
  const timezoneInfo = company.timezone 
    ? {
        display: getTimezoneDisplay(company.timezone),
        name: getFriendlyTimezoneName(company.timezone),
        isBusinessHours: isBusinessHours(company.timezone),
      }
    : null;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          {/* Company Icon */}
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-7 w-7 text-primary" />
          </div>

          {/* Company Info */}
          <div className="flex-1 space-y-4">
            {/* Header */}
            <div>
              <h2 className="text-xl font-semibold">{company.name}</h2>
              {company.domain && (
                <p className="text-sm text-muted-foreground">{company.domain}</p>
              )}
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Industry */}
              {company.industry && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Industry</p>
                  <Badge variant="outline" className="mt-1">{company.industry}</Badge>
                </div>
              )}

              {/* Size */}
              {(company.employee_count || company.employee_range) && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Size</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {company.employee_count ? (
                      <span className="text-sm font-medium">
                        {company.employee_count.toLocaleString()} employees
                        {company.employee_range && (
                          <span className="text-xs text-muted-foreground ml-1">({company.employee_range})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm font-medium">{company.employee_range}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Location */}
              {location && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Location</p>
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{location}</span>
                  </div>
                </div>
              )}

              {/* Timezone / Local Time */}
              {timezoneInfo && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Local Time</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{timezoneInfo.display}</span>
                    {timezoneInfo.isBusinessHours ? (
                      <Badge variant="outline" className="ml-1 text-green-600 border-green-600">
                        Business Hours
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1 text-amber-600 border-amber-600">
                        After Hours
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Contacts */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Contacts</p>
                <p className="text-sm font-medium mt-1">{contactCount} people</p>
              </div>

              {/* Revenue */}
              {company.annual_revenue && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue</p>
                  <p className="text-sm font-medium mt-1">{company.annual_revenue}</p>
                </div>
              )}
            </div>

            {/* Intent Data */}
            {company.intent_topics && company.intent_topics.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Intent Signals</p>
                <div className="flex flex-wrap gap-1">
                  {company.intent_topics.map((topic) => (
                    <Badge key={topic} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {showActions && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {company.website && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(company.website!, "_blank")}
                  >
                    <Globe className="h-4 w-4 mr-1" />
                    Website
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
                {company.linkedin_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(company.linkedin_url!, "_blank")}
                  >
                    <Linkedin className="h-4 w-4 mr-1" />
                    LinkedIn
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
                {company.domain && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(company.domain!, "domain")}
                  >
                    {copiedField === "domain" ? (
                      <Check className="h-4 w-4 mr-1 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    Copy Domain
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CompanyCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 rounded-xl" />
          <div className="flex-1 space-y-4">
            <div>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32 mt-1" />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
