"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { INDUSTRIES } from "@/lib/constants";
import { X } from "lucide-react";

interface IndustrySelectorProps {
  value: string[];
  onChange: (industries: string[]) => void;
  allowCustom?: boolean;
  className?: string;
}

export function IndustrySelector({
  value = [],
  onChange,
  allowCustom = false,
  className = "",
}: IndustrySelectorProps) {
  const [open, setOpen] = useState(false);
  const [customIndustry, setCustomIndustry] = useState("");

  const handleToggle = (industryValue: string) => {
    if (value.includes(industryValue)) {
      onChange(value.filter((v) => v !== industryValue));
    } else {
      onChange([...value, industryValue]);
    }
  };

  const handleAddCustom = () => {
    if (customIndustry.trim() && !value.includes(customIndustry.trim().toLowerCase())) {
      onChange([...value, customIndustry.trim().toLowerCase()]);
      setCustomIndustry("");
    }
  };

  const handleRemove = (industryValue: string) => {
    onChange(value.filter((v) => v !== industryValue));
  };

  const getIndustryLabel = (industryValue: string) => {
    const industry = INDUSTRIES.find((i) => i.value === industryValue);
    return industry ? industry.label : industryValue.charAt(0).toUpperCase() + industryValue.slice(1);
  };

  return (
    <div className={className}>
      <Label className="mb-2 block">Industries</Label>
      
      {/* Selected industries as badges */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map((industryValue) => (
            <Badge
              key={industryValue}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {getIndustryLabel(industryValue)}
              <button
                type="button"
                onClick={() => handleRemove(industryValue)}
                className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Multi-select popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" type="button" className="w-full justify-start">
            {value.length === 0 ? "Select industries..." : `${value.length} selected`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Select Industries</Label>
            
            {/* Standard industries */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {INDUSTRIES.map((industry) => (
                <div key={industry.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`industry-${industry.value}`}
                    checked={value.includes(industry.value)}
                    onCheckedChange={() => handleToggle(industry.value)}
                  />
                  <Label
                    htmlFor={`industry-${industry.value}`}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {industry.label}
                  </Label>
                </div>
              ))}
            </div>

            {/* Custom industry input */}
            {allowCustom && (
              <div className="pt-2 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customIndustry}
                    onChange={(e) => setCustomIndustry(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustom();
                      }
                    }}
                    placeholder="Custom industry..."
                    className="flex-1 px-2 py-1 text-sm border rounded"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddCustom}
                    disabled={!customIndustry.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
