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
import { Input } from "@/components/ui/input";
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
  Pencil,
  RotateCcw,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { insforge } from "@/lib/neon/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export function ContactPanelCompact() {
  const { currentContact, setQueue, queue, currentIndex } = useDialerStore();

  const { data: company } = useCompany(currentContact?.company_id || "");
  const { data: companyNotes } = useCompanyNotes(currentContact?.company_id);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Inline editing state
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  if (!currentContact) return null;

  // Save phone number to DB and update local state
  const handleSavePhone = async () => {
    if (!editPhone.trim()) {
      toast.error("Phone number cannot be empty");
      return;
    }
    setIsSavingPhone(true);
    try {
      const { error } = await (insforge.database as any)
        .from("contacts")
        .update({ phone: editPhone.trim(), mobile: editPhone.trim() })
        .eq("id", currentContact.id);
      if (error) throw new Error(error.message);

      // Update the contact in the dialer queue so UI refreshes
      const updatedQueue = queue.map(c =>
        c.id === currentContact.id ? { ...c, phone: editPhone.trim(), mobile: editPhone.trim() } : c
      );
      setQueue(updatedQueue);
      setIsEditingPhone(false);
      toast.success("Phone number updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update phone");
    } finally {
      setIsSavingPhone(false);
    }
  };

  // Save email to DB and update local state
  const handleSaveEmail = async () => {
    if (!editEmail.trim()) {
      toast.error("Email cannot be empty");
      return;
    }
    setIsSavingEmail(true);
    try {
      const { error } = await (insforge.database as any)
        .from("contacts")
        .update({ email: editEmail.trim() })
        .eq("id", currentContact.id);
      if (error) throw new Error(error.message);

      const updatedQueue = queue.map(c =>
        c.id === currentContact.id ? { ...c, email: editEmail.trim() } : c
      );
      setQueue(updatedQueue);
      setIsEditingEmail(false);
      toast.success("Email updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update email");
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Reset contact: remove from active cadence → back to All Contacts pool
  const handleResetToQueue = async () => {
    setIsResetting(true);
    try {
      const { error } = await (insforge.database as any)
        .from("contacts")
        .update({
          cadence_status: null,
          cadence_step: null,
          cadence_outcome: null,
          next_action_date: null,
          next_action_type: null,
          call_attempts: 0,
        })
        .eq("id", currentContact.id);
      if (error) throw new Error(error.message);

      toast.success(`${currentContact.first_name} reset to All Contacts queue`);

      // Remove this contact from the dialer queue
      const updatedQueue = queue.filter(c => c.id !== currentContact.id);
      setQueue(updatedQueue);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset contact");
    } finally {
      setIsResetting(false);
    }
  };

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

      {/* Contact Info — Editable */}
      <div className="space-y-2">
        {/* Phone — inline edit */}
        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
          {isEditingPhone ? (
            <div className="flex items-center gap-2 flex-1">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+18322941575"
                className="h-8 font-mono text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSavePhone(); if (e.key === "Escape") setIsEditingPhone(false); }}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSavePhone} disabled={isSavingPhone}>
                {isSavingPhone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-green-500" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setIsEditingPhone(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{formatPhone(currentContact.phone || currentContact.mobile || "")}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-primary/10" onClick={() => { setEditPhone(currentContact.phone || currentContact.mobile || ""); setIsEditingPhone(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {(currentContact.phone || currentContact.mobile) && (
                  <CopyButton text={currentContact.phone || currentContact.mobile!} field="phone" />
                )}
              </div>
            </>
          )}
        </div>

        {/* Email — inline edit */}
        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
          {isEditingEmail ? (
            <div className="flex items-center gap-2 flex-1">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="name@example.com"
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveEmail(); if (e.key === "Escape") setIsEditingEmail(false); }}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSaveEmail} disabled={isSavingEmail}>
                {isSavingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-green-500" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setIsEditingEmail(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{currentContact.email || "No email"}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-primary/10" onClick={() => { setEditEmail(currentContact.email || ""); setIsEditingEmail(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {currentContact.email && (
                  <CopyButton text={currentContact.email} field="email" />
                )}
              </div>
            </>
          )}
        </div>

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

        {/* Reset to Queue */}
        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-muted-foreground hover:text-orange-600 hover:border-orange-500/50"
            onClick={handleResetToQueue}
            disabled={isResetting}
          >
            {isResetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Reset to Queue
          </Button>
        </div>
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
