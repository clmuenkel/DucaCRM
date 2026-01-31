"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Calendar,
  PhoneOff,
  X,
  UserPlus,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { Contact } from "@/types/database";

interface QuickActionsProps {
  contact: Contact;
  onActionComplete: () => void;
  onNextContact: () => void;
}

export function QuickActions({ contact, onActionComplete, onNextContact }: QuickActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showWrongNumberDialog, setShowWrongNumberDialog] = useState(false);
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [phoneType, setPhoneType] = useState<"mobile" | "office">("mobile");
  const [referralData, setReferralData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    mobile: "",
    title: "",
    notes: "",
  });

  const handleScheduleMeeting = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/contacts/schedule-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("Meeting scheduling email sent!");
      setShowScheduleDialog(false);
      onActionComplete();
      onNextContact();
    } catch (error: any) {
      toast.error(error.message || "Failed to send scheduling email");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNoAnswer = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/contacts/update-call-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("Call attempt recorded");
      onActionComplete();
      onNextContact();
    } catch (error: any) {
      toast.error(error.message || "Failed to update call attempt");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWrongNumber = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/contacts/mark-wrong-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          phoneType: phoneType,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("Wrong number marked and removed");
      setShowWrongNumberDialog(false);
      onActionComplete();
      onNextContact();
    } catch (error: any) {
      toast.error(error.message || "Failed to mark wrong number");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNotInterested = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/contacts/mark-not-interested", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("Contact marked as not interested");
      onActionComplete();
      onNextContact();
    } catch (error: any) {
      toast.error(error.message || "Failed to mark as not interested");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateReferral = async () => {
    if (!referralData.firstName.trim()) {
      toast.error("First name is required");
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/contacts/create-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceContactId: contact.id,
          ...referralData,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success("Referral contact created!");
      setShowReferralDialog(false);
      setReferralData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        mobile: "",
        title: "",
        notes: "",
      });
      onActionComplete();
    } catch (error: any) {
      toast.error(error.message || "Failed to create referral");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2 p-4 border-t bg-muted/30">
        <Button
          onClick={() => setShowScheduleDialog(true)}
          className="bg-green-600 hover:bg-green-700 text-white"
          disabled={isProcessing}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Schedule Meeting
        </Button>
        <Button
          onClick={handleNoAnswer}
          variant="secondary"
          disabled={isProcessing}
        >
          <PhoneOff className="h-4 w-4 mr-2" />
          No Answer
        </Button>
        <Button
          onClick={() => setShowWrongNumberDialog(true)}
          variant="destructive"
          disabled={isProcessing}
        >
          <X className="h-4 w-4 mr-2" />
          Wrong Number
        </Button>
        <Button
          onClick={handleNotInterested}
          variant="outline"
          disabled={isProcessing}
        >
          <X className="h-4 w-4 mr-2" />
          Not Interested
        </Button>
        <Button
          onClick={() => setShowReferralDialog(true)}
          variant="outline"
          className="col-span-2"
          disabled={isProcessing}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Create Referral
        </Button>
      </div>

      {/* Schedule Meeting Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Meeting</DialogTitle>
            <DialogDescription>
              Send a scheduling email to {contact.first_name} {contact.last_name}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleMeeting} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wrong Number Dialog */}
      <Dialog open={showWrongNumberDialog} onOpenChange={setShowWrongNumberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Wrong Number</DialogTitle>
            <DialogDescription>
              Which phone number was wrong?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Phone Type</Label>
              <select
                value={phoneType}
                onChange={(e) => setPhoneType(e.target.value as "mobile" | "office")}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="mobile">Mobile ({contact.mobile || "N/A"})</option>
                <option value="office">Office ({contact.phone || "N/A"})</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWrongNumberDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleWrongNumber} variant="destructive" disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Mark Wrong Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Referral Dialog */}
      <Dialog open={showReferralDialog} onOpenChange={setShowReferralDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Referral Contact</DialogTitle>
            <DialogDescription>
              Create a new contact from {contact.company_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={referralData.firstName}
                  onChange={(e) =>
                    setReferralData({ ...referralData, firstName: e.target.value })
                  }
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={referralData.lastName}
                  onChange={(e) =>
                    setReferralData({ ...referralData, lastName: e.target.value })
                  }
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={referralData.email}
                onChange={(e) =>
                  setReferralData({ ...referralData, email: e.target.value })
                }
                placeholder="john@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mobile Phone</Label>
                <Input
                  value={referralData.mobile}
                  onChange={(e) =>
                    setReferralData({ ...referralData, mobile: e.target.value })
                  }
                  placeholder="+1234567890"
                />
              </div>
              <div className="space-y-2">
                <Label>Office Phone</Label>
                <Input
                  value={referralData.phone}
                  onChange={(e) =>
                    setReferralData({ ...referralData, phone: e.target.value })
                  }
                  placeholder="+1234567890"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={referralData.title}
                onChange={(e) =>
                  setReferralData({ ...referralData, title: e.target.value })
                }
                placeholder="VP of Sales"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={referralData.notes}
                onChange={(e) =>
                  setReferralData({ ...referralData, notes: e.target.value })
                }
                placeholder="Referred by..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReferralDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateReferral} disabled={isProcessing}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Create Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
