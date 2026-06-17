// Crop history logging. A satellite-corroborated season is a strong trust signal
// (real cultivation, not a fake plot) and earns Respect Points.
import { withTx } from '../db/pool.js';
import { awardRp } from './respect.js';

export async function addCropSeason(input: {
  field_id: string;
  season: string;
  year: number;
  crop: string;
  variety?: string;
  sowing_date?: string;
  harvest_date?: string;
  satellite_corroborated?: boolean;
  source?: string;
}) {
  return withTx(async (client) => {
    const owner = await client.query<{ farmer_id: string }>(
      'SELECT farmer_id FROM field WHERE field_id=$1',
      [input.field_id],
    );
    if (owner.rowCount === 0) {
      throw Object.assign(new Error('Field not found'), { statusCode: 404 });
    }
    const r = await client.query<{ id: string }>(
      `INSERT INTO crop_history
         (field_id, season, year, crop, variety, sowing_date, harvest_date, satellite_corroborated, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.field_id,
        input.season,
        input.year,
        input.crop,
        input.variety ?? null,
        input.sowing_date ?? null,
        input.harvest_date ?? null,
        input.satellite_corroborated ?? false,
        input.source ?? 'farmer',
      ],
    );
    if (input.satellite_corroborated) {
      await awardRp(client, owner.rows[0].farmer_id, 'crop_season_verified', r.rows[0].id);
    }
    return { id: r.rows[0].id };
  });
}
