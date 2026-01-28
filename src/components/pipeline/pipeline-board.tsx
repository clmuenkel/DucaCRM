"use client";

import { useContacts, useUpdateContact } from "@/hooks/use-contacts";
import { STAGES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials, cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, Phone } from "lucide-react";
import type { Contact } from "@/types/database";

export function PipelineBoard() {
  const { data: contacts, isLoading } = useContacts();
  const updateContact = useUpdateContact();

  const handleDragStart = (e: React.DragEvent, contactId: string) => {
    e.dataTransfer.setData("contactId", contactId);
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const contactId = e.dataTransfer.getData("contactId");
    
    try {
      await updateContact.mutateAsync({
        id: contactId,
        updates: { stage: newStage },
      });
      toast.success("Contact moved!");
    } catch (error) {
      toast.error("Failed to move contact");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 h-full p-4">
        {STAGES.map((stage) => (
          <div key={stage.value} className="w-72 flex-shrink-0">
            <Skeleton className="h-full" />
          </div>
        ))}
      </div>
    );
  }

  // Group contacts by stage
  const contactsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.value] = contacts?.filter((c) => c.stage === stage.value) || [];
    return acc;
  }, {} as Record<string, Contact[]>);

  return (
    <div className="flex gap-4 h-full overflow-x-auto p-4">
      {STAGES.map((stage) => (
        <div
          key={stage.value}
          className="w-72 flex-shrink-0 flex flex-col bg-muted/30 rounded-lg"
          onDrop={(e) => handleDrop(e, stage.value)}
          onDragOver={handleDragOver}
        >
          {/* Column Header */}
          <div className="p-3 border-b bg-card rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("h-3 w-3 rounded-full", stage.color)} />
                <h3 className="font-semibold">{stage.label}</h3>
              </div>
              <Badge variant="secondary">{contactsByStage[stage.value].length}</Badge>
            </div>
          </div>

          {/* Cards */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {contactsByStage[stage.value].length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No contacts
                </div>
              ) : (
                contactsByStage[stage.value].map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onDragStart={(e) => handleDragStart(e, contact.id)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}

function ContactCard({
  contact,
  onDragStart,
}: {
  contact: Contact;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <Link href={`/contacts/${contact.id}`}>
      <Card
        className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
        draggable
        onDragStart={onDragStart}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="text-xs">
                {getInitials(`${contact.first_name} ${contact.last_name || ""}`)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {contact.first_name} {contact.last_name}
              </p>
              {contact.title && (
                <p className="text-xs text-muted-foreground truncate">
                  {contact.title}
                </p>
              )}
              {contact.company_name && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  <span className="truncate">{contact.company_name}</span>
                </div>
              )}
            </div>
          </div>
          {/* Quick Info */}
          <div className="flex items-center gap-2 mt-2">
            {(contact.phone || contact.mobile) && (
              <Badge variant="outline" className="text-xs">
                <Phone className="h-3 w-3 mr-1" />
                Has Phone
              </Badge>
            )}
            {contact.industry && (
              <Badge variant="outline" className="text-xs">
                {contact.industry}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
