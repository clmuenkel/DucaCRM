"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateEmailTemplate, useUpdateEmailTemplate } from "@/hooks/use-email-templates";
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
import { Badge } from "@/components/ui/badge";
import { EMAIL_TEMPLATE_CATEGORIES, TEMPLATE_VARIABLES } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { EmailTemplate } from "@/types/database";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  subject_template: z.string().min(1, "Subject is required"),
  body_template: z.string().min(1, "Body is required"),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplate | null;
}

export function TemplateEditor({ open, onOpenChange, template }: TemplateEditorProps) {
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const isEditing = !!template;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template?.name || "",
      category: template?.category || "",
      subject_template: template?.subject_template || "",
      body_template: template?.body_template || "",
    },
  });

  // Reset form when template changes
  useEffect(() => {
    if (template) {
      reset({
        name: template.name,
        category: template.category || "",
        subject_template: template.subject_template,
        body_template: template.body_template,
      });
    } else {
      reset({
        name: "",
        category: "",
        subject_template: "",
        body_template: "",
      });
    }
  }, [template, reset]);

  const insertVariable = (key: string, field: "subject_template" | "body_template") => {
    const currentValue = watch(field);
    setValue(field, `${currentValue}{{${key}}}`);
  };

  const onSubmit = async (data: TemplateFormValues) => {
    try {
      if (isEditing) {
        await updateTemplate.mutateAsync({
          id: template.id,
          updates: data,
        });
        toast.success("Template updated!");
      } else {
        await createTemplate.mutateAsync({
          ...data,
          user_id: DEFAULT_USER_ID,
        });
        toast.success("Template created!");
      }
      reset();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save template");
    }
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Template" : "Create Template"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Meeting Request"
                {...register("name")}
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={watch("category")}
                onValueChange={(v) => setValue("category", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_TEMPLATE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Variables */}
          <div className="space-y-2">
            <Label>Insert Variable</Label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((v) => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => insertVariable(v.key, "body_template")}
                >
                  {`{{${v.key}}}`}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line *</Label>
            <Input
              id="subject"
              placeholder="e.g., Quick question, {{first_name}}"
              {...register("subject_template")}
              className={errors.subject_template ? "border-destructive" : ""}
            />
            {errors.subject_template && (
              <p className="text-sm text-destructive">{errors.subject_template.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Email Body *</Label>
            <Textarea
              id="body"
              placeholder="Hi {{first_name}},&#10;&#10;I hope this finds you well..."
              {...register("body_template")}
              className={`min-h-[200px] ${errors.body_template ? "border-destructive" : ""}`}
            />
            {errors.body_template && (
              <p className="text-sm text-destructive">{errors.body_template.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
