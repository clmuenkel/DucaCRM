"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Phone, 
  Mail, 
  Linkedin, 
  Copy, 
  Check,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { Contact } from "@/types/database";
import { getValidPhone } from "@/lib/utils";

interface CompanyContactsProps {
  contacts: Contact[];
  isLoading?: boolean;
  onStartCall?: (contactId: string) => void;
}

export function CompanyContacts({ 
  contacts, 
  isLoading,
  onStartCall 
}: CompanyContactsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!contacts || contacts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No contacts at this company yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Last Contacted</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => (
          <ContactRow 
            key={contact.id} 
            contact={contact} 
            onStartCall={onStartCall}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function ContactRow({ 
  contact, 
  onStartCall 
}: { 
  contact: Contact; 
  onStartCall?: (contactId: string) => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fullName = `${contact.first_name} ${contact.last_name || ""}`.trim();

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "fresh": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "contacted": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "interested": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "meeting_scheduled": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "opportunity": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "closed_won": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "closed_lost": return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
      default: return "";
    }
  };

  return (
    <TableRow className="group">
      <TableCell>
        <Link 
          href={`/contacts/${contact.id}`}
          className="font-medium hover:underline"
        >
          {fullName}
        </Link>
        {contact.direct_referral_contact_id && (
          <Badge variant="outline" className="ml-2 text-xs">
            <MessageSquare className="h-3 w-3 mr-1" />
            Referred
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {contact.title || "-"}
      </TableCell>
      <TableCell>
        <Badge className={getStageColor(contact.stage)}>
          {contact.stage.replace(/_/g, " ")}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {(() => {
            const validPhone = getValidPhone(contact.phone, contact.mobile);
            return validPhone ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(validPhone, "phone");
                }}
                title={validPhone}
              >
                {copiedField === "phone" ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Phone className="h-4 w-4" />
                )}
              </Button>
            ) : null;
          })()}
          {contact.email && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(contact.email!, "email");
              }}
              title={contact.email}
            >
              {copiedField === "email" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
            </Button>
          )}
          {contact.linkedin_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                window.open(contact.linkedin_url!, "_blank");
              }}
              title="Open LinkedIn"
            >
              <Linkedin className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {contact.last_contacted_at
          ? formatDistanceToNow(new Date(contact.last_contacted_at), { addSuffix: true })
          : "Never"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {onStartCall && getValidPhone(contact.phone, contact.mobile) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStartCall(contact.id)}
            >
              <Phone className="h-4 w-4 mr-1" />
              Call
            </Button>
          )}
          <Link href={`/contacts/${contact.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Mini version for dialer context panel
export function CompanyContactsMini({ 
  contacts,
  currentContactId,
  onSelectContact,
}: { 
  contacts: Contact[];
  currentContactId?: string;
  onSelectContact?: (contact: Contact) => void;
}) {
  if (!contacts || contacts.length === 0) {
    return null;
  }

  const otherContacts = contacts.filter(c => c.id !== currentContactId);
  
  if (otherContacts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        Other Contacts at Company
      </p>
      <div className="space-y-1">
        {otherContacts.slice(0, 5).map((contact) => (
          <div 
            key={contact.id}
            className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer transition-colors"
            onClick={() => onSelectContact?.(contact)}
          >
            <div>
              <p className="text-sm font-medium">
                {contact.first_name} {contact.last_name}
              </p>
              <p className="text-xs text-muted-foreground">{contact.title}</p>
            </div>
            {contact.last_contacted_at && (
              <Badge variant="outline" className="text-xs">
                Contacted
              </Badge>
            )}
          </div>
        ))}
        {otherContacts.length > 5 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{otherContacts.length - 5} more
          </p>
        )}
      </div>
    </div>
  );
}
