"use client";

import { useCompany, useCompanyColleagues, useCompanyTalkedTo } from "@/hooks/use-companies";
import { useContactContext, formatReferralContext, formatOpenerSuggestion } from "@/hooks/use-referrals";
import { CompanyCard } from "@/components/companies/company-card";
import { CompanyContactsMini } from "@/components/companies/company-contacts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTimezoneDisplay, getFriendlyTimezoneName, isBusinessHours } from "@/lib/timezone";
import { 
  Building2, 
  Users, 
  MessageSquare, 
  Clock,
  Copy,
  Check,
  Edit2,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import type { Contact, Company } from "@/types/database";

interface ContextPanelProps {
  contact: Contact;
  onSelectContact?: (contact: Contact) => void;
}

export function ContextPanel({ contact, onSelectContact }: ContextPanelProps) {
  const { data: company, isLoading: loadingCompany } = useCompany(contact.company_id || "");
  const { data: context, isLoading: loadingContext } = useContactContext(
    contact.id, 
    contact.company_id
  );
  const { data: colleagues } = useCompanyColleagues(contact.id, contact.company_id);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [manualReference, setManualReference] = useState("");
  const [isEditingReference, setIsEditingReference] = useState(false);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Get timezone info
  const timezone = company?.timezone || contact.state 
    ? company?.timezone 
    : null;
  const timezoneInfo = timezone ? {
    display: getTimezoneDisplay(timezone),
    name: getFriendlyTimezoneName(timezone),
    isBusinessHours: isBusinessHours(timezone),
  } : null;

  if (loadingCompany || loadingContext) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timezone / Local Time Card */}
      {timezoneInfo && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{timezoneInfo.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{timezoneInfo.display}</span>
                {timezoneInfo.isBusinessHours ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    Business Hours
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    After Hours
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Opener Context Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Opener Context
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {context?.type === "direct" && context.referrer && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                {context.referrer.first_name} {context.referrer.last_name}
                {context.referrer.title && ` (${context.referrer.title})`} told them to expect your call
              </p>
              {context.note && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Note: {context.note}
                </p>
              )}
              <p className="text-xs text-green-700 dark:text-green-300 mt-2 italic">
                {formatOpenerSuggestion(context)}
              </p>
            </div>
          )}

          {context?.type === "company" && context.companyTalkedTo && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                You spoke with {context.companyTalkedTo.first_name} {context.companyTalkedTo.last_name}
                {context.companyTalkedTo.title && ` (${context.companyTalkedTo.title})`}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 italic">
                {formatOpenerSuggestion(context)}
              </p>
            </div>
          )}

          {context?.type === "none" && (
            <>
              {isEditingReference ? (
                <div className="space-y-2">
                  <Label className="text-xs">Add a reference name</Label>
                  <Input
                    value={manualReference}
                    onChange={(e) => setManualReference(e.target.value)}
                    placeholder="e.g., John from IT"
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setIsEditingReference(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => {
                        // In a real implementation, this would save to the contact
                        toast.success("Reference saved");
                        setIsEditingReference(false);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsEditingReference(true)}
                >
                  <Edit2 className="h-3 w-3 mr-2" />
                  Add a reference for opener
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Company Info Card */}
      {company && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {company.name}
              </span>
              <Link href={`/companies/${company.id}`}>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {company.industry && (
                <Badge variant="outline">{company.industry}</Badge>
              )}
              {company.employee_range && (
                <span>{company.employee_range} employees</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Copy Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Quick Copy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <QuickCopyButton
            label="Full Name"
            value={`${contact.first_name} ${contact.last_name || ""}`.trim()}
            copied={copiedField === "name"}
            onCopy={() => copyToClipboard(`${contact.first_name} ${contact.last_name || ""}`.trim(), "name")}
          />
          {contact.title && (
            <QuickCopyButton
              label="Title"
              value={contact.title}
              copied={copiedField === "title"}
              onCopy={() => copyToClipboard(contact.title!, "title")}
            />
          )}
          {contact.email && (
            <QuickCopyButton
              label="Email"
              value={contact.email}
              copied={copiedField === "email"}
              onCopy={() => copyToClipboard(contact.email!, "email")}
            />
          )}
          {(contact.phone || contact.mobile) && (
            <QuickCopyButton
              label="Phone"
              value={contact.phone || contact.mobile!}
              copied={copiedField === "phone"}
              onCopy={() => copyToClipboard(contact.phone || contact.mobile!, "phone")}
            />
          )}
          {company?.name && (
            <QuickCopyButton
              label="Company"
              value={company.name}
              copied={copiedField === "company"}
              onCopy={() => copyToClipboard(company.name, "company")}
            />
          )}
        </CardContent>
      </Card>

      {/* Other Contacts at Company */}
      {colleagues && colleagues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Other Contacts at Company
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyContactsMini
              contacts={colleagues as Contact[]}
              currentContactId={contact.id}
              onSelectContact={onSelectContact}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuickCopyButton({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-between h-auto py-2 px-3 font-normal"
      onClick={onCopy}
    >
      <span className="flex flex-col items-start">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm truncate max-w-[200px]">{value}</span>
      </span>
      {copied ? (
        <Check className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </Button>
  );
}

export function ContextPanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
