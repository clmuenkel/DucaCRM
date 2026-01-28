"use client";

import { useState } from "react";
import { useCompanies } from "@/hooks/use-companies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimezoneDisplay, getFriendlyTimezoneName } from "@/lib/timezone";
import { formatDistanceToNow } from "date-fns";
import { Search, Building2, Users, Clock, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CompanyWithStats } from "@/hooks/use-companies";

const INDUSTRY_FILTERS = [
  { value: "all", label: "All Industries" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "solar", label: "Solar" },
  { value: "construction", label: "General Contractors" },
];

export function CompanyList() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const router = useRouter();

  const { data: companies, isLoading } = useCompanies({
    search: search || undefined,
    industry: industryFilter !== "all" ? industryFilter : undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by industry" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRY_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Company</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-center">Contacts</TableHead>
              <TableHead>Last Contacted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!companies || companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">No companies found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              companies.map((company) => (
                <CompanyRow
                  key={company.id}
                  company={company}
                  onClick={() => router.push(`/companies/${company.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CompanyRow({
  company,
  onClick,
}: {
  company: CompanyWithStats;
  onClick: () => void;
}) {
  const location = [company.city, company.state].filter(Boolean).join(", ");
  const timezoneDisplay = company.timezone 
    ? getFriendlyTimezoneName(company.timezone)
    : null;

  return (
    <TableRow 
      className="group cursor-pointer transition-colors"
      onClick={onClick}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{company.name}</p>
            {company.domain && (
              <p className="text-sm text-muted-foreground">{company.domain}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {company.industry ? (
          <Badge variant="outline">{company.industry}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {company.employee_count || company.employee_range ? (
          <span className="text-sm">
            {company.employee_count 
              ? `${company.employee_count.toLocaleString()}` 
              : company.employee_range}
            {company.employee_count && company.employee_range && (
              <span className="text-xs text-muted-foreground ml-1">({company.employee_range})</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 text-sm">
          {location ? (
            <>
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <span>{location}</span>
              {timezoneDisplay && (
                <span className="text-muted-foreground ml-1">({timezoneDisplay})</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{company.contact_count}</span>
        </div>
      </TableCell>
      <TableCell>
        {company.last_contacted_at ? (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(company.last_contacted_at), { addSuffix: true })}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Never</span>
        )}
      </TableCell>
    </TableRow>
  );
}
