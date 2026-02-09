/**
 * Supabase/InsForge-compatible query builder for Neon (PostgreSQL).
 * Supports: .from().select().eq().neq().is().gte().gt().lte().lt()
 *           .ilike().like().in().or().not().order().limit()
 *           .insert().update().delete().upsert()
 *           .single().maybeSingle()
 * Returns { data, error, count? } format.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface QueryDescriptor {
  table: string;
  operation: "select" | "insert" | "update" | "delete" | "upsert";
  columns: string;
  data?: any;
  filters: FilterDef[];
  orders: OrderDef[];
  limitVal?: number;
  mode: "many" | "single" | "maybeSingle";
  upsertConflict?: string;
  upsertIgnoreDuplicates?: boolean;
  returning?: string;
  countMode?: "exact";
  headMode?: boolean;
}

interface FilterDef {
  type: string;
  column: string;
  value: any;
}

interface OrderDef {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
}

type QueryResult = { data: any; error: any; count?: number };
type Executor = (desc: QueryDescriptor) => Promise<QueryResult>;

// ────────────────────────────────────────────────────────────
// Query Builder
// ────────────────────────────────────────────────────────────

export class QueryBuilder implements PromiseLike<QueryResult> {
  private desc: QueryDescriptor;
  private executor: Executor;

  constructor(executor: Executor, table: string) {
    this.executor = executor;
    this.desc = {
      table,
      operation: "select",
      columns: "*",
      filters: [],
      orders: [],
      mode: "many",
    };
  }

  // ── Operation setters ─────────────────────────────────────

  select(columns?: string, options?: { count?: "exact"; head?: boolean }): QueryBuilder {
    this.desc.operation = "select";
    this.desc.columns = columns || "*";
    if (options?.count) this.desc.countMode = options.count;
    if (options?.head) this.desc.headMode = options.head;
    return this;
  }

  insert(data: any): QueryBuilder {
    this.desc.operation = "insert";
    this.desc.data = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data: any): QueryBuilder {
    this.desc.operation = "update";
    this.desc.data = data;
    return this;
  }

  delete(): QueryBuilder {
    this.desc.operation = "delete";
    return this;
  }

  upsert(data: any, options?: { onConflict?: string; ignoreDuplicates?: boolean }): QueryBuilder {
    this.desc.operation = "upsert";
    this.desc.data = Array.isArray(data) ? data : [data];
    this.desc.upsertConflict = options?.onConflict;
    if (options?.ignoreDuplicates) {
      this.desc.upsertIgnoreDuplicates = true;
    }
    return this;
  }

  // ── Filters ───────────────────────────────────────────────

  eq(column: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: "neq", column, value });
    return this;
  }

  is(column: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: "is", column, value });
    return this;
  }

  gte(column: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: "gte", column, value });
    return this;
  }

  gt(column: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: "gt", column, value });
    return this;
  }

  lte(column: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: "lte", column, value });
    return this;
  }

  lt(column: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: "lt", column, value });
    return this;
  }

  like(column: string, pattern: string): QueryBuilder {
    this.desc.filters.push({ type: "like", column, value: pattern });
    return this;
  }

  ilike(column: string, pattern: string): QueryBuilder {
    this.desc.filters.push({ type: "ilike", column, value: pattern });
    return this;
  }

  in(column: string, values: any[]): QueryBuilder {
    this.desc.filters.push({ type: "in", column, value: values });
    return this;
  }

  not(column: string, operator: string, value: any): QueryBuilder {
    this.desc.filters.push({ type: `not.${operator}`, column, value });
    return this;
  }

  or(filterStr: string): QueryBuilder {
    this.desc.filters.push({ type: "or", column: "", value: filterStr });
    return this;
  }

  // ── Modifiers ─────────────────────────────────────────────

  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): QueryBuilder {
    this.desc.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst ?? false,
    });
    return this;
  }

  limit(n: number): QueryBuilder {
    this.desc.limitVal = n;
    return this;
  }

  single(): QueryBuilder {
    this.desc.mode = "single";
    this.desc.limitVal = 1;
    return this;
  }

  maybeSingle(): QueryBuilder {
    this.desc.mode = "maybeSingle";
    this.desc.limitVal = 1;
    return this;
  }

  // ── Execution (thenable) ──────────────────────────────────

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.executor(this.desc).then(onfulfilled, onrejected);
  }
}

// ────────────────────────────────────────────────────────────
// Database Facade
// ────────────────────────────────────────────────────────────

export class DatabaseClient {
  private executor: Executor;

  constructor(executor: Executor) {
    this.executor = executor;
  }

  from(table: string): QueryBuilder {
    return new QueryBuilder(this.executor, table);
  }
}
