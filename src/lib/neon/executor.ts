/**
 * Server-side SQL executor: converts QueryDescriptor → SQL via @neondatabase/serverless
 */

import { query as dbQuery } from "./sql";
import type { QueryDescriptor } from "./query-builder";

// Foreign key relationships for JOIN support
const FK_MAP: Record<string, Record<string, { fk: string; pk: string }>> = {
  calls: { contacts: { fk: "contact_id", pk: "id" } },
  tasks: { contacts: { fk: "contact_id", pk: "id" } },
  meetings: { contacts: { fk: "contact_id", pk: "id" } },
  activity_log: { contacts: { fk: "contact_id", pk: "id" } },
  notes: { contacts: { fk: "contact_id", pk: "id" } },
  meeting_notes: { meetings: { fk: "meeting_id", pk: "id" }, tasks: { fk: "task_id", pk: "id" } },
  call_list_items: { contacts: { fk: "contact_id", pk: "id" } },
  emails: { contacts: { fk: "contact_id", pk: "id" } },
  telnyx_calls: { contacts: { fk: "contact_id", pk: "id" } },
  email_sends: { contacts: { fk: "contact_id", pk: "id" }, email_campaigns: { fk: "campaign_id", pk: "id" } },
  cold_calling_queue: { contacts: { fk: "contact_id", pk: "id" } },
};

// ────────────────────────────────────────────────────────────
// Parse select columns + joins
// ────────────────────────────────────────────────────────────

interface ParsedSelect {
  columns: string;
  joins: JoinDef[];
}

interface JoinDef {
  joinTable: string;
  joinAlias: string;
  fkColumn: string;
  joinColumns: string[];
}

function parseSelect(table: string, selectStr: string): ParsedSelect {
  const joinRegex = /(\w+)\(([^)]+)\)/g;
  const joins: JoinDef[] = [];

  let cleanSelect = selectStr;
  let match;

  while ((match = joinRegex.exec(selectStr)) !== null) {
    const joinTable = match[1];
    const joinCols = match[2].split(",").map((c) => c.trim());
    const fkInfo = FK_MAP[table]?.[joinTable];

    if (fkInfo) {
      joins.push({
        joinTable,
        joinAlias: `_j_${joinTable}`,
        fkColumn: fkInfo.fk,
        joinColumns: joinCols,
      });
    }

    cleanSelect = cleanSelect.replace(match[0], "").replace(/,\s*,/g, ",").trim();
  }

  cleanSelect = cleanSelect.replace(/^,|,$/g, "").trim() || "*";

  let columns: string;
  if (cleanSelect === "*") {
    columns = `"${table}".*`;
  } else {
    columns = cleanSelect
      .split(",")
      .map((c) => `"${table}".${c.trim()}`)
      .join(", ");
  }

  for (const j of joins) {
    const jsonFields = j.joinColumns
      .map((col) => `'${col}', "${j.joinAlias}"."${col}"`)
      .join(", ");
    columns += `, CASE WHEN "${j.joinAlias}"."id" IS NOT NULL THEN json_build_object(${jsonFields}) ELSE NULL END AS "${j.joinTable}"`;
  }

  return { columns, joins };
}

// ────────────────────────────────────────────────────────────
// Build WHERE clause
// ────────────────────────────────────────────────────────────

function buildWhere(
  table: string,
  filters: QueryDescriptor["filters"]
): { clause: string; params: any[] } {
  if (filters.length === 0) return { clause: "", params: [] };

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  for (const f of filters) {
    const col = `"${table}"."${f.column}"`;

    switch (f.type) {
      case "eq":
        conditions.push(`${col} = $${paramIdx++}`);
        params.push(f.value);
        break;
      case "neq":
        conditions.push(`${col} != $${paramIdx++}`);
        params.push(f.value);
        break;
      case "is":
        if (f.value === null) {
          conditions.push(`${col} IS NULL`);
        } else {
          conditions.push(`${col} IS $${paramIdx++}`);
          params.push(f.value);
        }
        break;
      case "gte":
        conditions.push(`${col} >= $${paramIdx++}`);
        params.push(f.value);
        break;
      case "gt":
        conditions.push(`${col} > $${paramIdx++}`);
        params.push(f.value);
        break;
      case "lte":
        conditions.push(`${col} <= $${paramIdx++}`);
        params.push(f.value);
        break;
      case "lt":
        conditions.push(`${col} < $${paramIdx++}`);
        params.push(f.value);
        break;
      case "like":
        conditions.push(`${col} LIKE $${paramIdx++}`);
        params.push(f.value);
        break;
      case "ilike":
        conditions.push(`${col} ILIKE $${paramIdx++}`);
        params.push(f.value);
        break;
      case "in":
        if (Array.isArray(f.value) && f.value.length > 0) {
          const placeholders = f.value.map(() => `$${paramIdx++}`).join(", ");
          conditions.push(`${col} IN (${placeholders})`);
          params.push(...f.value);
        } else {
          conditions.push("FALSE");
        }
        break;
      case "not.is":
        if (f.value === null) {
          conditions.push(`"${table}"."${f.column}" IS NOT NULL`);
        }
        break;
      case "or":
        const orResult = parseOrFilter(table, f.value, paramIdx);
        if (orResult.clause) {
          conditions.push(`(${orResult.clause})`);
          params.push(...orResult.params);
          paramIdx += orResult.params.length;
        }
        break;
      default:
        if (f.type.startsWith("not.")) {
          const innerOp = f.type.substring(4);
          if (innerOp === "is" && f.value === null) {
            conditions.push(`"${table}"."${f.column}" IS NOT NULL`);
          }
        }
        break;
    }
  }

  return {
    clause: conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "",
    params,
  };
}

// ────────────────────────────────────────────────────────────
// Parse Supabase-style .or() filter strings
// ────────────────────────────────────────────────────────────

function parseOrFilter(
  table: string,
  filterStr: string,
  startParamIdx: number
): { clause: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  let paramIdx = startParamIdx;

  const segments = filterStr.split(",");

  for (const segment of segments) {
    const trimmed = segment.trim();

    let col: string;
    let op: string;
    let val: string;

    if (trimmed.includes(".not.is.")) {
      const idx = trimmed.indexOf(".not.is.");
      col = trimmed.substring(0, idx);
      op = "not.is";
      val = trimmed.substring(idx + 8);
    } else if (trimmed.includes(".is.")) {
      const idx = trimmed.indexOf(".is.");
      col = trimmed.substring(0, idx);
      op = "is";
      val = trimmed.substring(idx + 4);
    } else {
      const firstDot = trimmed.indexOf(".");
      if (firstDot === -1) continue;
      const secondDot = trimmed.indexOf(".", firstDot + 1);
      if (secondDot === -1) continue;

      col = trimmed.substring(0, firstDot);
      op = trimmed.substring(firstDot + 1, secondDot);
      val = trimmed.substring(secondDot + 1);
    }

    const quotedCol = `"${table}"."${col}"`;

    switch (op) {
      case "eq":
        parts.push(`${quotedCol} = $${paramIdx++}`);
        params.push(val);
        break;
      case "neq":
        parts.push(`${quotedCol} != $${paramIdx++}`);
        params.push(val);
        break;
      case "ilike":
        parts.push(`${quotedCol} ILIKE $${paramIdx++}`);
        params.push(val);
        break;
      case "like":
        parts.push(`${quotedCol} LIKE $${paramIdx++}`);
        params.push(val);
        break;
      case "is":
        if (val === "null") parts.push(`${quotedCol} IS NULL`);
        else if (val === "true") parts.push(`${quotedCol} IS TRUE`);
        else if (val === "false") parts.push(`${quotedCol} IS FALSE`);
        break;
      case "not.is":
        if (val === "null") parts.push(`${quotedCol} IS NOT NULL`);
        break;
      case "gte":
        parts.push(`${quotedCol} >= $${paramIdx++}`);
        params.push(val);
        break;
      case "gt":
        parts.push(`${quotedCol} > $${paramIdx++}`);
        params.push(val);
        break;
      case "lte":
        parts.push(`${quotedCol} <= $${paramIdx++}`);
        params.push(val);
        break;
      case "lt":
        parts.push(`${quotedCol} < $${paramIdx++}`);
        params.push(val);
        break;
    }
  }

  return {
    clause: parts.join(" OR "),
    params,
  };
}

// ────────────────────────────────────────────────────────────
// Build ORDER BY
// ────────────────────────────────────────────────────────────

function buildOrderBy(table: string, orders: QueryDescriptor["orders"]): string {
  if (orders.length === 0) return "";
  const parts = orders.map((o) => {
    const dir = o.ascending ? "ASC" : "DESC";
    const nulls = o.nullsFirst ? "NULLS FIRST" : "NULLS LAST";
    return `"${table}"."${o.column}" ${dir} ${nulls}`;
  });
  return " ORDER BY " + parts.join(", ");
}

// ────────────────────────────────────────────────────────────
// Run a raw SQL query via the Neon serverless driver
// ────────────────────────────────────────────────────────────

async function runQuery(queryText: string, params: any[]): Promise<any[]> {
  return dbQuery(queryText, params);
}

// ────────────────────────────────────────────────────────────
// Main Executor
// ────────────────────────────────────────────────────────────

export async function executeQuery(
  desc: QueryDescriptor
): Promise<{ data: any; error: any; count?: number }> {
  try {
    switch (desc.operation) {
      // ── SELECT ──
      case "select": {
        const where = buildWhere(desc.table, desc.filters);

        // COUNT-only query (head: true, count: "exact")
        if (desc.headMode && desc.countMode === "exact") {
          const countQuery = `SELECT COUNT(*) AS cnt FROM "${desc.table}"${where.clause}`;
          const countRows = await runQuery(countQuery, where.params);
          const count = parseInt(countRows[0]?.cnt ?? "0", 10);
          return { data: null, error: null, count };
        }

        const parsed = parseSelect(desc.table, desc.columns);
        const orderBy = buildOrderBy(desc.table, desc.orders);
        const limit = desc.limitVal ? ` LIMIT ${desc.limitVal}` : "";

        let joinSQL = "";
        for (const j of parsed.joins) {
          joinSQL += ` LEFT JOIN "${j.joinTable}" AS "${j.joinAlias}" ON "${desc.table}"."${j.fkColumn}" = "${j.joinAlias}"."${j.joinColumns.includes("id") ? "id" : j.joinColumns[0]}"`;
        }

        const query = `SELECT ${parsed.columns} FROM "${desc.table}"${joinSQL}${where.clause}${orderBy}${limit}`;
        const rows = await runQuery(query, where.params);

        const result: { data: any; error: any; count?: number } = { data: null, error: null };

        // If count was also requested (without head), include it
        if (desc.countMode === "exact") {
          const countQuery = `SELECT COUNT(*) AS cnt FROM "${desc.table}"${where.clause}`;
          const countRows = await runQuery(countQuery, where.params);
          result.count = parseInt(countRows[0]?.cnt ?? "0", 10);
        }

        if (desc.mode === "single") {
          if (rows.length === 0) {
            return { data: null, error: { message: "Row not found", code: "PGRST116" } };
          }
          result.data = rows[0];
          return result;
        }
        if (desc.mode === "maybeSingle") {
          result.data = rows.length > 0 ? rows[0] : null;
          return result;
        }
        result.data = rows;
        return result;
      }

      // ── INSERT ──
      case "insert": {
        const items = desc.data as any[];
        if (!items || items.length === 0) {
          return { data: null, error: { message: "No data to insert" } };
        }

        const allKeys = new Set<string>();
        items.forEach((item) => Object.keys(item).forEach((k) => allKeys.add(k)));
        const cols = Array.from(allKeys);

        const colList = cols.map((c) => `"${c}"`).join(", ");
        const valueSets: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const item of items) {
          const placeholders = cols.map((c) => {
            const val = item[c];
            if (val === undefined) {
              return "DEFAULT";
            }
            params.push(typeof val === "object" && val !== null && !Array.isArray(val) ? JSON.stringify(val) : val);
            return `$${paramIdx++}`;
          });
          valueSets.push(`(${placeholders.join(", ")})`);
        }

        const returning = desc.columns && desc.columns !== "*"
          ? desc.columns.split(",").map((c) => `"${c.trim()}"`).join(", ")
          : "*";

        const query = `INSERT INTO "${desc.table}" (${colList}) VALUES ${valueSets.join(", ")} RETURNING ${returning}`;
        const rows = await runQuery(query, params);

        if (desc.mode === "single" || desc.mode === "maybeSingle") {
          return { data: rows.length > 0 ? rows[0] : null, error: null };
        }
        return { data: rows, error: null };
      }

      // ── UPDATE ──
      case "update": {
        const updateData = desc.data;
        if (!updateData || Object.keys(updateData).length === 0) {
          return { data: null, error: { message: "No data to update" } };
        }

        const setClauses: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const [key, val] of Object.entries(updateData)) {
          if (val === undefined) continue;
          const serialized = typeof val === "object" && val !== null && !Array.isArray(val) ? JSON.stringify(val) : val;
          setClauses.push(`"${key}" = $${paramIdx++}`);
          params.push(serialized);
        }

        // Try adding updated_at
        setClauses.push(`"updated_at" = NOW()`);

        const where = buildWhere(desc.table, desc.filters);
        let whereClause = where.clause;
        for (let i = where.params.length; i > 0; i--) {
          whereClause = whereClause.replace(
            `$${i}`,
            `$${i + paramIdx - 1}`
          );
        }
        params.push(...where.params);

        const returning = desc.columns ? ` RETURNING ${desc.columns === "*" ? "*" : desc.columns.split(",").map((c) => `"${c.trim()}"`).join(", ")}` : "";

        const query = `UPDATE "${desc.table}" SET ${setClauses.join(", ")}${whereClause}${returning}`;

        try {
          const rows = await runQuery(query, params);
          if (desc.mode === "single") {
            return { data: rows.length > 0 ? rows[0] : null, error: null };
          }
          return { data: rows, error: null };
        } catch (e: any) {
          // If update fails because updated_at doesn't exist, retry without it
          if (e.message?.includes("updated_at")) {
            setClauses.pop();
            const retryQuery = `UPDATE "${desc.table}" SET ${setClauses.join(", ")}${whereClause}${returning}`;
            const rows = await runQuery(retryQuery, params);
            if (desc.mode === "single") {
              return { data: rows.length > 0 ? rows[0] : null, error: null };
            }
            return { data: rows, error: null };
          }
          throw e;
        }
      }

      // ── DELETE ──
      case "delete": {
        const where = buildWhere(desc.table, desc.filters);
        const query = `DELETE FROM "${desc.table}"${where.clause}`;
        await runQuery(query, where.params);
        return { data: null, error: null };
      }

      // ── UPSERT ──
      case "upsert": {
        const items = desc.data as any[];
        if (!items || items.length === 0) {
          return { data: null, error: { message: "No data to upsert" } };
        }

        const allKeys = new Set<string>();
        items.forEach((item) => Object.keys(item).forEach((k) => allKeys.add(k)));
        const cols = Array.from(allKeys);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        const valueSets: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const item of items) {
          const placeholders = cols.map((c) => {
            const val = item[c];
            if (val === undefined) {
              return "DEFAULT";
            }
            params.push(typeof val === "object" && val !== null && !Array.isArray(val) ? JSON.stringify(val) : val);
            return `$${paramIdx++}`;
          });
          valueSets.push(`(${placeholders.join(", ")})`);
        }

        const conflictCols = desc.upsertConflict
          ? desc.upsertConflict.split(",").map((c) => `"${c.trim()}"`).join(", ")
          : '"id"';

        const returning = desc.columns && desc.columns !== "*"
          ? desc.columns.split(",").map((c) => `"${c.trim()}"`).join(", ")
          : "*";

        let query: string;
        if (desc.upsertIgnoreDuplicates) {
          query = `INSERT INTO "${desc.table}" (${colList}) VALUES ${valueSets.join(", ")} ON CONFLICT (${conflictCols}) DO NOTHING RETURNING ${returning}`;
        } else {
          const updateCols = cols
            .filter((c) => !desc.upsertConflict?.split(",").map((x) => x.trim()).includes(c))
            .map((c) => `"${c}" = EXCLUDED."${c}"`)
            .join(", ");
          query = `INSERT INTO "${desc.table}" (${colList}) VALUES ${valueSets.join(", ")} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols} RETURNING ${returning}`;
        }
        const rows = await runQuery(query, params);

        if (desc.mode === "single") {
          return { data: rows.length > 0 ? rows[0] : null, error: null };
        }
        return { data: rows, error: null };
      }

      default:
        return { data: null, error: { message: `Unknown operation: ${desc.operation}` } };
    }
  } catch (e: any) {
    console.error(`[Neon DB Error] ${desc.operation} ${desc.table}:`, e.message);
    return {
      data: null,
      error: {
        message: e.message,
        code: e.code,
        detail: e.detail,
        hint: e.hint,
      },
    };
  }
}
