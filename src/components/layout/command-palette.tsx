"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useContacts } from "@/hooks/use-contacts";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Users,
  Phone,
  Kanban,
  CheckSquare,
  Mail,
  Download,
  Plus,
  Search,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const pages = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Power Dialer", href: "/dialer", icon: Phone },
  { name: "Pipeline", href: "/pipeline", icon: Kanban },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Email Templates", href: "/templates", icon: Mail },
  { name: "Import from Apollo", href: "/import", icon: Download },
];

const actions = [
  { name: "New Contact", action: "/contacts/new", icon: Plus },
  { name: "New Task", action: "/tasks?new=true", icon: Plus },
  { name: "Start Calling", action: "/dialer", icon: Phone },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { data: contacts } = useContacts({ search: search, limit: 5 });

  // Toggle the menu with ⌘K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search contacts, pages, or actions..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden">
            <Command.Empty className="py-6 text-center text-sm">
              No results found.
            </Command.Empty>

            {/* Quick Actions */}
            <Command.Group heading="Quick Actions">
              {actions.map((action) => (
                <Command.Item
                  key={action.name}
                  value={action.name}
                  onSelect={() => runCommand(() => router.push(action.action))}
                  className="cursor-pointer"
                >
                  <action.icon className="mr-2 h-4 w-4" />
                  {action.name}
                </Command.Item>
              ))}
            </Command.Group>

            {/* Contacts */}
            {contacts && contacts.length > 0 && (
              <Command.Group heading="Contacts">
                {contacts.map((contact) => (
                  <Command.Item
                    key={contact.id}
                    value={`${contact.first_name} ${contact.last_name} ${contact.company_name}`}
                    onSelect={() => runCommand(() => router.push(`/contacts/${contact.id}`))}
                    className="cursor-pointer"
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span>
                      {contact.first_name} {contact.last_name}
                      {contact.company_name && (
                        <span className="text-muted-foreground"> • {contact.company_name}</span>
                      )}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Pages */}
            <Command.Group heading="Pages">
              {pages.map((page) => (
                <Command.Item
                  key={page.href}
                  value={page.name}
                  onSelect={() => runCommand(() => router.push(page.href))}
                  className="cursor-pointer"
                >
                  <page.icon className="mr-2 h-4 w-4" />
                  {page.name}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
