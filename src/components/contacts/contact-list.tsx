"use client";

import { useState, useMemo } from "react";
import { useContacts, useDeleteContact } from "@/hooks/use-contacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGES } from "@/lib/constants";
import { formatPhone, copyToClipboard, getValidPhone } from "@/lib/utils";
import { Search, Phone, Mail, Trash2, Eye, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Contact } from "@/types/database";

export function ContactList() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();

  // Fetch ALL contacts once — filter client-side for instant search
  const { data: allContacts, isLoading } = useContacts({
    stage: stageFilter !== "all" ? stageFilter : undefined,
  });

  // Client-side search filter (instant, no DB round-trip per keystroke)
  const contacts = useMemo(() => {
    if (!allContacts) return [];
    if (!search) return allContacts;
    const q = search.toLowerCase();
    return allContacts.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.mobile?.includes(q)
    );
  }, [allContacts, search]);

  const deleteContact = useDeleteContact();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(contacts?.map((c) => c.id) || []);
    } else {
      setSelected([]);
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelected([...selected, id]);
    } else {
      setSelected(selected.filter((s) => s !== id));
    }
  };

  const handleCopyPhone = async (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(phone);
    toast.success("Phone number copied!");
  };

  const handleCopyEmail = async (email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(email);
    toast.success("Email copied!");
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this contact?")) {
      await deleteContact.mutateAsync(id);
      toast.success("Contact deleted");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGES.map((stage) => (
              <SelectItem key={stage.value} value={stage.value}>
                {stage.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selected.length} selected
            </span>
            <Button variant="outline" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox
                  checked={selected.length === contacts?.length && contacts?.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!contacts || contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No contacts found</p>
                    <Link href="/import">
                      <Button variant="outline" size="sm" className="mt-2">
                        Import from Apollo
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  selected={selected.includes(contact.id)}
                  onSelect={(checked) => handleSelect(contact.id, checked)}
                  onCopyPhone={(e) => {
                    const validPhone = getValidPhone(contact.phone, contact.mobile);
                    if (validPhone) handleCopyPhone(validPhone, e);
                  }}
                  onCopyEmail={(e) => contact.email && handleCopyEmail(contact.email, e)}
                  onDelete={(e) => handleDelete(contact.id, e)}
                  onRowClick={() => router.push(`/contacts/${contact.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ContactRow({
  contact,
  selected,
  onSelect,
  onCopyPhone,
  onCopyEmail,
  onDelete,
  onRowClick,
}: {
  contact: Contact;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onCopyPhone: (e: React.MouseEvent) => void;
  onCopyEmail: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onRowClick: () => void;
}) {
  const stage = STAGES.find((s) => s.value === contact.stage);
  const contactName = `${contact.first_name} ${contact.last_name || ''}`.trim();

  return (
    <TableRow 
      className="group cursor-pointer transition-colors"
      onClick={onRowClick}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onSelect} />
      </TableCell>
      <TableCell>
        <div className="font-medium">{contactName}</div>
        {contact.title && (
          <p className="text-sm text-muted-foreground">{contact.title}</p>
        )}
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{contact.company_name || "-"}</p>
          {contact.industry && (
            <p className="text-sm text-muted-foreground">{contact.industry}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        {(() => {
          const validPhone = getValidPhone(contact.phone, contact.mobile);
          return validPhone ? (
            <button
              onClick={onCopyPhone}
              className="text-sm font-mono hover:text-primary flex items-center gap-1 transition-colors"
            >
              {formatPhone(validPhone)}
              <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50" />
            </button>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        })()}
      </TableCell>
      <TableCell>
        {contact.email ? (
          <button
            onClick={onCopyEmail}
            className="text-sm hover:text-primary flex items-center gap-1 truncate max-w-[180px] transition-colors"
          >
            {contact.email}
            <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 shrink-0" />
          </button>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={contact.stage as any}>{stage?.label || contact.stage}</Badge>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        {/* Hover Actions */}
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`/contacts/${contact.id}`}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Eye className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>View Details</TooltipContent>
          </Tooltip>

          {getValidPhone(contact.phone, contact.mobile) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href={`/dialer?contact=${contact.id}`}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10">
                    <Phone className="h-4 w-4" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Call</TooltipContent>
            </Tooltip>
          )}

          {contact.email && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10">
                  <Mail className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Email</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}
