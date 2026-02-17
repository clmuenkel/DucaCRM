import { NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = "force-dynamic";

const KNOWN_STATUSES = ["pending", "enriched", "no_email", "no_match"] as const;

type EnrichmentStatus = (typeof KNOWN_STATUSES)[number];

export async function GET() {
  try {
    const { data, error } = await insforge.database
      .from("contacts")
      .select("enrichment_status, count:count(*)")
      .eq("user_id", DEFAULT_USER_ID)
      .group("enrichment_status");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts: Record<EnrichmentStatus | "total", number> = {
      total: 0,
      pending: 0,
      enriched: 0,
      no_email: 0,
      no_match: 0,
    };

    for (const row of data || []) {
      const typedRow = row as { enrichment_status: string | null; count: number };
      const status = typedRow.enrichment_status as EnrichmentStatus | null;
      const countValue = Number(typedRow.count) || 0;
      counts.total += countValue;

      if (status && (KNOWN_STATUSES as readonly string[]).includes(status)) {
        counts[status as EnrichmentStatus] = countValue;
      }
    }

    return NextResponse.json(counts);
  } catch (error: any) {
    console.error("[contacts/enrich-stats] failed", error);
    return NextResponse.json(
      { error: error.message || "Unable to load enrichment stats" },
      { status: 500 }
    );
  }
}
