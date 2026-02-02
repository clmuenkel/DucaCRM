"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { useEmailTemplates, useDeleteEmailTemplate } from "@/hooks/use-email-templates";
import { TemplateEditor } from "@/components/emails/template-editor";
import { TemplatePreview } from "@/components/emails/template-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EMAIL_TEMPLATE_CATEGORIES } from "@/lib/constants";
import { Plus, MoreHorizontal, Pencil, Trash2, Mail, Eye } from "lucide-react";
import { toast } from "sonner";
import type { EmailTemplate } from "@/types/database";

export default function TemplatesPage() {
  const { data: templates, isLoading } = useEmailTemplates();
  const deleteTemplate = useDeleteEmailTemplate();
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      try {
        await deleteTemplate.mutateAsync(id);
        toast.success("Template deleted");
      } catch (error) {
        toast.error("Failed to delete template");
      }
    }
  };

  const handlePreview = (template: EmailTemplate) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  // Group templates by category
  const templatesByCategory = templates?.reduce((acc, template) => {
    const cat = template.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, EmailTemplate[]>);

  return (
    <div className="flex flex-col h-full">
      <Header title="Email Templates" />
      
      <div className="flex-1 p-6 overflow-auto">
        <div 
          className="flex justify-between items-center mb-6 opacity-0 animate-fade-in"
          style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
        >
          <div>
            <h2 className="text-lg font-semibold">Template Library</h2>
            <p className="text-sm text-muted-foreground">
              Create and manage your email templates
            </p>
          </div>
          <Button onClick={handleCreate} className="press-scale">
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>

        <div 
          className="opacity-0 animate-fade-in"
          style={{ animationDelay: "50ms", animationFillMode: "forwards" }}
        >
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first email template to speed up your outreach
              </p>
              <Button onClick={handleCreate} className="press-scale">
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {EMAIL_TEMPLATE_CATEGORIES.map((category) => {
                const categoryTemplates = templatesByCategory?.[category.value];
                if (!categoryTemplates || categoryTemplates.length === 0) return null;

                return (
                  <div key={category.value}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-4">
                      {category.label}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {categoryTemplates.map((template) => (
                        <Card key={template.id} className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-base">{template.name}</CardTitle>
                                <CardDescription className="text-xs mt-1">
                                  {template.subject_template}
                                </CardDescription>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handlePreview(template)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Preview
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleEdit(template)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(template.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {template.body_template}
                            </p>
                            <div className="flex items-center gap-2 mt-3">
                              <Badge variant="secondary" className="text-xs">
                                {category.label}
                              </Badge>
                              {template.use_count > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  Used {template.use_count}x
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
      />
      <TemplatePreview
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        template={previewTemplate}
      />
    </div>
  );
}
