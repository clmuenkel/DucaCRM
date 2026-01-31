"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WrongNumberFlagProps {
  wrongNumberPhone?: string | null;
}

export function WrongNumberFlag({ wrongNumberPhone }: WrongNumberFlagProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="destructive" className="bg-red-600 text-white border-red-700 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Wrong Number
        </Badge>
      </TooltipTrigger>
      {wrongNumberPhone && (
        <TooltipContent>
          <p>Wrong number: {wrongNumberPhone}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}
