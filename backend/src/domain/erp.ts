// Farm Family ERP ledger: track farming expenses + income, compute season P&L.
// Voice-friendly (source='voice'), append-only, and the realized cash-flow it
// records feeds the credit engine's repayment-capacity signal (docs/08 §10).
import { withTx, query } from '../db/pool.js';

export const INCOME_CATEGORIES = ['sale', 'subsidy', 'other'] as const;
export const EXPENSE_CATEGORIES = [
  'seed',
  'fertilizer',
  'pesticide',
  'labour',
  'irrigation',
  'machinery',
  'transport',
  'other',
] as const;

export interface LedgerInput {
  field_id: string;
  direction: 'income' | 'expense';
  category: string;
  amount: number;
  season?: string;
  year?: number;
  note?: string;
  source?: string;
  entry_date?: string;
}

export async function addEntry(input: LedgerInput) {
  return withTx(async (c) => {
    const owner = await c.query<{ farmer_id: string }>(
      'SELECT farmer_id FROM field WHERE field_id=$1',
      [input.field_id],
    );
    if (owner.rowCount === 0) throw Object.assign(new Error('Field not found'), { statusCode: 404 });

    const r = await c.query<{ entry_id: string }>(
      `INSERT INTO ledger_entry
         (field_id, farmer_id, season, year, direction, category, amount, note, source, entry_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::date, CURRENT_DATE))
       RETURNING entry_id`,
      [
        input.field_id,
        owner.rows[0].farmer_id,
        input.season ?? null,
        input.year ?? null,
        input.direction,
        input.category,
        input.amount,
        input.note ?? null,
        input.source ?? 'manual',
        input.entry_date ?? null,
      ],
    );
    return { entry_id: r.rows[0].entry_id };
  });
}

export async function listEntries(fieldId: string, opts: { season?: string; year?: number } = {}) {
  const params: unknown[] = [fieldId];
  const where = ['field_id=$1'];
  if (opts.season) {
    params.push(opts.season);
    where.push(`season=$${params.length}`);
  }
  if (opts.year) {
    params.push(opts.year);
    where.push(`year=$${params.length}`);
  }
  const r = await query(
    `SELECT entry_id, season, year, direction, category, amount, note, source, entry_date
       FROM ledger_entry WHERE ${where.join(' AND ')} ORDER BY entry_date DESC, created_at DESC`,
    params,
  );
  return r.rows;
}

/** Season P&L for a field: income, expense (by category), net profit, margin. */
export async function seasonPnl(fieldId: string, season: string, year: number) {
  const totals = await query<{ direction: string; total: string }>(
    `SELECT direction, SUM(amount)::numeric total
       FROM ledger_entry WHERE field_id=$1 AND season=$2 AND year=$3
      GROUP BY direction`,
    [fieldId, season, year],
  );
  const byCat = await query<{ direction: string; category: string; total: string }>(
    `SELECT direction, category, SUM(amount)::numeric total
       FROM ledger_entry WHERE field_id=$1 AND season=$2 AND year=$3
      GROUP BY direction, category ORDER BY total DESC`,
    [fieldId, season, year],
  );
  let income = 0;
  let expense = 0;
  for (const t of totals.rows) {
    if (t.direction === 'income') income = Number(t.total);
    else expense = Number(t.total);
  }
  const profit = income - expense;
  return {
    field_id: fieldId,
    season,
    year,
    income,
    expense,
    net_profit: profit,
    margin_pct: income > 0 ? Math.round((profit / income) * 100) : null,
    breakdown: byCat.rows.map((b) => ({
      direction: b.direction,
      category: b.category,
      amount: Number(b.total),
    })),
  };
}

/** All-fields rollup for a farmer (the home "profit dashboard" figure). */
export async function farmerSummary(farmerId: string, year?: number) {
  const params: unknown[] = [farmerId];
  let yearFilter = '';
  if (year) {
    params.push(year);
    yearFilter = ' AND year=$2';
  }
  const r = await query<{ income: string; expense: string }>(
    `SELECT
        COALESCE(SUM(amount) FILTER (WHERE direction='income'),0)::numeric income,
        COALESCE(SUM(amount) FILTER (WHERE direction='expense'),0)::numeric expense
       FROM ledger_entry WHERE farmer_id=$1${yearFilter}`,
    params,
  );
  const income = Number(r.rows[0].income);
  const expense = Number(r.rows[0].expense);
  return { farmer_id: farmerId, year: year ?? 'all', income, expense, net_profit: income - expense };
}

/** Auto-record a confirmed marketplace sale as ledger income (idempotent). */
export async function recordMarketplaceIncome(orderId: string) {
  return withTx(async (c) => {
    const o = await c.query<{
      farmer_id: string;
      total: string;
      listing_id: string;
    }>('SELECT farmer_id, total::text, listing_id FROM marketplace_order WHERE order_id=$1', [orderId]);
    if (o.rowCount === 0) return { skipped: true };
    const fld = await c.query<{ field_id: string }>(
      'SELECT field_id FROM listing WHERE listing_id=$1',
      [o.rows[0].listing_id],
    );
    const fieldId = fld.rows[0]?.field_id ?? null;
    // Attribute the sale to a season/year so it shows in P&L: year from the order
    // date, season from the field's most recent crop record.
    const ctx = await c.query<{ year: number; season: string | null }>(
      `SELECT EXTRACT(YEAR FROM mo.created_at)::int AS year,
              (SELECT season FROM crop_history WHERE field_id=$2
                ORDER BY year DESC, created_at DESC LIMIT 1) AS season
         FROM marketplace_order mo WHERE mo.order_id=$1`,
      [orderId, fieldId],
    );
    await c.query(
      `INSERT INTO ledger_entry (field_id, farmer_id, season, year, direction, category, amount, note, source, ref_id)
       VALUES ($1,$2,$3,$4,'income','sale',$5,$6,'marketplace',$7)
       ON CONFLICT (ref_id) WHERE source='marketplace' DO NOTHING`,
      [
        fieldId,
        o.rows[0].farmer_id,
        ctx.rows[0]?.season ?? null,
        ctx.rows[0]?.year ?? null,
        Number(o.rows[0].total),
        'Marketplace sale ' + orderId.slice(0, 8),
        orderId,
      ],
    );
    return { recorded: true };
  });
}
