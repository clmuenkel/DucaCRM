"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate } from "@/types/database";

interface TemplatePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplate | null;
  contactId?: string;
}

export function TemplatePreview({ open, onOpenChange, template, contactId }: TemplatePreviewProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    subject: string;
    body: string;
    variables: Record<string, string>;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && template) {
      loadPreview();
    } else {
      setPreview(null);
    }
  }, [open, template, contactId]);

  const loadPreview = async () => {
    if (!template) return;

    setLoading(true);
    try {
      const response = await fetch("/api/templates/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          contactId: contactId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to load preview");
      }

      const data = await response.json();
      setPreview(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load preview");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!preview) return;

    const emailContent = `Subject: ${preview.subject}\n\n${preview.body}`;
    await navigator.clipboard.writeText(emailContent);
    setCopied(true);
    toast.success("Email copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview: {template.name}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Subject Preview */}
            <div className="space-y-2">
              <Label>Subject</Label>
              <div className="p-3 bg-muted rounded-md border">
                <p className="font-medium">{preview.subject}</p>
              </div>
            </div>

            {/* Body Preview */}
            <div className="space-y-2">
              <Label>Email Body</Label>
              <div className="p-4 bg-muted rounded-md border min-h-[200px]">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: preview.body.replace(/\n/g, "<br />") }}
                />
              </div>
            </div>

            {/* Variables Used */}
            <div className="space-y-2">
              <Label>Variables Used</Label>
              <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-md border">
                {Object.entries(preview.variables).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {value || "(empty)"}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Email
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No preview available
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
