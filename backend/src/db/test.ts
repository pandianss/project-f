import test from 'node:test';
import assert from 'node:assert';
import { pool } from './pool.js';
import { recomputeSellerStatus, getSellerStatus } from '../domain/respect.js';
import { scoreField } from '../domain/scoring.js';
import { recommendCrops } from '../domain/cropreco.js';
import { generateAdvisory, getActiveAlerts } from '../domain/advisory.js';
import { seasonPnl } from '../domain/erp.js';
import { predictDisease } from '../domain/disease.js';

// Setup global mock state
const mockQueries: { pattern: RegExp | string; response: any }[] = [];

// Monkeypatch pool.query
(pool as any).query = async (text: any, params?: any[]): Promise<any> => {
  const queryText = typeof text === 'string' ? text : text.text;
  for (const mock of mockQueries) {
    if (mock.pattern instanceof RegExp) {
      if (mock.pattern.test(queryText)) {
        return mock.response(params || []);
      }
    } else if (queryText.includes(mock.pattern)) {
      return mock.response(params || []);
    }
  }
  console.log('UNMOCKED QUERY:', queryText, params);
  return { rows: [], rowCount: 0 };
};

// Monkeypatch pool.connect
pool.connect = async (): Promise<any> => {
  return {
    query: async (text: any, params?: any[]) => {
      return pool.query(text, params);
    },
    release: () => {},
  };
};

test('Respect Points & Seller Gating Logic', async () => {
  mockQueries.length = 0; // clear

  let totalPoints = 300;
  let kycStatus = 'verified';
  let verifiedSeasons = 1;

  mockQueries.push({
    pattern: /SELECT COALESCE\(SUM\(points\),0\)::int AS total FROM respect_ledger/,
    response: () => ({ rows: [{ total: totalPoints }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT kyc_status FROM farmer/,
    response: () => ({ rows: [{ kyc_status: kycStatus }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT COUNT\(\*\)::int AS c FROM crop_history ch/,
    response: () => ({ rows: [{ c: verifiedSeasons }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT DISTINCT reason FROM respect_ledger/,
    response: () => ({ rows: [{ reason: 'kyc' }, { reason: 'passport_complete' }], rowCount: 2 }),
  });
  mockQueries.push({
    pattern: /INSERT INTO seller_status/,
    response: () => ({ rows: [], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /INSERT INTO respect_ledger/,
    response: () => ({ rows: [], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT respect_points, trust_tier, sell_enabled FROM seller_status/,
    response: () => ({
      rows: [{ respect_points: totalPoints, trust_tier: 'bronze', sell_enabled: true }],
      rowCount: 1,
    }),
  });

  // Recompute
  const dummyClient: any = {
    query: async (text: string, params: any[]) => pool.query(text, params),
  };
  await recomputeSellerStatus(dummyClient, 'farmer-uuid');
  const status = await getSellerStatus('farmer-uuid');

  assert.strictEqual(status.respect_points, 300);
  assert.strictEqual(status.sell_enabled, true);
  assert.strictEqual(status.trust_tier, 'bronze');
});

test('Risk & Credit Scoring Model Logic', async () => {
  mockQueries.length = 0;

  mockQueries.push({
    pattern: /SELECT farmer_id, area_ha::text FROM field/,
    response: () => ({ rows: [{ farmer_id: 'farmer-uuid', area_ha: '8.5' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT COUNT\(\*\)::int c, MIN\(depth_m\)::text min_depth FROM water_source/,
    response: () => ({ rows: [{ c: '1', min_depth: '45' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT COUNT\(\*\)::int total,[\s\S]*FROM crop_history/,
    response: () => ({ rows: [{ total: '4', corr: '2', distinct_crop: '3' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT organic_carbon::text oc, ph::text ph FROM soil_history/,
    response: () => ({ rows: [{ oc: '0.6', ph: '6.5' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT AVG\(yield_kg_ha\)::text avg_yield FROM yield_history/,
    response: () => ({ rows: [{ avg_yield: '4500' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT COUNT\(\*\)::int c FROM disease_history/,
    response: () => ({ rows: [{ c: '0' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT kyc_status FROM farmer/,
    response: () => ({ rows: [{ kyc_status: 'verified' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /INSERT INTO field_score/,
    response: () => ({ rows: [], rowCount: 1 }),
  });

  const scores = await scoreField('field-uuid');

  assert.ok(scores.farm_risk.value < 50, 'Risk should be moderate for irrigated crop diversified land');
  assert.strictEqual(scores.credit.band, 'B', 'Credit tier should be B for score 74');
  assert.ok(scores.credit.value >= 70);
});

test('Crop Recommendation suitability rules', async () => {
  mockQueries.length = 0;

  mockQueries.push({
    pattern: /FROM soil_history/,
    response: () => ({ rows: [{ ph: '6.5' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /FROM water_source/,
    response: () => ({ rows: [{ type: 'borewell', depth_m: '45' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT 1 FROM field/,
    response: () => ({ rows: [{ 1: 1 }], rowCount: 1 }),
  });

  const recommendations = await recommendCrops({
    field_id: 'field-uuid',
    season: 'kharif',
    water_availability: 'high',
    risk_appetite: 'medium',
  });

  assert.ok(Array.isArray(recommendations.recommendations));
  assert.ok(recommendations.recommendations.length > 0);
  assert.strictEqual(recommendations.recommendations[0].crop, 'tomato');
});

test('ERP P&L calculations', async () => {
  mockQueries.length = 0;

  mockQueries.push({
    pattern: /SELECT direction, SUM\(amount\)::numeric total[\s\S]*FROM ledger_entry/,
    response: () => ({
      rows: [
        { direction: 'expense', total: '13000' },
        { direction: 'income', total: '30000' },
      ],
      rowCount: 2,
    }),
  });
  mockQueries.push({
    pattern: /SELECT direction, category, SUM\(amount\)::numeric total[\s\S]*FROM ledger_entry/,
    response: () => ({
      rows: [
        { direction: 'expense', category: 'seed', total: '5000' },
        { direction: 'expense', category: 'fertilizer', total: '8000' },
        { direction: 'income', category: 'sale', total: '30000' },
      ],
      rowCount: 3,
    }),
  });

  const pnl = await seasonPnl('field-uuid', 'kharif', 2026);

  assert.strictEqual(pnl.income, 30000);
  assert.strictEqual(pnl.expense, 13000);
  assert.strictEqual(pnl.net_profit, 17000);
  assert.strictEqual(pnl.margin_pct, 57);
});

test('Advisory Alerts and rupees-at-risk', async () => {
  mockQueries.length = 0;

  mockQueries.push({
    pattern: /SELECT area_ha::text FROM field WHERE field_id=/,
    response: () => ({ rows: [{ area_ha: '4.5' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT crop FROM crop_history WHERE field_id=/,
    response: () => ({ rows: [{ crop: 'paddy' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /INSERT INTO weather_obs/,
    response: () => ({ rows: [], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /INSERT INTO alert/,
    response: () => ({ rows: [{ alert_id: 'alert-uuid' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT alert_id,[\s\S]*FROM alert/,
    response: () => ({
      rows: [
        {
          alert_id: 'alert-uuid',
          type: 'rain',
          severity: 'critical',
          title: 'Heavy Rain Forecast',
          action: 'Postpone spraying pesticide',
          rupees_at_risk: 45000,
          valid_until: null,
          status: 'active',
          created_at: new Date(),
        },
      ],
      rowCount: 1,
    }),
  });

  await generateAdvisory('field-uuid', { rainfall_mm: 85, tmax: 30, tmin: 22 });
  const alerts = await getActiveAlerts('field-uuid');

  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'rain');
  assert.strictEqual(alerts[0].rupees_at_risk, 45000);
});

test('Disease Prediction and neighbor boosting', async () => {
  mockQueries.length = 0;

  mockQueries.push({
    pattern: /SELECT \(SELECT crop FROM crop_history WHERE field_id=\$1 ORDER BY year DESC, created_at DESC LIMIT 1\) AS crop[\s\S]*FROM field/,
    response: () => ({ rows: [{ crop: 'paddy' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT COUNT\(\*\)::int c[\s\S]*FROM disease_history/,
    response: () => ({ rows: [{ c: 3 }], rowCount: 1 }), // 3 neighbor outbreaks
  });
  mockQueries.push({
    pattern: /INSERT INTO disease_history/,
    response: () => ({ rows: [], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /INSERT INTO alert/,
    response: () => ({ rows: [], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT area_ha::text FROM field WHERE field_id=/,
    response: () => ({ rows: [{ area_ha: '2.0' }], rowCount: 1 }),
  });
  mockQueries.push({
    pattern: /SELECT id, field_id, ts, rainfall_mm, tmax, tmin, humidity, wind_kmph, source FROM weather_obs/,
    response: () => ({ rows: [{ rainfall_mm: 5, tmax: 27, tmin: 23, humidity: 92, wind_kmph: 10 }], rowCount: 1 }),
  });

  const prediction = await predictDisease('field-uuid', { humidity: 92, tmax: 27, tmin: 23, rainfall_mm: 5 }, 10);

  const blastPrediction = prediction.predictions.find(p => p.disease === 'rice blast');
  assert.ok(blastPrediction);
  assert.strictEqual(blastPrediction.probability, 92, 'Neighbor outbreak boost should yield 92% probability');
});
