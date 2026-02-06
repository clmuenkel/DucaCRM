"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebarState } from "@/stores/ui-store";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  LayoutDashboard,
  Users,
  Building2,
  Phone,
  Kanban,
  CheckSquare,
  Mail,
  Download,
  PanelLeftClose,
  PanelLeft,
  Calendar,
  CalendarCheck,
  BarChart3,
  Sparkles,
  ListTodo,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Lead Gen", href: "/leadgen", icon: Sparkles },
  { name: "Work Queue", href: "/workqueue", icon: ListTodo },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Companies", href: "/companies", icon: Building2 },
  { name: "Power Dialer", href: "/dialer", icon: Phone },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Pipeline", href: "/pipeline", icon: Kanban },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Templates", href: "/templates", icon: Mail },
  { name: "Import", href: "/import", icon: Download },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebarState();

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out overflow-hidden",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-16 items-center gap-2 px-4 shrink-0",
        isCollapsed && "justify-center px-2"
      )}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shrink-0">
          <Phone className="h-5 w-5 text-primary-foreground" />
        </div>
        <span 
          className={cn(
            "text-xl font-bold tracking-tight transition-all duration-300",
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          )}
        >
          DucaCRM
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          
          const linkContent = (
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isCollapsed && "justify-center px-2",
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "drop-shadow-sm")} />
              <span 
                className={cn(
                  "transition-all duration-300 whitespace-nowrap",
                  isCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                )}
              >
                {item.name}
              </span>
            </Link>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.name} delayDuration={0}>
                <TooltipTrigger asChild>
                  {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {item.name}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.name}>{linkContent}</div>;
        })}
      </nav>

      <Separator className="bg-sidebar-foreground/10" />

      {/* Bottom section */}
      <div className="p-2 space-y-1 shrink-0">
        {/* Theme Toggle */}
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div>
                <ThemeToggle 
                  collapsed={true}
                  className="w-full text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground justify-center" 
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Toggle Theme
            </TooltipContent>
          </Tooltip>
        ) : (
          <ThemeToggle 
            showLabel 
            className="w-full text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground px-3" 
          />
        )}

        {/* Collapse Toggle */}
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="w-full text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
              >
                <PanelLeft className="h-5 w-5 transition-transform duration-200" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Expand Sidebar
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            onClick={toggleSidebar}
            className="w-full justify-start gap-3 px-3 text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground"
          >
            <PanelLeftClose className="h-5 w-5 shrink-0 transition-transform duration-200" />
            <span className="whitespace-nowrap">Collapse</span>
          </Button>
        )}
      </div>
    </div>
  );
}
