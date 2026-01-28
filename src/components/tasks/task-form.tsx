"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTask } from "@/hooks/use-tasks";
import { useContacts } from "@/hooks/use-contacts";
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
import { TASK_TYPES, TASK_PRIORITIES } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.string().default("follow_up"),
  priority: z.string().default("medium"),
  due_date: z.string().optional(),
  contact_id: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultContactId?: string;
}

export function TaskForm({ open, onOpenChange, defaultContactId }: TaskFormProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();
  const createTask = useCreateTask();
  const { data: contacts } = useContacts();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, [supabase]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "follow_up",
      priority: "medium",
      due_date: "",
      contact_id: defaultContactId || "_none",
    },
  });

  const onSubmit = async (data: TaskFormValues) => {
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }

    try {
      await createTask.mutateAsync({
        ...data,
        user_id: userId,
        due_date: data.due_date ? new Date(data.due_date).toISOString() : null,
        contact_id: data.contact_id && data.contact_id !== "_none" ? data.contact_id : null,
      });
      toast.success("Task created!");
      reset();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create task");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Follow up with John"
              {...register("title")}
              className={errors.title ? "border-destructive" : ""}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Add more details..."
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={watch("type")}
                onValueChange={(v) => setValue("type", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={watch("priority")}
                onValueChange={(v) => setValue("priority", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date</Label>
            <Input id="due_date" type="datetime-local" {...register("due_date")} />
          </div>

          <div className="space-y-2">
            <Label>Related Contact</Label>
            <Select
              value={watch("contact_id")}
              onValueChange={(v) => setValue("contact_id", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select contact (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No contact</SelectItem>
                {contacts?.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name}
                    {contact.company_name && ` • ${contact.company_name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTask.isPending}>
              {createTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
