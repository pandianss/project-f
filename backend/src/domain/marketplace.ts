// Direct-retail marketplace: listings (gated by Respect Points), browse,
// orders with escrow, OTP handover. Logistics outsourced (docs/12 §3.5).
import { withTx, query } from '../db/pool.js';

// ---- Seller gate + probation caps (docs/12 §3.1a) ----
async function assertCanSell(farmerId: string, listingValue: number) {
  const s = await query<{
    sell_enabled: boolean;
    probation: boolean;
    max_listing_value: string | null;
    max_concurrent_listings: number | null;
  }>(
    'SELECT sell_enabled, probation, max_listing_value::text, max_concurrent_listings FROM seller_status WHERE farmer_id=$1',
    [farmerId],
  );
  if (s.rowCount === 0 || !s.rows[0].sell_enabled) {
    throw Object.assign(
      new Error('SELLER_LOCKED: marketplace not unlocked — earn Respect Points (see seller-status)'),
      { statusCode: 403 },
    );
  }
  const row = s.rows[0];
  const maxVal = row.max_listing_value ? Number(row.max_listing_value) : Infinity;
  if (listingValue > maxVal) {
    throw Object.assign(
      new Error(`PROBATION_CAP: listing value ${listingValue} exceeds cap ${maxVal}`),
      { statusCode: 403 },
    );
  }
  if (row.max_concurrent_listings != null) {
    const active = await query<{ c: string }>(
      "SELECT COUNT(*)::int c FROM listing WHERE farmer_id=$1 AND status='active'",
      [farmerId],
    );
    if (Number(active.rows[0].c) >= row.max_concurrent_listings) {
      throw Object.assign(
        new Error(`PROBATION_CAP: max ${row.max_concurrent_listings} active listings`),
        { statusCode: 403 },
      );
    }
  }
}

/** Build the provenance badge from the field's twin (the trust differentiator). */
async function buildProvenance(fieldId: string) {
  const field = await query<{ passport_no: string; ownership: string | null }>(
    'SELECT passport_no, ownership FROM field WHERE field_id=$1',
    [fieldId],
  );
  if (field.rowCount === 0) throw Object.assign(new Error('Field not found'), { statusCode: 404 });
  const seasons = await query<{ crop: string; year: number; satellite_corroborated: boolean }>(
    'SELECT crop, year, satellite_corroborated FROM crop_history WHERE field_id=$1 ORDER BY year DESC LIMIT 5',
    [fieldId],
  );
  const soil = await query<{ c: string }>(
    'SELECT COUNT(*)::int c FROM soil_history WHERE field_id=$1',
    [fieldId],
  );
  return {
    passport_no: field.rows[0].passport_no,
    ownership: field.rows[0].ownership,
    recent_seasons: seasons.rows,
    soil_tested: Number(soil.rows[0].c) > 0,
    corroborated: seasons.rows.some((s) => s.satellite_corroborated),
  };
}

export async function createListing(input: {
  field_id: string;
  crop: string;
  variety?: string;
  grade?: string;
  quantity: number;
  unit: string;
  price: number;
  price_basis?: string;
  harvest_date?: string;
  packaging?: string;
}) {
  return withTx(async (c) => {
    const owner = await c.query<{ farmer_id: string }>(
      'SELECT farmer_id FROM field WHERE field_id=$1',
      [input.field_id],
    );
    if (owner.rowCount === 0) throw Object.assign(new Error('Field not found'), { statusCode: 404 });
    const farmerId = owner.rows[0].farmer_id;

    const listingValue = input.quantity * input.price;
    await assertCanSell(farmerId, listingValue);
    const provenance = await buildProvenance(input.field_id);

    const r = await c.query<{ listing_id: string }>(
      `INSERT INTO listing
         (field_id, farmer_id, crop, variety, grade, quantity, unit, price, price_basis,
          harvest_date, packaging, provenance,
          pickup_geom)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               (SELECT centroid FROM field WHERE field_id=$1))
       RETURNING listing_id`,
      [
        input.field_id,
        farmerId,
        input.crop,
        input.variety ?? null,
        input.grade ?? null,
        input.quantity,
        input.unit,
        input.price,
        input.price_basis ?? 'per_kg',
        input.harvest_date ?? null,
        input.packaging ?? null,
        JSON.stringify(provenance),
      ],
    );
    return { listing_id: r.rows[0].listing_id, provenance };
  });
}

/** Browse listings, optionally within radius_km of a lng/lat, ranked by distance. */
export async function browseListings(opts: {
  crop?: string;
  lng?: number;
  lat?: number;
  radius_km?: number;
}) {
  const params: unknown[] = [];
  const where: string[] = ["l.status='active'"];
  if (opts.crop) {
    params.push(opts.crop);
    where.push(`l.crop = $${params.length}`);
  }
  let distSelect = 'NULL::numeric AS distance_km';
  let order = 'l.created_at DESC';
  if (opts.lng != null && opts.lat != null) {
    params.push(opts.lng, opts.lat);
    const pt = `ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}),4326)::geography`;
    distSelect = `ROUND((ST_Distance(l.pickup_geom, ${pt})/1000.0)::numeric,2) AS distance_km`;
    if (opts.radius_km != null) {
      params.push(opts.radius_km * 1000);
      where.push(`ST_DWithin(l.pickup_geom, ${pt}, $${params.length})`);
    }
    order = 'distance_km ASC NULLS LAST';
  }
  const sql = `SELECT l.listing_id, l.crop, l.variety, l.grade, l.quantity, l.unit, l.price,
                      l.price_basis, l.provenance, ${distSelect}
                 FROM listing l
                WHERE ${where.join(' AND ')}
                ORDER BY ${order} LIMIT 50`;
  return (await query(sql, params)).rows;
}

function otp(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** Place an order → reserve listing, create escrow-held payment, issue handover OTP. */
export async function placeOrder(input: {
  listing_id: string;
  buyer_id: string;
  quantity: number;
  delivery_mode?: 'pickup' | '3pl';
}) {
  return withTx(async (c) => {
    const l = await c.query<{
      farmer_id: string;
      price: string;
      quantity: string;
      status: string;
    }>('SELECT farmer_id, price::text, quantity::text, status FROM listing WHERE listing_id=$1 FOR UPDATE', [
      input.listing_id,
    ]);
    if (l.rowCount === 0) throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
    if (l.rows[0].status !== 'active')
      throw Object.assign(new Error('Listing not available'), { statusCode: 409 });
    if (input.quantity > Number(l.rows[0].quantity))
      throw Object.assign(new Error('Quantity exceeds available'), { statusCode: 400 });

    const unitPrice = Number(l.rows[0].price);
    const total = unitPrice * input.quantity;
    const code = otp();

    const o = await c.query<{ order_id: string }>(
      `INSERT INTO marketplace_order
         (listing_id, buyer_id, farmer_id, quantity, unit_price, total, delivery_mode, status, pickup_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'placed',$8) RETURNING order_id`,
      [
        input.listing_id,
        input.buyer_id,
        l.rows[0].farmer_id,
        input.quantity,
        unitPrice,
        total,
        input.delivery_mode ?? 'pickup',
        code,
      ],
    );
    await c.query("UPDATE listing SET status='reserved' WHERE listing_id=$1", [input.listing_id]);
    return { order_id: o.rows[0].order_id, total, pickup_code: code, status: 'placed' };
  });
}

/** Buyer pays → escrow holds funds. */
export async function payOrder(orderId: string, method = 'upi') {
  return withTx(async (c) => {
    const o = await c.query<{ total: string; status: string }>(
      'SELECT total::text, status FROM marketplace_order WHERE order_id=$1 FOR UPDATE',
      [orderId],
    );
    if (o.rowCount === 0) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (o.rows[0].status !== 'placed')
      throw Object.assign(new Error('Order not payable'), { statusCode: 409 });
    await c.query(
      "INSERT INTO payment (order_id, amount, method, escrow_status, gateway_ref) VALUES ($1,$2,$3,'held',$4)",
      [orderId, Number(o.rows[0].total), method, 'demo_' + orderId.slice(0, 8)],
    );
    await c.query("UPDATE marketplace_order SET status='paid_escrow' WHERE order_id=$1", [orderId]);
    return { order_id: orderId, status: 'paid_escrow', escrow: 'held' };
  });
}

/** Handover: buyer confirms with OTP → release escrow to farmer, mark sold. */
export async function confirmHandover(orderId: string, code: string) {
  return withTx(async (c) => {
    const o = await c.query<{ status: string; pickup_code: string; listing_id: string }>(
      'SELECT status, pickup_code, listing_id FROM marketplace_order WHERE order_id=$1 FOR UPDATE',
      [orderId],
    );
    if (o.rowCount === 0) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (o.rows[0].status !== 'paid_escrow')
      throw Object.assign(new Error('Order not in escrow'), { statusCode: 409 });
    if (o.rows[0].pickup_code !== code)
      throw Object.assign(new Error('Invalid handover code'), { statusCode: 400 });

    await c.query(
      "UPDATE payment SET escrow_status='released', payout_ref=$2 WHERE order_id=$1",
      [orderId, 'payout_' + orderId.slice(0, 8)],
    );
    await c.query("UPDATE marketplace_order SET status='released' WHERE order_id=$1", [orderId]);
    await c.query("UPDATE listing SET status='sold' WHERE listing_id=$1", [o.rows[0].listing_id]);
    return { order_id: orderId, status: 'released', escrow: 'released', payout: 'sent_to_farmer' };
  });
}

export async function createBuyer(input: {
  name: string;
  phone: string;
  buyer_type?: string;
  preferred_lang?: string;
}) {
  const r = await query<{ buyer_id: string }>(
    `INSERT INTO buyer (name, phone, buyer_type, preferred_lang) VALUES ($1,$2,$3,$4)
     ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name RETURNING buyer_id`,
    [input.name, input.phone, input.buyer_type ?? 'consumer', input.preferred_lang ?? 'en'],
  );
  return r.rows[0];
}
