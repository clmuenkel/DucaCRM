"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insforge } from "@/lib/neon/client";
import type { MeetingNote, InsertTables, UpdateTables } from "@/types/database";
import { format, addDays } from "date-fns";

// Extended type for meeting notes with linked tasks
export interface MeetingNoteWithTask extends MeetingNote {
  tasks: { id: string; title: string; status: string } | null;
}

export function useMeetingNotes(meetingId: string) {
    return useQuery<MeetingNoteWithTask[]>({
    queryKey: ["meeting-notes", meetingId],
    queryFn: async () => {
      if (!meetingId) return [];

      const { data, error } = await insforge.database
        .from("meeting_notes")
        .select("*, tasks(id, title, status)")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as unknown as MeetingNoteWithTask[];
    },
    enabled: !!meetingId,
  });
}

export function useCreateMeetingNote() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (note: InsertTables<"meeting_notes">) => {
      const { data, error } = await insforge.database
        .from("meeting_notes")
        .insert([note])
        .select()
        .single();

      if (error) throw error;
      return data as MeetingNote;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-notes", data.meeting_id] });
    },
  });
}

export function useUpdateMeetingNote() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      meetingId,
      updates,
    }: {
      id: string;
      meetingId: string;
      updates: UpdateTables<"meeting_notes">;
    }) => {
      const { data, error } = await insforge.database
        .from("meeting_notes")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, meetingId } as MeetingNote & { meetingId: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-notes", data.meetingId] });
    },
  });
}

export function useDeleteMeetingNote() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, meetingId }: { id: string; meetingId: string }) => {
      const { error } = await insforge.database.from("meeting_notes").delete().eq("id", id);
      if (error) throw error;
      return { meetingId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-notes", data.meetingId] });
    },
  });
}

/**
 * Toggle action item status on a meeting note
 * When marking as action item, auto-creates a task
 * When unmarking, optionally deletes the linked task
 */
export function useToggleActionItem() {
    const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      meetingId,
      isActionItem,
      noteContent,
      contactId,
      userId,
      meetingDate,
    }: {
      noteId: string;
      meetingId: string;
      isActionItem: boolean;
      noteContent: string;
      contactId: string;
      userId: string;
      meetingDate: string;
    }) => {
      if (isActionItem) {
        // Create a task for this action item
        const taskTitle = noteContent.length > 60 
          ? noteContent.substring(0, 60) + "..." 
          : noteContent;
        
        // Due date is day after the meeting
        const dueDate = format(addDays(new Date(meetingDate), 1), "yyyy-MM-dd");

        const { data: taskData, error: taskError } = await insforge.database
          .from("tasks")
          .insert({
            user_id: userId,
            contact_id: contactId,
            meeting_id: meetingId,
            title: taskTitle,
            type: "meeting_follow_up",
            priority: "medium",
            status: "todo",
            due_date: dueDate,
            description: `From meeting note: "${noteContent}"`,
          })
          .select()
          .single();

        if (taskError) throw taskError;

        // Update the note with task reference
        const { data, error } = await insforge.database
          .from("meeting_notes")
          .update({
            is_action_item: true,
            task_id: taskData.id,
          })
          .eq("id", noteId)
          .select()
          .single();

        if (error) throw error;
        return { note: data, meetingId };
      } else {
        // Get the current note to find linked task
        const { data: currentNote } = await insforge.database
          .from("meeting_notes")
          .select("task_id")
          .eq("id", noteId)
          .single();

        // Delete the linked task if exists
        if (currentNote?.task_id) {
          await insforge.database.from("tasks").delete().eq("id", currentNote.task_id);
        }

        // Update the note to remove action item status
        const { data, error } = await insforge.database
          .from("meeting_notes")
          .update({
            is_action_item: false,
            task_id: null,
          })
          .eq("id", noteId)
          .select()
          .single();

        if (error) throw error;
        return { note: data, meetingId };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meeting-notes", data.meetingId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// Extended type for action items with linked tasks (includes due_date)
export interface ActionItemWithTask extends MeetingNote {
  tasks: { id: string; title: string; status: string; due_date: string | null } | null;
}

/**
 * Get action items (notes marked as action items) for a meeting
 */
export function useMeetingActionItems(meetingId: string) {
    return useQuery<ActionItemWithTask[]>({
    queryKey: ["meeting-action-items", meetingId],
    queryFn: async () => {
      if (!meetingId) return [];

      const { data, error } = await insforge.database
        .from("meeting_notes")
        .select("*, tasks(id, title, status, due_date)")
        .eq("meeting_id", meetingId)
        .eq("is_action_item", true)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as unknown as ActionItemWithTask[];
    },
    enabled: !!meetingId,
  });
}
