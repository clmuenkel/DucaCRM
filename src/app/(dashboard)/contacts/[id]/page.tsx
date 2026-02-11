"use client";

import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { useContact, useUpdateContact, useDeleteContact } from "@/hooks/use-contacts";
import { useTasks } from "@/hooks/use-tasks";
import type { Task, Note } from "@/types/database";
import { useNotes, useCreateNote, useDeleteNote } from "@/hooks/use-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ActivityTimeline } from "@/components/contacts/activity-timeline";
import { ContactForm } from "@/components/contacts/contact-form";
import { MeetingsList } from "@/components/meetings/meetings-list";
import { MeetingDialog } from "@/components/dialer/meeting-dialog";
import { STAGES } from "@/lib/constants";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { formatPhone, copyToClipboard, getInitials, getValidPhone } from "@/lib/utils";
import {
  Phone,
  Mail,
  Linkedin,
  Building2,
  MapPin,
  Copy,
  Pencil,
  Trash2,
  ArrowLeft,
  CheckSquare,
  MessageSquare,
  ExternalLink,
  Calendar,
  Send,
  Loader2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const { data: contact, isLoading } = useContact(contactId);
  const { data: tasksData } = useTasks({ contactId, status: "todo", limit: 5 });
  const tasks = (tasksData ?? []) as Task[];
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  const { data: notesData } = useNotes({ contactId });
  const notes = (notesData ?? []) as Note[];
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  const [editOpen, setEditOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const userId = DEFAULT_USER_ID;

  const handleCopy = async (text: string, type: string) => {
    await copyToClipboard(text);
    toast.success(`${type} copied!`);
  };

  const handleUpdate = async (data: any) => {
    try {
      await updateContact.mutateAsync({
        id: contactId,
        updates: data,
      });
      toast.success("Contact updated!");
      setEditOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteContact.mutateAsync(contactId);
      toast.success("Contact deleted");
      router.push("/contacts");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  };

  const handleQualificationChange = async (field: string, value: boolean) => {
    await updateContact.mutateAsync({
      id: contactId,
      updates: { [field]: value },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Contact" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Contact" />
        <div className="p-6">
          <p>Contact not found</p>
          <Link href="/contacts">
            <Button variant="link">Back to contacts</Button>
          </Link>
        </div>
      </div>
    );
  }

  const stage = STAGES.find((s) => s.value === contact.stage);
  const qualificationScore =
    [contact.has_budget, contact.is_authority, contact.has_need, contact.has_timeline]
      .filter(Boolean).length * 25;

  return (
    <div className="flex flex-col h-full">
      <Header title={`${contact.first_name} ${contact.last_name || ""}`} />

      <div className="flex-1 p-6 overflow-auto">
        {/* Back button */}
        <Link href="/contacts" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Contacts
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Header Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="text-lg">
                        {getInitials(`${contact.first_name} ${contact.last_name || ""}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-2xl font-bold">
                        {contact.first_name} {contact.last_name}
                      </h2>
                      {contact.title && (
                        <p className="text-muted-foreground">{contact.title}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={contact.stage as any}>
                          {stage?.label || contact.stage}
                        </Badge>
                        {contact.tags?.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Contact</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this contact? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="grid gap-4 mt-6 sm:grid-cols-2">
                  {(() => {
                    const validPhone = getValidPhone(contact.phone, contact.mobile);
                    return validPhone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <button
                          onClick={() => handleCopy(validPhone, "Phone")}
                          className="text-sm hover:text-primary hover:underline flex items-center gap-1"
                        >
                          {formatPhone(validPhone)}
                          <Copy className="h-3 w-3 opacity-50" />
                        </button>
                      </div>
                    ) : null;
                  })()}
                  {contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <button
                        onClick={() => handleCopy(contact.email!, "Email")}
                        className="text-sm hover:text-primary hover:underline flex items-center gap-1"
                      >
                        {contact.email}
                        <Copy className="h-3 w-3 opacity-50" />
                      </button>
                    </div>
                  )}
                  {contact.linkedin_url && (
                    <div className="flex items-center gap-2">
                      <Linkedin className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:text-primary hover:underline flex items-center gap-1"
                      >
                        LinkedIn
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {contact.company_name && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {contact.company_name}
                        {contact.employee_count && ` • ${contact.employee_count.toLocaleString()} employees`}
                        {contact.employee_range && !contact.employee_count && ` (${contact.employee_range})`}
                      </span>
                    </div>
                  )}
                  {(contact.city || contact.state) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {[contact.city, contact.state].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2 mt-6 flex-wrap">
                  <Link href={`/dialer?contact=${contact.id}`}>
                    <Button>
                      <Phone className="mr-2 h-4 w-4" />
                      Call
                    </Button>
                  </Link>
                  <Button variant="outline">
                    <Mail className="mr-2 h-4 w-4" />
                    Email
                  </Button>
                  <Button variant="outline" onClick={() => setMeetingOpen(true)}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Schedule Meeting
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="activity">
              <TabsList>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="meetings">Meetings</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="emails">Emails</TabsTrigger>
              </TabsList>
              <TabsContent value="activity" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <ActivityTimeline contactId={contactId} />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="meetings" className="mt-4">
                <MeetingsList
                  contactId={contactId}
                  userId={userId}
                  title="Meetings"
                  showScheduleButton={true}
                  onScheduleClick={() => setMeetingOpen(true)}
                />
              </TabsContent>
              <TabsContent value="notes" className="mt-4">
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    {/* Add note */}
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Add a note..."
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        rows={2}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        className="self-end"
                        disabled={!newNoteText.trim() || createNote.isPending}
                        onClick={async () => {
                          try {
                            await createNote.mutateAsync({
                              user_id: userId,
                              contact_id: contactId,
                              content: newNoteText.trim(),
                            });
                            setNewNoteText("");
                            toast.success("Note added");
                          } catch (err: any) {
                            toast.error(err.message || "Failed to add note");
                          }
                        }}
                      >
                        {createNote.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {/* Notes list */}
                    {notes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No notes yet. Add one above.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {notes.map((note) => (
                          <div key={note.id} className="p-3 rounded-lg border bg-muted/30 group">
                            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-muted-foreground">
                                {new Date(note.created_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                                onClick={async () => {
                                  try {
                                    await deleteNote.mutateAsync(note.id);
                                    toast.success("Note deleted");
                                  } catch (err: any) {
                                    toast.error(err.message || "Failed to delete note");
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="emails" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center py-8">
                      Email history coming soon
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Qualification */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Qualification (BANT)
                  <span className="text-sm font-normal text-muted-foreground">
                    {qualificationScore}%
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={contact.has_budget}
                    onCheckedChange={(checked) =>
                      handleQualificationChange("has_budget", !!checked)
                    }
                  />
                  <span className="text-sm">Budget confirmed</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={contact.is_authority}
                    onCheckedChange={(checked) =>
                      handleQualificationChange("is_authority", !!checked)
                    }
                  />
                  <span className="text-sm">Decision maker</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={contact.has_need}
                    onCheckedChange={(checked) =>
                      handleQualificationChange("has_need", !!checked)
                    }
                  />
                  <span className="text-sm">Need identified</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={contact.has_timeline}
                    onCheckedChange={(checked) =>
                      handleQualificationChange("has_timeline", !!checked)
                    }
                  />
                  <span className="text-sm">Timeline established</span>
                </div>
              </CardContent>
            </Card>

            {/* Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Tasks
                  <Button variant="ghost" size="sm">
                    + Add
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No open tasks
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 text-sm">
                        <Checkbox />
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stats</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{contact.total_calls}</p>
                  <p className="text-xs text-muted-foreground">Calls</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{contact.total_emails}</p>
                  <p className="text-xs text-muted-foreground">Emails</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          <ContactForm
            contact={contact}
            onSubmit={handleUpdate}
            isLoading={updateContact.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Meeting Dialog */}
      <MeetingDialog
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        contact={contact}
        userId={userId}
      />
    </div>
  );
}
