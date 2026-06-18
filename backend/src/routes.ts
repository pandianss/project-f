import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from './db/pool.js';
import { createFarmer, verifyKyc, getFarmer } from './domain/farmers.js';
import { createField, getPassport, listFieldsByFarmer } from './domain/fields.js';
import { addCropSeason } from './domain/crops.js';
import { getSellerStatus } from './domain/respect.js';
import { scoreField } from './domain/scoring.js';
import { recommendCrops } from './domain/cropreco.js';
import { generateAdvisory, getActiveAlerts, ackAlert } from './domain/advisory.js';
import {
  addEntry,
  listEntries,
  seasonPnl,
  farmerSummary,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
} from './domain/erp.js';
import { predictDisease, regionalRisk } from './domain/disease.js';
import {
  upsertMandi,
  ingestPrice,
  forecast,
  bestMarket,
  sellOrStore,
} from './domain/market.js';
import {
  createPost,
  reply as forumReply,
  vote as forumVote,
  acceptAnswer,
  flag as forumFlag,
  feed as forumFeed,
  getThread,
} from './domain/forum.js';

// GeoJSON Polygon coordinates: [[ [lng,lat], ... ]]
const polygon = z.array(z.array(z.tuple([z.number(), z.number()]))).min(1);

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));

  // ---- Farmers / auth (OTP stubbed) ----
  app.post('/v1/farmers', async (req, reply) => {
    const body = z
      .object({
        full_name: z.string().min(1),
        phone: z.string().min(8),
        preferred_lang: z.string().optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await createFarmer(body));
  });

  app.get('/v1/farmers/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return getFarmer(id);
  });

  app.post('/v1/farmers/:id/verify-kyc', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return verifyKyc(id);
  });

  // ---- Fields / Farm Passport ----
  app.post('/v1/fields', async (req, reply) => {
    const body = z
      .object({
        farmerId: z.string().uuid(),
        boundary: polygon,
        ownership: z.string().optional(),
        surveyNo: z.string().optional(),
        ulpin: z.string().optional(),
        waterSource: z
          .object({ type: z.string(), depth_m: z.number().optional() })
          .optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await createField(body));
  });

  app.get('/v1/fields/:id/passport', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return getPassport(id);
  });

  app.get('/v1/farmers/:id/fields', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return listFieldsByFarmer(id);
  });

  // ---- Crop history ----
  app.post('/v1/fields/:id/crop-history', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        season: z.enum(['kharif', 'rabi', 'zaid']),
        year: z.number().int(),
        crop: z.string().min(1),
        variety: z.string().optional(),
        sowing_date: z.string().optional(),
        harvest_date: z.string().optional(),
        satellite_corroborated: z.boolean().optional(),
        source: z.string().optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await addCropSeason({ field_id: id, ...body }));
  });

  // ---- Marketplace seller gate (Respect Points) ----
  app.get('/v1/farmers/:id/seller-status', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return getSellerStatus(id);
  });

  // ---- Scoring (risk + credit) ----
  // Farmer-facing: compute + view own field scores.
  app.post('/v1/fields/:id/score', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return scoreField(id);
  });

  // (B2B, Consent, and Marketplace routes deprecated for V1)

  // ---- Crop recommendation ----
  app.get('/v1/fields/:id/crop-reco', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z
      .object({
        season: z.enum(['kharif', 'rabi', 'zaid']),
        water_availability: z.enum(['low', 'medium', 'high']).optional(),
        investment_capacity: z.coerce.number().positive().optional(),
        risk_appetite: z.enum(['low', 'medium', 'high']).optional(),
      })
      .parse(req.query);
    return recommendCrops({ field_id: id, ...q });
  });

  // ---- Advisory / alerts ----
  app.post('/v1/fields/:id/advisory', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        rainfall_mm: z.number().optional(),
        tmax: z.number().optional(),
        tmin: z.number().optional(),
        humidity: z.number().optional(),
        wind_kmph: z.number().optional(),
      })
      .parse(req.body ?? {});
    return generateAdvisory(id, body);
  });

  app.get('/v1/fields/:id/alerts', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return getActiveAlerts(id);
  });

  app.post('/v1/alerts/:id/ack', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return ackAlert(id);
  });

  // ---- Farm Family ERP ledger (expense + income tracking) ----
  app.get('/v1/erp/categories', async () => ({
    income: INCOME_CATEGORIES,
    expense: EXPENSE_CATEGORIES,
  }));

  app.post('/v1/fields/:id/ledger', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        direction: z.enum(['income', 'expense']),
        category: z.string().min(1),
        amount: z.number().nonnegative(),
        season: z.enum(['kharif', 'rabi', 'zaid']).optional(),
        year: z.number().int().optional(),
        note: z.string().optional(),
        source: z.enum(['manual', 'voice', 'officer']).optional(),
        entry_date: z.string().optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await addEntry({ field_id: id, ...body }));
  });

  app.get('/v1/fields/:id/ledger', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z
      .object({ season: z.string().optional(), year: z.coerce.number().int().optional() })
      .parse(req.query);
    return listEntries(id, q);
  });

  app.get('/v1/fields/:id/pnl', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z
      .object({ season: z.enum(['kharif', 'rabi', 'zaid']), year: z.coerce.number().int() })
      .parse(req.query);
    return seasonPnl(id, q.season, q.year);
  });

  app.get('/v1/farmers/:id/erp-summary', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({ year: z.coerce.number().int().optional() }).parse(req.query);
    return farmerSummary(id, q.year);
  });

  // ---- Disease prediction (pre-symptom) ----
  app.post('/v1/fields/:id/disease/predict', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        humidity: z.number().optional(),
        tmax: z.number().optional(),
        tmin: z.number().optional(),
        rainfall_mm: z.number().optional(),
        radius_km: z.number().positive().optional(),
      })
      .parse(req.body ?? {});
    const { radius_km, ...weather } = body;
    const hasWeather = Object.keys(weather).length > 0;
    return predictDisease(id, hasWeather ? weather : undefined, radius_km ?? 10);
  });

  app.get('/v1/disease/regional-risk', async (req) => {
    const q = z
      .object({
        lng: z.coerce.number(),
        lat: z.coerce.number(),
        radius_km: z.coerce.number().positive().default(15),
      })
      .parse(req.query);
    return regionalRisk(q);
  });

  // ---- Market intelligence ----
  app.post('/v1/market/mandis', async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        district: z.string().optional(),
        state: z.string().optional(),
        lng: z.number(),
        lat: z.number(),
      })
      .parse(req.body);
    return reply.code(201).send(await upsertMandi(body));
  });

  app.post('/v1/market/prices', async (req, reply) => {
    const body = z
      .object({
        mandi_id: z.string().uuid(),
        commodity: z.string().min(1),
        price_date: z.string(),
        modal_price: z.number().positive(),
        min_price: z.number().optional(),
        max_price: z.number().optional(),
        arrivals_t: z.number().optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await ingestPrice(body));
  });

  app.get('/v1/market/forecast', async (req) => {
    const q = z
      .object({
        commodity: z.string().min(1),
        mandi_id: z.string().uuid().optional(),
        horizon_days: z.coerce.number().int().positive().default(14),
      })
      .parse(req.query);
    return forecast(q.commodity, q.mandi_id ?? null, q.horizon_days);
  });

  app.get('/v1/market/best', async (req) => {
    const q = z
      .object({
        commodity: z.string().min(1),
        lng: z.coerce.number(),
        lat: z.coerce.number(),
        transport_rs_per_km_per_quintal: z.coerce.number().optional(),
      })
      .parse(req.query);
    return bestMarket(q);
  });

  app.get('/v1/market/sell-or-store', async (req) => {
    const q = z
      .object({
        commodity: z.string().min(1),
        lng: z.coerce.number(),
        lat: z.coerce.number(),
        horizon_days: z.coerce.number().int().positive().optional(),
        storage_rs_per_quintal_per_day: z.coerce.number().optional(),
      })
      .parse(req.query);
    return sellOrStore(q);
  });

  // ---- Community forum ----
  app.get('/v1/forum/feed', async (req) => {
    const q = z
      .object({
        crop: z.string().optional(),
        lng: z.coerce.number().optional(),
        lat: z.coerce.number().optional(),
        radius_km: z.coerce.number().positive().optional(),
      })
      .parse(req.query);
    return forumFeed(q);
  });

  app.post('/v1/forum/posts', async (req, reply) => {
    const body = z
      .object({
        author_id: z.string().uuid(),
        body: z.string().min(1),
        scope: z.enum(['village', 'block', 'district', 'state', 'national']).optional(),
        lng: z.number().optional(),
        lat: z.number().optional(),
        crop: z.string().optional(),
        topic: z.string().optional(),
        type: z.enum(['question', 'tip', 'photo', 'poll', 'market', 'news', 'story']).optional(),
        lang: z.string().optional(),
        image_uri: z.string().optional(),
        audio_uri: z.string().optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await createPost(body));
  });

  app.get('/v1/forum/posts/:id', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return getThread(id);
  });

  app.post('/v1/forum/posts/:id/replies', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        author_id: z.string().uuid(),
        body: z.string().min(1),
        lang: z.string().optional(),
        is_expert: z.boolean().optional(),
      })
      .parse(req.body);
    return reply.code(201).send(await forumReply({ post_id: id, ...body }));
  });

  app.post('/v1/forum/:type/:id/vote', async (req) => {
    const { type, id } = z
      .object({ type: z.enum(['post', 'reply']), id: z.string().uuid() })
      .parse(req.params);
    const { voter_id, value } = z
      .object({ voter_id: z.string().uuid(), value: z.union([z.literal(1), z.literal(-1)]) })
      .parse(req.body);
    return forumVote({ voter_id, target_type: type, target_id: id, value });
  });

  app.post('/v1/forum/posts/:id/accept', async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { reply_id, asker_id } = z
      .object({ reply_id: z.string().uuid(), asker_id: z.string().uuid() })
      .parse(req.body);
    return acceptAnswer({ post_id: id, reply_id, asker_id });
  });

  app.post('/v1/forum/:type/:id/flag', async (req) => {
    const { type, id } = z
      .object({ type: z.enum(['post', 'reply']), id: z.string().uuid() })
      .parse(req.params);
    const { reporter_id, reason } = z
      .object({
        reporter_id: z.string().uuid().optional(),
        reason: z.enum(['spam', 'misinfo', 'abuse', 'scam', 'offplatform']),
      })
      .parse(req.body);
    return forumFlag({ reporter_id, target_type: type, target_id: id, reason });
  });
}
