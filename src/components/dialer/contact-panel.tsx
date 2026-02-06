"use client";

import { useDialerStore } from "@/stores/dialer-store";
import { useCompany } from "@/hooks/use-companies";
import { useCompanyNotes } from "@/hooks/use-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { STAGES } from "@/lib/constants";
import { formatPhone, copyToClipboard, getInitials } from "@/lib/utils";
import { getTimezoneFromLocation, getLocalTime, getTimezoneAbbreviation, isBusinessHours } from "@/lib/timezone";
import {
  Phone,
  Mail,
  Building2,
  MapPin,
  Copy,
  ExternalLink,
  Linkedin,
  Users,
  Clock,
  Check,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function ContactPanelCompact() {
  const { currentContact } = useDialerStore();

  const { data: company } = useCompany(currentContact?.company_id || "");
  const { data: companyNotes } = useCompanyNotes(currentContact?.company_id);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!currentContact) return null;

  const stage = STAGES.find((s) => s.value === currentContact.stage);

  // Get timezone info
  const timezone = company?.timezone || getTimezoneFromLocation(
    currentContact.city,
    currentContact.state,
    currentContact.country
  );
  const localTime = getLocalTime(timezone);
  const tzAbbr = getTimezoneAbbreviation(timezone);
  const isBusiness = isBusinessHours(timezone);

  const handleCopy = async (text: string, field: string) => {
    await copyToClipboard(text);
    setCopiedField(field);
    toast.success("Copied!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 hover:bg-primary/10"
      onClick={() => handleCopy(text, field)}
    >
      {copiedField === field ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );

  return (
    <div className="space-y-5">
      {/* Contact Header */}
      <div className="flex items-start gap-4">
        <Avatar className="h-14 w-14 ring-2 ring-primary/20">
          <AvatarFallback className="text-lg bg-primary/10 text-primary font-semibold">
            {getInitials(`${currentContact.first_name} ${currentContact.last_name || ""}`)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold truncate">
              {currentContact.first_name} {currentContact.last_name}
            </h2>
            <CopyButton 
              text={`${currentContact.first_name} ${currentContact.last_name || ""}`.trim()} 
              field="name" 
            />
          </div>
          {currentContact.title && (
            <div className="flex items-center gap-1">
              <p className="text-muted-foreground truncate">{currentContact.title}</p>
              <CopyButton text={currentContact.title} field="title" />
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant={currentContact.stage as any}>
              {stage?.label || currentContact.stage}
            </Badge>
          </div>
        </div>
      </div>

      {/* Timezone + Location */}
      <Card className="bg-muted/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono font-semibold">{localTime} {tzAbbr}</span>
            </div>
            {isBusiness ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Business Hours
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                After Hours
              </Badge>
            )}
          </div>
          {(currentContact.city || currentContact.state) && (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {[currentContact.city, currentContact.state].filter(Boolean).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact Info */}
      <div className="space-y-2">
        {(currentContact.phone || currentContact.mobile) && (
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono">{formatPhone(currentContact.phone || currentContact.mobile!)}</span>
            </div>
            <CopyButton text={currentContact.phone || currentContact.mobile!} field="phone" />
          </div>
        )}
        
        {currentContact.email && (
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{currentContact.email}</span>
            </div>
            <CopyButton text={currentContact.email} field="email" />
          </div>
        )}

        {currentContact.linkedin_url && (
          <div className="flex items-center gap-3 p-2">
            <Linkedin className="h-4 w-4 text-muted-foreground" />
            <a
              href={currentContact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              LinkedIn Profile <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Company Info */}
      {(company || currentContact.company_name) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold text-lg">{company?.name || currentContact.company_name}</span>
              <CopyButton text={company?.name || currentContact.company_name || ""} field="company" />
            </div>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {(company?.industry || currentContact.industry) && (
                <Badge variant="outline">
                  {company?.industry || currentContact.industry}
                </Badge>
              )}
              {(company?.employee_count || currentContact.employee_count || company?.employee_range || currentContact.employee_range) && (
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  {(company?.employee_count || currentContact.employee_count) 
                    ? `${(company?.employee_count || currentContact.employee_count)?.toLocaleString()} employees`
                    : `${company?.employee_range || currentContact.employee_range} employees`}
                </Badge>
              )}
            </div>

            {/* Company Description Placeholder */}
            <p className="text-sm text-muted-foreground italic">
              {company?.industry 
                ? `${company.industry} company${company.employee_range ? ` with ${company.employee_range} employees` : ""}`
                : currentContact.industry 
                  ? `${currentContact.industry} company`
                  : "Company information"}
            </p>

            {/* Company-Wide Notes */}
            {companyNotes && companyNotes.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    Company Notes ({companyNotes.length})
                  </span>
                </div>
                <div className="space-y-2 max-h-24 overflow-y-auto">
                  {companyNotes.slice(0, 3).map((note) => (
                    <div 
                      key={note.id} 
                      className="text-xs p-2 bg-blue-50 dark:bg-blue-900/20 rounded border-l-2 border-blue-400"
                    >
                      <p className="text-blue-800 dark:text-blue-200">{note.content}</p>
                      <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}

// Keep old export for backwards compatibility
export { ContactPanelCompact as ContactPanel };
