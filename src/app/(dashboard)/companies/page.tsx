import { CompanyList } from "@/components/companies/company-list";
import { Building2 } from "lucide-react";

export default function CompaniesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Companies
          </h1>
          <p className="text-muted-foreground">
            Account-level view of companies and their engagement
          </p>
        </div>
      </div>

      {/* Company List */}
      <CompanyList />
    </div>
  );
}
