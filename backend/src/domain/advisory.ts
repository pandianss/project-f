// Advisory + Alert Engine (MVP).
// Turns a weather observation/forecast + the field's current crop into
// ACTION-FIRST alerts, each carrying ₹-at-risk (docs/13 §2). Threshold rules
// here are the interpretable baseline a GBM refines later (docs/08 §1, §7).
import { withTx, query } from '../db/pool.js';
import { CROP_KB } from './agronomy.js';

interface WeatherInput {
  rainfall_mm?: number; // expected next 24-72h
  tmax?: number;
  tmin?: number;
  humidity?: number; // %
  wind_kmph?: number;
}

interface DraftAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  action: string;
  rupees_at_risk: number;
  meta?: object;
}

/** Estimate ₹ exposure for a field from area × current crop's per-ha revenue. */
async function exposure(fieldId: string): Promise<{ rupeesPerHa: number; areaHa: number; crop: string | null }> {
  const f = await query<{ area_ha: string | null }>('SELECT area_ha::text FROM field WHERE field_id=$1', [
    fieldId,
  ]);
  if (f.rowCount === 0) throw Object.assign(new Error('Field not found'), { statusCode: 404 });
  const areaHa = Number(f.rows[0].area_ha ?? 1);
  const crop = await query<{ crop: string }>(
    'SELECT crop FROM crop_history WHERE field_id=$1 ORDER BY year DESC, created_at DESC LIMIT 1',
    [fieldId],
  );
  const cropName = crop.rows[0]?.crop ?? null;
  const kb = CROP_KB.find((c) => c.crop === cropName);
  const rupeesPerHa = kb ? kb.expected_yield_kg_ha * kb.price_per_kg : 60000;
  return { rupeesPerHa, areaHa, crop: cropName };
}

function evaluate(w: WeatherInput, exp: { rupeesPerHa: number; areaHa: number }): DraftAlert[] {
  const out: DraftAlert[] = [];
  const value = exp.rupeesPerHa * exp.areaHa;

  // Heavy rain → protect crop / delay operations
  if ((w.rainfall_mm ?? 0) >= 50) {
    out.push({
      type: 'rain',
      severity: (w.rainfall_mm ?? 0) >= 100 ? 'critical' : 'warning',
      title: `Heavy rain expected (${w.rainfall_mm} mm)`,
      action: 'Hold irrigation & spraying; ensure field drainage; if crop is mature, harvest before the rain.',
      rupees_at_risk: Math.round(value * 0.15),
      meta: { rainfall_mm: w.rainfall_mm },
    });
  }

  // Spray window: safe only if low wind, low imminent rain, moderate humidity
  if (w.wind_kmph != null && (w.rainfall_mm ?? 0) < 10) {
    if (w.wind_kmph <= 15) {
      out.push({
        type: 'spray',
        severity: 'info',
        title: 'Good spraying window now',
        action: 'Conditions favourable (low wind, no imminent rain) — apply scheduled sprays now for best efficacy.',
        rupees_at_risk: 0,
        meta: { wind_kmph: w.wind_kmph },
      });
    } else {
      out.push({
        type: 'spray',
        severity: 'warning',
        title: `Do not spray — wind too high (${w.wind_kmph} km/h)`,
        action: 'Postpone spraying; high wind causes drift and wasted chemical/cost.',
        rupees_at_risk: Math.round(value * 0.02),
        meta: { wind_kmph: w.wind_kmph },
      });
    }
  }

  // Heat stress
  if ((w.tmax ?? 0) >= 38) {
    out.push({
      type: 'heat',
      severity: (w.tmax ?? 0) >= 42 ? 'critical' : 'warning',
      title: `Heat stress risk (max ${w.tmax}°C)`,
      action: 'Irrigate in early morning/evening to cool the crop; avoid midday operations.',
      rupees_at_risk: Math.round(value * 0.1),
      meta: { tmax: w.tmax },
    });
  }

  // Disease favourability: high humidity + warm temps
  if ((w.humidity ?? 0) >= 80 && (w.tmax ?? 0) >= 25 && (w.tmax ?? 99) <= 35) {
    out.push({
      type: 'disease_risk',
      severity: 'warning',
      title: 'High disease-favourable conditions',
      action: 'Scout the crop now and apply a preventive fungicide within 48h — humid, warm weather favours fungal disease.',
      rupees_at_risk: Math.round(value * 0.2),
      meta: { humidity: w.humidity, tmax: w.tmax },
    });
  }

  // Irrigation reminder: dry + warm and no rain coming
  if ((w.rainfall_mm ?? 0) < 5 && (w.tmax ?? 0) >= 33) {
    out.push({
      type: 'irrigation',
      severity: 'info',
      title: 'Irrigation recommended',
      action: 'No rain expected and temperatures are high — schedule irrigation to avoid moisture stress.',
      rupees_at_risk: Math.round(value * 0.05),
      meta: { tmax: w.tmax, rainfall_mm: w.rainfall_mm },
    });
  }

  return out;
}

/** Ingest a weather observation, generate alerts, persist active ones. */
export async function generateAdvisory(fieldId: string, w: WeatherInput) {
  const exp = await exposure(fieldId);
  const drafts = evaluate(w, exp);

  const saved = await withTx(async (c) => {
    await c.query(
      `INSERT INTO weather_obs (field_id, rainfall_mm, tmax, tmin, humidity, wind_kmph)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [fieldId, w.rainfall_mm ?? null, w.tmax ?? null, w.tmin ?? null, w.humidity ?? null, w.wind_kmph ?? null],
    );
    const rows = [];
    for (const d of drafts) {
      const r = await c.query<{ alert_id: string }>(
        `INSERT INTO alert (field_id, type, severity, title, action, rupees_at_risk, valid_until, meta)
         VALUES ($1,$2,$3,$4,$5,$6, now() + interval '3 days', $7)
         RETURNING alert_id`,
        [fieldId, d.type, d.severity, d.title, d.action, d.rupees_at_risk, JSON.stringify(d.meta ?? {})],
      );
      rows.push({ alert_id: r.rows[0].alert_id, ...d });
    }
    return rows;
  });

  const totalAtRisk = saved.reduce((s, a) => s + a.rupees_at_risk, 0);
  return { field_id: fieldId, crop: exp.crop, total_rupees_at_risk: totalAtRisk, alerts: saved };
}

export async function getActiveAlerts(fieldId: string) {
  const r = await query(
    `SELECT alert_id, type, severity, title, action, rupees_at_risk, valid_until, status, created_at
       FROM alert WHERE field_id=$1 AND status='active' AND (valid_until IS NULL OR valid_until > now())
      ORDER BY rupees_at_risk DESC, created_at DESC`,
    [fieldId],
  );
  return r.rows;
}

/** Farmer marks they acted on an alert (closes the loop, docs/13 §2.3). */
export async function ackAlert(alertId: string) {
  const r = await query("UPDATE alert SET status='acted' WHERE alert_id=$1 RETURNING alert_id", [
    alertId,
  ]);
  if (r.rowCount === 0) throw Object.assign(new Error('Alert not found'), { statusCode: 404 });
  return { alert_id: alertId, status: 'acted' };
}
