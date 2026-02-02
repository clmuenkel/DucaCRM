"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ContactForm } from "@/components/contacts/contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { useCreateContact } from "@/hooks/use-contacts";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { toast } from "sonner";
import { useState } from "react";

export const dynamic = 'force-dynamic';

export default function NewContactPage() {
  const router = useRouter();
  const createContact = useCreateContact();
  const userId = DEFAULT_USER_ID;

  const handleSubmit = async (data: any) => {
    try {
      const contact = await createContact.mutateAsync({
        ...data,
        user_id: userId,
      });
      toast.success("Contact created!");
      router.push(`/contacts/${contact.id}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create contact");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="New Contact" />
      
      <div className="flex-1 p-6">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6">
            <ContactForm
              onSubmit={handleSubmit}
              isLoading={createContact.isPending}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
