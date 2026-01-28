"use client";

import { useDialerStore } from "@/stores/dialer-store";
import { useCompany } from "@/hooks/use-companies";
import { useContactContext, formatOpenerSuggestion, useUpdateReferralNote, useSetCustomOpener, useRemoveDirectReferral } from "@/hooks/use-referrals";
import { useCompanyNotes } from "@/hooks/use-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STAGES, CALL_OUTCOMES_UI, CALL_DISPOSITIONS } from "@/lib/constants";
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
  MessageSquare,
  Check,
  Edit2,
  Target,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function ContactPanelCompact() {
  const {
    currentContact,
    outcome,
    disposition,
    confirmedBudget,
    confirmedAuthority,
    confirmedNeed,
    confirmedTimeline,
    setOutcome,
    setDisposition,
    setQualification,
  } = useDialerStore();

  const { data: company } = useCompany(currentContact?.company_id || "");
  const { data: context } = useContactContext(
    currentContact?.id || "",
    currentContact?.company_id
  );
  const { data: companyNotes } = useCompanyNotes(currentContact?.company_id);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditingOpener, setIsEditingOpener] = useState(false);
  const [openerText, setOpenerText] = useState("");

  const updateReferralNote = useUpdateReferralNote();
  const setCustomOpener = useSetCustomOpener();
  const removeReferral = useRemoveDirectReferral();

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

  // BANT score
  const bantScore = [confirmedBudget, confirmedAuthority, confirmedNeed, confirmedTimeline].filter(Boolean).length;

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

  // Get full name with title for opener context
  const getOpenerName = () => {
    if (context?.type === "direct" && context.referrer) {
      const name = `${context.referrer.first_name} ${context.referrer.last_name || ""}`.trim();
      return context.referrer.title ? `${name} (${context.referrer.title})` : name;
    }
    if (context?.type === "company" && context.companyTalkedTo) {
      const name = `${context.companyTalkedTo.first_name} ${context.companyTalkedTo.last_name || ""}`.trim();
      return context.companyTalkedTo.title ? `${name} (${context.companyTalkedTo.title})` : name;
    }
    return null;
  };

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
            {bantScore > 0 && (
              <Badge variant="outline" className="gap-1">
                <Target className="h-3 w-3" />
                {bantScore}/4 BANT
              </Badge>
            )}
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

      {/* Opener Context */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            Opener Context
          </div>
          {(context?.type === "direct" || context?.type === "company" || currentContact.direct_referral_note) && !isEditingOpener && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setOpenerText(context?.note || currentContact.direct_referral_note || "");
                setIsEditingOpener(true);
              }}
            >
              <Edit2 className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
        
        {isEditingOpener ? (
          <Card>
            <CardContent className="p-3 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Opener text (what you'll say)</Label>
                <Textarea
                  value={openerText}
                  onChange={(e) => setOpenerText(e.target.value)}
                  placeholder="e.g., John Smith (VP of Sales) told me to reach out..."
                  className="mt-1.5"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setIsEditingOpener(false)}
                >
                  Cancel
                </Button>
                {(context?.type === "direct" || currentContact.direct_referral_note) && (
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await removeReferral.mutateAsync(currentContact.id);
                        toast.success("Opener cleared");
                        setIsEditingOpener(false);
                        setOpenerText("");
                      } catch (error: any) {
                        toast.error(error.message || "Failed to clear opener");
                      }
                    }}
                    disabled={removeReferral.isPending}
                  >
                    Clear
                  </Button>
                )}
                <Button 
                  size="sm" 
                  onClick={async () => {
                    try {
                      if (context?.type === "direct") {
                        await updateReferralNote.mutateAsync({
                          contactId: currentContact.id,
                          note: openerText,
                        });
                      } else {
                        await setCustomOpener.mutateAsync({
                          contactId: currentContact.id,
                          openerText: openerText,
                        });
                      }
                      toast.success("Opener saved");
                      setIsEditingOpener(false);
                    } catch (error: any) {
                      toast.error(error.message || "Failed to save opener");
                    }
                  }}
                  disabled={updateReferralNote.isPending || setCustomOpener.isPending}
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {context?.type === "direct" && context.referrer && (
              <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <CardContent className="p-3">
                  <p className="font-medium text-green-800 dark:text-green-300">
                    {getOpenerName()} told them to expect your call
                  </p>
                  {context.note && (
                    <p className="text-sm text-green-700 dark:text-green-400 mt-2 italic">
                      "{context.note}"
                    </p>
                  )}
                  {!context.note && (
                    <p className="text-sm text-green-700 dark:text-green-300 mt-2 italic">
                      "{formatOpenerSuggestion(context)}"
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {context?.type === "company" && context.companyTalkedTo && (
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-3">
                  <p className="font-medium text-blue-800 dark:text-blue-300">
                    You spoke with {getOpenerName()}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-2 italic">
                    "{formatOpenerSuggestion(context)}"
                  </p>
                </CardContent>
              </Card>
            )}

            {context?.type === "none" && !currentContact.direct_referral_note && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setOpenerText("");
                  setIsEditingOpener(true);
                }}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Add opener (first & last name of reference)
              </Button>
            )}

            {context?.type === "none" && currentContact.direct_referral_note && (
              <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
                <CardContent className="p-3">
                  <p className="font-medium text-purple-800 dark:text-purple-300">
                    Custom Opener
                  </p>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mt-2 italic">
                    "{currentContact.direct_referral_note}"
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <Separator />

      {/* BANT Qualification */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4 text-muted-foreground" />
            Qualification (BANT)
          </div>
          <span className="text-sm text-muted-foreground">{bantScore * 25}%</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <label className="flex flex-col items-center gap-1.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
            <Checkbox
              checked={confirmedBudget}
              onCheckedChange={(checked) => setQualification("budget", !!checked)}
            />
            <span className="text-xs font-medium">Budget</span>
          </label>
          <label className="flex flex-col items-center gap-1.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
            <Checkbox
              checked={confirmedAuthority}
              onCheckedChange={(checked) => setQualification("authority", !!checked)}
            />
            <span className="text-xs font-medium">Authority</span>
          </label>
          <label className="flex flex-col items-center gap-1.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
            <Checkbox
              checked={confirmedNeed}
              onCheckedChange={(checked) => setQualification("need", !!checked)}
            />
            <span className="text-xs font-medium">Need</span>
          </label>
          <label className="flex flex-col items-center gap-1.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
            <Checkbox
              checked={confirmedTimeline}
              onCheckedChange={(checked) => setQualification("timeline", !!checked)}
            />
            <span className="text-xs font-medium">Timeline</span>
          </label>
        </div>
      </div>

      <Separator />

      {/* Call Outcome */}
      <div>
        <div className="text-sm font-medium mb-3">Call Outcome</div>
        <div className="grid grid-cols-3 gap-2">
          {CALL_OUTCOMES_UI.map((o) => (
            <Button
              key={o.value}
              variant={outcome === o.value ? "default" : "outline"}
              size="sm"
              onClick={() => setOutcome(o.value as any)}
              className="h-9"
            >
              <span className="mr-1.5">{o.icon}</span>
              {o.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Disposition (shown if connected) */}
      {outcome === "connected" && (
        <div>
          <div className="text-sm font-medium mb-3">Result</div>
          <div className="grid grid-cols-2 gap-2">
            {CALL_DISPOSITIONS.slice(0, 4).map((d) => (
              <Button
                key={d.value}
                variant={disposition === d.value ? "default" : "outline"}
                size="sm"
                onClick={() => setDisposition(d.value as any)}
                className="h-9 justify-start"
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Keep old export for backwards compatibility
export { ContactPanelCompact as ContactPanel };
