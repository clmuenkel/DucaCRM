"use client";

import { useState } from "react";
import { useDialerStore } from "@/stores/dialer-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ListChecks, MessageSquare, AlertTriangle } from "lucide-react";

export function CallScript() {
  const { currentContact } = useDialerStore();
  const [checklist, setChecklist] = useState({
    introduced: false,
    valueProp: false,
    qualifyBudget: false,
    qualifyAuthority: false,
    qualifyNeed: false,
    qualifyTimeline: false,
    nextSteps: false,
  });

  const firstName = currentContact?.first_name || "[Name]";
  const companyName = currentContact?.company_name || "[Company]";
  
  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = Object.keys(checklist).length;

  const toggleChecklistItem = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Call Script</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {currentContact?.industry || "General"}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Progress Checklist */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Call Checklist
                </div>
                <Badge variant="secondary" className="text-xs">
                  {completedCount}/{totalCount}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="space-y-2">
                <label 
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  onClick={() => toggleChecklistItem("introduced")}
                >
                  <Checkbox checked={checklist.introduced} />
                  <span className={checklist.introduced ? "line-through text-muted-foreground" : ""}>
                    Introduced yourself
                  </span>
                </label>
                <label 
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  onClick={() => toggleChecklistItem("valueProp")}
                >
                  <Checkbox checked={checklist.valueProp} />
                  <span className={checklist.valueProp ? "line-through text-muted-foreground" : ""}>
                    Delivered value prop
                  </span>
                </label>
                <label 
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  onClick={() => toggleChecklistItem("qualifyBudget")}
                >
                  <Checkbox checked={checklist.qualifyBudget} />
                  <span className={checklist.qualifyBudget ? "line-through text-muted-foreground" : ""}>
                    Asked about budget
                  </span>
                </label>
                <label 
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  onClick={() => toggleChecklistItem("qualifyAuthority")}
                >
                  <Checkbox checked={checklist.qualifyAuthority} />
                  <span className={checklist.qualifyAuthority ? "line-through text-muted-foreground" : ""}>
                    Confirmed decision maker
                  </span>
                </label>
                <label 
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  onClick={() => toggleChecklistItem("qualifyNeed")}
                >
                  <Checkbox checked={checklist.qualifyNeed} />
                  <span className={checklist.qualifyNeed ? "line-through text-muted-foreground" : ""}>
                    Identified need/pain point
                  </span>
                </label>
                <label 
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  onClick={() => toggleChecklistItem("qualifyTimeline")}
                >
                  <Checkbox checked={checklist.qualifyTimeline} />
                  <span className={checklist.qualifyTimeline ? "line-through text-muted-foreground" : ""}>
                    Discussed timeline
                  </span>
                </label>
                <label 
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  onClick={() => toggleChecklistItem("nextSteps")}
                >
                  <Checkbox checked={checklist.nextSteps} />
                  <span className={checklist.nextSteps ? "line-through text-muted-foreground" : ""}>
                    Established next steps
                  </span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Opening */}
          <Card className="bg-card/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500" />
                Opening
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <p className="text-sm italic text-muted-foreground leading-relaxed">
                "Hi <span className="text-foreground font-medium">{firstName}</span>, this is [Your Name] from [Your Company]. I know I'm
                catching you out of the blue - do you have 30 seconds?"
              </p>
            </CardContent>
          </Card>

          {/* Value Prop */}
          <Card className="bg-card/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Value Proposition
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <p className="text-sm italic text-muted-foreground leading-relaxed">
                "I work with {currentContact?.industry === "hvac" ? "HVAC companies" : 
                  currentContact?.industry === "plumbing" ? "plumbing companies" : 
                  currentContact?.industry === "roofing" ? "roofing contractors" :
                  currentContact?.industry === "electrical" ? "electrical contractors" :
                  currentContact?.industry === "solar" ? "solar installers" :
                  currentContact?.industry === "construction" ? "general contractors" : "home services companies"} like <span className="text-foreground font-medium">{companyName}</span> to help them
                [specific value prop]. Would it make sense to have a quick 15-minute
                call to see if this could help?"
              </p>
            </CardContent>
          </Card>

          {/* Qualifying Questions */}
          <Card className="bg-card/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-purple-500" />
                Qualifying Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  What's your current process for [pain point]?
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Who else would be involved in evaluating something like this?
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  What's your timeline for making a decision?
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Do you have budget allocated for this type of solution?
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Objection Handlers */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h4 className="text-sm font-medium">Objection Handlers</h4>
            </div>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="not-interested" className="border rounded-lg bg-card/50 px-3">
                <AccordionTrigger className="text-sm py-3 hover:no-underline">
                  "Not interested"
                </AccordionTrigger>
                <AccordionContent className="text-sm italic text-muted-foreground pb-3">
                  "Totally understand. Quick question before I go - what would
                  need to change for this to become a priority?"
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="send-email" className="border rounded-lg bg-card/50 px-3 mt-2">
                <AccordionTrigger className="text-sm py-3 hover:no-underline">
                  "Send me an email"
                </AccordionTrigger>
                <AccordionContent className="text-sm italic text-muted-foreground pb-3">
                  "Happy to do that. What specifically would you like me to
                  include so it's most relevant to you?"
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="bad-timing" className="border rounded-lg bg-card/50 px-3 mt-2">
                <AccordionTrigger className="text-sm py-3 hover:no-underline">
                  "Bad timing / too busy"
                </AccordionTrigger>
                <AccordionContent className="text-sm italic text-muted-foreground pb-3">
                  "I completely understand. When would be a better time for a
                  brief conversation? I can work around your schedule."
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="have-solution" className="border rounded-lg bg-card/50 px-3 mt-2">
                <AccordionTrigger className="text-sm py-3 hover:no-underline">
                  "We already have a solution"
                </AccordionTrigger>
                <AccordionContent className="text-sm italic text-muted-foreground pb-3">
                  "That's great to hear! Out of curiosity, who are you using
                  currently? What do you like most about them? What would you
                  change if you could?"
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="no-budget" className="border rounded-lg bg-card/50 px-3 mt-2">
                <AccordionTrigger className="text-sm py-3 hover:no-underline">
                  "No budget"
                </AccordionTrigger>
                <AccordionContent className="text-sm italic text-muted-foreground pb-3">
                  "I understand budget is always a consideration. When do you
                  typically plan for next year's budget? I'd love to at least
                  share some information so you have it when the time is right."
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Close */}
          <Card className="bg-card/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-500" />
                Close / Next Steps
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div>
                <p className="text-xs font-medium text-emerald-500 mb-1">If interested:</p>
                <p className="text-sm italic text-muted-foreground">
                  "Great! Let me send you a calendar invite. Does [specific time] work for you?"
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-amber-500 mb-1">If not now:</p>
                <p className="text-sm italic text-muted-foreground">
                  "I'll follow up in [timeframe]. In the meantime, I'll send over some information that might be
                  helpful. Thanks for your time, <span className="text-foreground font-medium">{firstName}</span>!"
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
