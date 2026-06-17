// Market Intelligence Engine (MVP).
// Price forecast (recent level + linear trend), best market net of transport,
// and a sell-now-vs-store recommendation against storage cost (docs/08 §8).
// Baseline a SARIMAX/TFT model replaces behind the same interface.
import { query } from '../db/pool.js';

export async function upsertMandi(input: {
  name: string;
  district?: string;
  state?: string;
  lng: number;
  lat: number;
}) {
  const r = await query<{ mandi_id: string }>(
    `INSERT INTO mandi (name, district, state, geom)
     VALUES ($1,$2,$3, ST_SetSRID(ST_MakePoint($4,$5),4326)::geography)
     RETURNING mandi_id`,
    [input.name, input.district ?? null, input.state ?? null, input.lng, input.lat],
  );
  return r.rows[0];
}

export async function ingestPrice(input: {
  mandi_id: string;
  commodity: string;
  price_date: string;
  modal_price: number;
  min_price?: number;
  max_price?: number;
  arrivals_t?: number;
}) {
  await query(
    `INSERT INTO market_price (mandi_id, commodity, price_date, modal_price, min_price, max_price, arrivals_t)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (mandi_id, commodity, price_date)
     DO UPDATE SET modal_price=EXCLUDED.modal_price, arrivals_t=EXCLUDED.arrivals_t`,
    [
      input.mandi_id,
      input.commodity,
      input.price_date,
      input.modal_price,
      input.min_price ?? null,
      input.max_price ?? null,
      input.arrivals_t ?? null,
    ],
  );
  return { ok: true };
}

// Ordinary least-squares slope over (index, price) for a short recent window.
function trendSlope(prices: number[]): number {
  const n = prices.length;
  if (n < 2) return 0;
  const xs = prices.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = prices.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (prices[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Forecast modal price `horizonDays` ahead for a commodity at a mandi (or all). */
export async function forecast(commodity: string, mandiId: string | null, horizonDays = 14) {
  const params: unknown[] = [commodity];
  let mandiFilter = '';
  if (mandiId) {
    params.push(mandiId);
    mandiFilter = ' AND mandi_id=$2';
  }
  const r = await query<{ price_date: string; modal_price: string }>(
    `SELECT price_date, AVG(modal_price)::numeric modal_price
       FROM market_price WHERE commodity=$1${mandiFilter}
      GROUP BY price_date ORDER BY price_date DESC LIMIT 30`,
    params,
  );
  if (r.rowCount === 0)
    throw Object.assign(new Error('No price history for commodity'), { statusCode: 404 });

  const series = r.rows.map((x) => Number(x.modal_price)).reverse(); // oldest→newest
  const recent = series.slice(-7);
  const level = recent.reduce((a, b) => a + b, 0) / recent.length;
  const slopePerDay = trendSlope(series.slice(-14));
  const projected = Math.max(0, Math.round(level + slopePerDay * horizonDays));
  const current = series[series.length - 1];
  // confidence shrinks with volatility
  const vol =
    Math.sqrt(recent.reduce((a, b) => a + (b - level) ** 2, 0) / recent.length) / (level || 1);
  const confidence = Math.max(30, Math.round(100 - vol * 200));

  return {
    commodity,
    mandi_id: mandiId,
    current_modal_price: current,
    horizon_days: horizonDays,
    forecast_price: projected,
    direction: projected > current ? 'rising' : projected < current ? 'falling' : 'flat',
    trend_per_day: Math.round(slopePerDay),
    confidence,
  };
}

/** Best market for a field: highest modal price net of distance-based transport cost. */
export async function bestMarket(opts: {
  commodity: string;
  lng: number;
  lat: number;
  transport_rs_per_km_per_quintal?: number;
}) {
  const tcost = opts.transport_rs_per_km_per_quintal ?? 4; // ₹/km/quintal
  const r = await query<{
    mandi_id: string;
    name: string;
    modal_price: string;
    distance_km: string;
  }>(
    `SELECT m.mandi_id, m.name,
            lp.modal_price::text,
            ROUND((ST_Distance(m.geom, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography)/1000.0)::numeric,1) distance_km
       FROM mandi m
       JOIN LATERAL (
         SELECT modal_price FROM market_price mp
          WHERE mp.mandi_id=m.mandi_id AND mp.commodity=$1
          ORDER BY price_date DESC LIMIT 1
       ) lp ON true`,
    [opts.commodity, opts.lng, opts.lat],
  );
  const ranked = r.rows
    .map((x) => {
      const price = Number(x.modal_price);
      const dist = Number(x.distance_km);
      const net = Math.round(price - dist * tcost);
      return { mandi_id: x.mandi_id, name: x.name, modal_price: price, distance_km: dist, net_price: net };
    })
    .sort((a, b) => b.net_price - a.net_price);
  return { commodity: opts.commodity, transport_rs_per_km_per_quintal: tcost, markets: ranked };
}

/** Sell now vs store: compare current best net price to forecast minus storage cost. */
export async function sellOrStore(opts: {
  commodity: string;
  lng: number;
  lat: number;
  horizon_days?: number;
  storage_rs_per_quintal_per_day?: number;
}) {
  const horizon = opts.horizon_days ?? 14;
  const storagePerDay = opts.storage_rs_per_quintal_per_day ?? 1.5;
  const best = await bestMarket(opts);
  if (best.markets.length === 0)
    throw Object.assign(new Error('No markets with price data'), { statusCode: 404 });
  const top = best.markets[0];
  const fc = await forecast(opts.commodity, null, horizon);
  const storageCost = Math.round(storagePerDay * horizon);
  const storeNet = Math.round(fc.forecast_price - storageCost - top.distance_km * 4);
  const gain = storeNet - top.net_price;
  const recommend = gain > 0 && fc.confidence >= 50 ? 'store' : 'sell_now';
  return {
    commodity: opts.commodity,
    sell_now: { best_mandi: top.name, net_price_now: top.net_price },
    store_option: {
      horizon_days: horizon,
      forecast_price: fc.forecast_price,
      storage_cost: storageCost,
      est_net_if_stored: storeNet,
      forecast_confidence: fc.confidence,
    },
    expected_gain_from_storing: gain,
    recommendation: recommend,
    reason:
      recommend === 'store'
        ? `Price forecast ${fc.direction} (+₹${gain}/quintal net after storage) over ${horizon} days.`
        : `Selling now is better — storage cost/forecast risk outweigh expected gain.`,
  };
}
