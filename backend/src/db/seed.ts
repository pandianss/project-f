import { pool } from './pool.js';

async function seed() {
  console.log('Seeding database...');

  // 1. Clear existing data in correct dependency order
  await pool.query('DELETE FROM forum_flag');
  await pool.query('DELETE FROM forum_vote');
  await pool.query('DELETE FROM forum_reply');
  await pool.query('DELETE FROM forum_post');
  await pool.query('DELETE FROM market_price');
  await pool.query('DELETE FROM mandi');
  await pool.query('DELETE FROM ledger_entry');
  await pool.query('DELETE FROM payment');
  await pool.query('DELETE FROM marketplace_order');
  await pool.query('DELETE FROM listing');
  await pool.query('DELETE FROM respect_ledger');
  await pool.query('DELETE FROM seller_status');
  await pool.query('DELETE FROM consent_grant');
  await pool.query('DELETE FROM access_audit');
  await pool.query('DELETE FROM field_score');
  await pool.query('DELETE FROM yield_history');
  await pool.query('DELETE FROM disease_history');
  await pool.query('DELETE FROM soil_history');
  await pool.query('DELETE FROM crop_history');
  await pool.query('DELETE FROM water_source');
  await pool.query('DELETE FROM field');
  await pool.query('DELETE FROM org');
  await pool.query('DELETE FROM farmer');

  console.log('Cleared existing data.');

  // 2. Insert Farmers
  const farmersResult = await pool.query<{ farmer_id: string; full_name: string }>(`
    INSERT INTO farmer (full_name, phone, preferred_lang, kyc_status, category)
    VALUES 
      ('Rajesh Kumar', '9876543210', 'hi', 'verified', 'progressive'),
      ('Saroja Devi', '8765432109', 'ta', 'verified', 'marginal'),
      ('Amit Singh', '7654321098', 'en', 'none', 'small')
    RETURNING farmer_id, full_name
  `);

  const rajeshId = farmersResult.rows.find(f => f.full_name === 'Rajesh Kumar')!.farmer_id;
  const sarojaId = farmersResult.rows.find(f => f.full_name === 'Saroja Devi')!.farmer_id;
  const amitId = farmersResult.rows.find(f => f.full_name === 'Amit Singh')!.farmer_id;

  console.log('Inserted farmers.');

  // 3. Insert Organizations (B2B)
  const orgsResult = await pool.query<{ org_id: string; name: string }>(`
    INSERT INTO org (name, org_type, plan, api_quota)
    VALUES 
      ('State Bank of India', 'bank', 'enterprise', 10000),
      ('National Agricultural Insurer', 'insurer', 'growth', 5000)
    RETURNING org_id, name
  `);
  const sbiId = orgsResult.rows.find(o => o.name === 'State Bank of India')!.org_id;

  console.log('Inserted organizations.');

  // 4. Insert Fields (PostGIS points & polygons)
  const fieldsResult = await pool.query<{ field_id: string; passport_no: string }>(`
    INSERT INTO field (passport_no, ulpin, farmer_id, centroid, boundary, area_ha, ownership, survey_no)
    VALUES 
      (
        'FP-2026-RAJESH1', 
        '12345678901234', 
        $1, 
        ST_GeographyFromText('SRID=4326;POINT(77.96 10.36)'), 
        ST_GeographyFromText('SRID=4326;POLYGON((77.96 10.36, 77.97 10.36, 77.97 10.37, 77.96 10.37, 77.96 10.36))'), 
        10.5, 
        'owned', 
        '234/1'
      ),
      (
        'FP-2026-SAROJA1', 
        '23456789012345', 
        $2, 
        ST_GeographyFromText('SRID=4326;POINT(78.12 9.92)'), 
        ST_GeographyFromText('SRID=4326;POLYGON((78.12 9.92, 78.13 9.92, 78.13 9.93, 78.12 9.93, 78.12 9.92))'), 
        2.2, 
        'owned', 
        '45/A'
      ),
      (
        'FP-2026-AMIT1', 
        '34567890123456', 
        $3, 
        ST_GeographyFromText('SRID=4326;POINT(77.30 28.60)'), 
        ST_GeographyFromText('SRID=4326;POLYGON((77.30 28.60, 77.31 28.60, 77.31 28.61, 77.30 28.61, 77.30 28.60))'), 
        1.8, 
        'leased', 
        '899'
      )
    RETURNING field_id, passport_no
  `);

  const rajeshFieldId = fieldsResult.rows.find(f => f.passport_no === 'FP-2026-RAJESH1')!.field_id;
  const sarojaFieldId = fieldsResult.rows.find(f => f.passport_no === 'FP-2026-SAROJA1')!.field_id;
  const amitFieldId = fieldsResult.rows.find(f => f.passport_no === 'FP-2026-AMIT1')!.field_id;

  console.log('Inserted fields.');

  // 5. Water Sources
  await pool.query(`
    INSERT INTO water_source (field_id, type, depth_m)
    VALUES 
      ($1, 'borewell', 120),
      ($2, 'canal', NULL),
      ($3, 'rainfed', NULL)
  `, [rajeshFieldId, sarojaFieldId, amitFieldId]);

  // 6. Respect Ledger & Seller Status setup
  // Rajesh (KYC, satellite seasons, points > 250 -> sell_enabled: true)
  await pool.query(`
    INSERT INTO respect_ledger (farmer_id, reason, points, ref_id)
    VALUES 
      ($1, 'kyc', 75, $1),
      ($1, 'passport_complete', 50, $2),
      ($1, 'crop_season_verified', 40, gen_random_uuid()),
      ($1, 'officer_verified', 100, gen_random_uuid())
  `, [rajeshId, rajeshFieldId]);

  // Saroja (KYC, but points under 250 -> sell_enabled: false)
  await pool.query(`
    INSERT INTO respect_ledger (farmer_id, reason, points, ref_id)
    VALUES 
      ($1, 'kyc', 75, $1),
      ($1, 'passport_complete', 50, $2)
  `, [sarojaId, sarojaFieldId]);

  // Trigger recomputes via simple inline recompute seller status queries
  const recompute = async (fId: string) => {
    const r = await pool.query('SELECT COALESCE(SUM(points),0)::int AS total FROM respect_ledger WHERE farmer_id=$1', [fId]);
    const total = r.rows[0].total;
    const tier = total >= 1000 ? 'gold' : total >= 500 ? 'silver' : total >= 250 ? 'bronze' : 'locked';
    const isKyc = fId !== amitId; // Amit is none
    const isSeason = fId === rajeshId; // Rajesh has crop season verified
    const enabled = total >= 250 && isKyc && isSeason;
    await pool.query(`
      INSERT INTO seller_status (farmer_id, respect_points, trust_tier, sell_enabled, probation, max_listing_value, max_concurrent_listings)
      VALUES ($1, $2, $3, $4, true, 50000, 5)
      ON CONFLICT (farmer_id) DO UPDATE SET 
        respect_points=EXCLUDED.respect_points, 
        trust_tier=EXCLUDED.trust_tier, 
        sell_enabled=EXCLUDED.sell_enabled
    `, [fId, total, tier, enabled]);
  };

  await recompute(rajeshId);
  await recompute(sarojaId);
  await recompute(amitId);

  console.log('Inserted respect logs & updated seller statuses.');

  // 7. Crop History
  await pool.query(`
    INSERT INTO crop_history (field_id, season, year, crop, variety, satellite_corroborated, source)
    VALUES 
      ($1, 'kharif', 2025, 'paddy', 'IR64', true, 'satellite'),
      ($1, 'rabi', 2025, 'maize', 'Pioneer 3396', false, 'farmer'),
      ($2, 'kharif', 2025, 'tomato', 'Sartaj', true, 'satellite')
  `, [rajeshFieldId, sarojaFieldId]);

  // 8. Soil History
  await pool.query(`
    INSERT INTO soil_history (field_id, sampled_on, n, p, k, ph, organic_carbon, source)
    VALUES 
      ($1, '2025-06-01', 280, 22, 180, 6.8, 0.55, 'lab'),
      ($2, '2025-07-15', 240, 18, 220, 7.2, 0.48, 'SHC')
  `, [rajeshFieldId, sarojaFieldId]);

  // 9. Mandis
  const mandisResult = await pool.query<{ mandi_id: string; name: string }>(`
    INSERT INTO mandi (name, district, state, geom)
    VALUES 
      ('Dindigul Mandi', 'Dindigul', 'Tamil Nadu', ST_GeographyFromText('SRID=4326;POINT(77.96 10.36)')),
      ('Madurai Mandi', 'Madurai', 'Tamil Nadu', ST_GeographyFromText('SRID=4326;POINT(78.12 9.92)'))
    RETURNING mandi_id, name
  `);
  const dindigulMandiId = mandisResult.rows.find(m => m.name === 'Dindigul Mandi')!.mandi_id;
  const maduraiMandiId = mandisResult.rows.find(m => m.name === 'Madurai Mandi')!.mandi_id;

  console.log('Inserted mandis.');

  // 10. Market Prices (daily rates)
  const priceDates = ['2026-06-18', '2026-06-17', '2026-06-16', '2026-06-15', '2026-06-14'];
  for (let i = 0; i < priceDates.length; i++) {
    const date = priceDates[i];
    // Tomato prices trending UP
    await pool.query(`
      INSERT INTO market_price (mandi_id, commodity, price_date, modal_price, min_price, max_price, arrivals_t)
      VALUES ($1, 'tomato', $2, $3, $4, $5, 12.5)
      ON CONFLICT DO NOTHING
    `, [dindigulMandiId, date, 2000 + (i * -100), 1800 + (i * -100), 2200 + (i * -100)]);

    // Paddy prices stable
    await pool.query(`
      INSERT INTO market_price (mandi_id, commodity, price_date, modal_price, min_price, max_price, arrivals_t)
      VALUES ($1, 'paddy', $2, 2100, 2000, 2200, 45)
      ON CONFLICT DO NOTHING
    `, [maduraiMandiId, date]);
  }

  // 11. Forum Posts
  await pool.query(`
    INSERT INTO forum_post (author_id, scope, geo, crop, topic, type, lang, body, ai_draft_answer)
    VALUES 
      ($1, 'village', ST_GeographyFromText('SRID=4326;POINT(77.96 10.36)'), 'paddy', 'pests', 'question', 'ta', 'My paddy leaves are yellowing. Is it leaf folder?', 'This could be leaf folder or zinc deficiency. Check if there are folded leaves with caterpillars.'),
      ($2, 'block', ST_GeographyFromText('SRID=4326;POINT(78.12 9.92)'), 'tomato', 'disease', 'question', 'ta', 'Tomato blight issue after heavy rains. Suggest spray.', 'Late blight is common after humid rainy days. Apply copper oxychloride.')
  `, [rajeshId, sarojaId]);

  // 12. Consent Grants
  await pool.query(`
    INSERT INTO consent_grant (field_id, farmer_id, org_id, scope, valid_until)
    VALUES ($1, $2, $3, '{credit,farm_risk}', now() + INTERVAL '30 days')
  `, [rajeshFieldId, rajeshId, sbiId]);

  console.log('Database seeded successfully!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
