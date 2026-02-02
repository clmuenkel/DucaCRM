"use client";

import { useState, useEffect } from "react";
import { useEmailTemplates, renderTemplate } from "@/hooks/use-email-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMAIL_TEMPLATE_CATEGORIES } from "@/lib/constants";
import { toast } from "sonner";
import { Copy, ExternalLink, Mail } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import type { Contact } from "@/types/database";

interface EmailComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact;
  senderName?: string;
  senderCalendar?: string;
}

export function EmailComposer({
  open,
  onOpenChange,
  contact,
  senderName = "[Your Name]",
  senderCalendar = "[Calendar Link]",
}: EmailComposerProps) {
  const { data: templates } = useEmailTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Build variables from contact
  const getIndustryForTemplate = (c: Contact): string => {
    const industry = c.industries?.[0] || c.industry || "";
    if (industry === "not_found" || industry === "other" || !industry) {
      return "home services";
    }
    return industry;
  };

  const variables = {
    first_name: contact.first_name || "",
    last_name: contact.last_name || "",
    full_name: `${contact.first_name} ${contact.last_name || ""}`.trim(),
    company: contact.company_name || "",
    title: contact.title || "",
    email: contact.email || "",
    phone: contact.phone || "",
    industry: getIndustryForTemplate(contact),
    sender_name: senderName,
    sender_calendar: senderCalendar,
    meeting_date: "[Meeting Date]",
    meeting_time: "[Meeting Time]",
  };

  // Apply template when selected
  useEffect(() => {
    if (selectedTemplateId && templates) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      if (template) {
        setSubject(renderTemplate(template.subject_template, variables));
        setBody(renderTemplate(template.body_template, variables));
      }
    }
  }, [selectedTemplateId, templates]);

  const handleCopy = async () => {
    const emailContent = `Subject: ${subject}\n\n${body}`;
    await copyToClipboard(emailContent);
    toast.success("Email copied to clipboard!");
  };

  const handleOpenMailto = () => {
    const mailto = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto);
  };

  // Group templates by category
  const templatesByCategory = templates?.reduce((acc, template) => {
    const cat = template.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, typeof templates>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compose Email to {contact.first_name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="compose">
          <TabsList>
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="space-y-4">
            {/* Template Selector */}
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_TEMPLATE_CATEGORIES.map((cat) => {
                    const categoryTemplates = templatesByCategory?.[cat.value];
                    if (!categoryTemplates || categoryTemplates.length === 0) return null;
                    return (
                      <div key={cat.value}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {cat.label}
                        </div>
                        {categoryTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* To */}
            <div className="space-y-2">
              <Label>To</Label>
              <Input value={contact.email || ""} disabled />
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject"
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message..."
                className="min-h-[200px]"
              />
            </div>
          </TabsContent>

          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">To</p>
                  <p className="font-medium">{contact.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subject</p>
                  <p className="font-medium">{subject || "(No subject)"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Message</p>
                  <div className="mt-2 p-4 bg-muted rounded-lg whitespace-pre-wrap">
                    {body || "(No message)"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copy to Clipboard
          </Button>
          {contact.email && (
            <Button onClick={handleOpenMailto}>
              <Mail className="mr-2 h-4 w-4" />
              Open in Email App
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
