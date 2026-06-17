// Community forum (docs/14). Hyperlocal Q&A with an AI first-responder hook,
// Respect Points for accepted answers, and a misinformation safety guardrail.
import { withTx, query } from '../db/pool.js';
import { awardRp } from './respect.js';

// Safety guardrail: phrases that suggest unsafe/banned-agrochemical or scam advice.
// In production this is a multilingual classifier; here, a conservative keyword gate.
const UNSAFE_PATTERNS = [
  /\bddt\b/i,
  /\bendosulfan\b/i,
  /monocrotophos/i,
  /\bdouble\s+the\s+dose\b/i,
  /miracle (cure|growth)/i,
  /guaranteed (double|triple) yield/i,
  /mix .*pesticides? together/i,
];

function screenContent(text: string): { safe: boolean; reason?: string } {
  for (const p of UNSAFE_PATTERNS) {
    if (p.test(text)) return { safe: false, reason: 'misinfo' };
  }
  return { safe: true };
}

/** Stub AI first-responder — in prod this calls FarmGPT/RAG grounded on the field twin. */
function aiDraft(body: string, crop: string | null): string {
  const c = crop ? ` for ${crop}` : '';
  return `AI suggestion${c}: ${body.slice(0, 0)}Based on common practice, scout the crop, confirm the symptom, and follow your local package-of-practices. A nearby farmer or expert will refine this answer.`;
}

export async function createPost(input: {
  author_id: string;
  body: string;
  scope?: string;
  lng?: number;
  lat?: number;
  crop?: string;
  topic?: string;
  type?: string;
  lang?: string;
  image_uri?: string;
  audio_uri?: string;
}) {
  const screen = screenContent(input.body);
  return withTx(async (c) => {
    const post = await c.query<{ post_id: string }>(
      `INSERT INTO forum_post
         (author_id, scope, geo, crop, topic, type, lang, body, image_uri, audio_uri, ai_draft_answer, status)
       VALUES ($1,$2,
               CASE WHEN $3::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($3,$4),4326)::geography END,
               $5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING post_id`,
      [
        input.author_id,
        input.scope ?? 'village',
        input.lng ?? null,
        input.lat ?? null,
        input.crop ?? null,
        input.topic ?? null,
        input.type ?? 'question',
        input.lang ?? 'en',
        input.body,
        input.image_uri ?? null,
        input.audio_uri ?? null,
        screen.safe ? aiDraft(input.body, input.crop ?? null) : null,
        screen.safe ? 'open' : 'flagged',
      ],
    );
    const postId = post.rows[0].post_id;
    if (!screen.safe) {
      await c.query(
        `INSERT INTO forum_flag (target_type, target_id, reason, auto) VALUES ('post',$1,$2,true)`,
        [postId, screen.reason],
      );
    }
    return { post_id: postId, status: screen.safe ? 'open' : 'flagged_for_review' };
  });
}

export async function reply(input: {
  post_id: string;
  author_id: string;
  body: string;
  lang?: string;
  is_expert?: boolean;
}) {
  const screen = screenContent(input.body);
  return withTx(async (c) => {
    const exists = await c.query('SELECT 1 FROM forum_post WHERE post_id=$1', [input.post_id]);
    if (exists.rowCount === 0)
      throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    const r = await c.query<{ reply_id: string }>(
      `INSERT INTO forum_reply (post_id, author_id, lang, body, is_expert, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING reply_id`,
      [
        input.post_id,
        input.author_id,
        input.lang ?? 'en',
        input.body,
        input.is_expert ?? false,
        screen.safe ? 'visible' : 'flagged',
      ],
    );
    if (!screen.safe) {
      await c.query(
        `INSERT INTO forum_flag (target_type, target_id, reason, auto) VALUES ('reply',$1,$2,true)`,
        [r.rows[0].reply_id, screen.reason],
      );
    }
    return { reply_id: r.rows[0].reply_id, status: screen.safe ? 'visible' : 'flagged_for_review' };
  });
}

export async function vote(input: {
  voter_id: string;
  target_type: 'post' | 'reply';
  target_id: string;
  value: 1 | -1;
}) {
  return withTx(async (c) => {
    await c.query(
      `INSERT INTO forum_vote (voter_id, target_type, target_id, value)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (voter_id, target_type, target_id) DO UPDATE SET value=EXCLUDED.value`,
      [input.voter_id, input.target_type, input.target_id, input.value],
    );
    const tbl = input.target_type === 'post' ? 'forum_post' : 'forum_reply';
    const idcol = input.target_type === 'post' ? 'post_id' : 'reply_id';
    const agg = await c.query<{ s: string }>(
      `SELECT COALESCE(SUM(value),0)::int s FROM forum_vote WHERE target_type=$1 AND target_id=$2`,
      [input.target_type, input.target_id],
    );
    await c.query(`UPDATE ${tbl} SET upvotes=$2 WHERE ${idcol}=$1`, [
      input.target_id,
      Number(agg.rows[0].s),
    ]);
    return { target_id: input.target_id, upvotes: Number(agg.rows[0].s) };
  });
}

/** Asker accepts an answer → marks it, closes the post, awards RP to the answerer. */
export async function acceptAnswer(input: { post_id: string; reply_id: string; asker_id: string }) {
  return withTx(async (c) => {
    const post = await c.query<{ author_id: string }>(
      'SELECT author_id FROM forum_post WHERE post_id=$1',
      [input.post_id],
    );
    if (post.rowCount === 0) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    if (post.rows[0].author_id !== input.asker_id)
      throw Object.assign(new Error('Only the asker can accept an answer'), { statusCode: 403 });

    const rep = await c.query<{ author_id: string }>(
      'SELECT author_id FROM forum_reply WHERE reply_id=$1 AND post_id=$2',
      [input.reply_id, input.post_id],
    );
    if (rep.rowCount === 0) throw Object.assign(new Error('Reply not found'), { statusCode: 404 });

    await c.query('UPDATE forum_reply SET is_accepted=true WHERE reply_id=$1', [input.reply_id]);
    await c.query("UPDATE forum_post SET status='answered' WHERE post_id=$1", [input.post_id]);
    // Respect Points to the answerer (the forum trust signal, docs/14 §5).
    await awardRp(c, rep.rows[0].author_id, 'forum_accepted_answer', input.reply_id);
    return { post_id: input.post_id, accepted_reply: input.reply_id, answerer: rep.rows[0].author_id };
  });
}

export async function flag(input: {
  reporter_id?: string;
  target_type: 'post' | 'reply';
  target_id: string;
  reason: string;
}) {
  await query(
    `INSERT INTO forum_flag (reporter_id, target_type, target_id, reason) VALUES ($1,$2,$3,$4)`,
    [input.reporter_id ?? null, input.target_type, input.target_id, input.reason],
  );
  return { flagged: true };
}

/** Hyperlocal feed: rank by proximity (if geo given) then recency; exclude removed/flagged. */
export async function feed(opts: {
  crop?: string;
  lng?: number;
  lat?: number;
  radius_km?: number;
}) {
  const params: unknown[] = [];
  const where = ["status IN ('open','answered')"];
  if (opts.crop) {
    params.push(opts.crop);
    where.push(`crop=$${params.length}`);
  }
  let distSel = 'NULL::numeric AS distance_km';
  let order = 'created_at DESC';
  if (opts.lng != null && opts.lat != null) {
    params.push(opts.lng, opts.lat);
    const pt = `ST_SetSRID(ST_MakePoint($${params.length - 1},$${params.length}),4326)::geography`;
    distSel = `ROUND((ST_Distance(geo, ${pt})/1000.0)::numeric,1) AS distance_km`;
    if (opts.radius_km != null) {
      params.push(opts.radius_km * 1000);
      where.push(`geo IS NOT NULL AND ST_DWithin(geo, ${pt}, $${params.length})`);
    }
    order = 'distance_km ASC NULLS LAST, created_at DESC';
  }
  const r = await query(
    `SELECT post_id, crop, topic, type, lang, body, ai_draft_answer, status, upvotes, created_at, ${distSel}
       FROM forum_post WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 50`,
    params,
  );
  return r.rows;
}

export async function getThread(postId: string) {
  const post = await query(
    `SELECT post_id, author_id, crop, topic, type, lang, body, ai_draft_answer, status, upvotes, created_at
       FROM forum_post WHERE post_id=$1`,
    [postId],
  );
  if (post.rowCount === 0) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
  const replies = await query(
    `SELECT reply_id, author_id, lang, body, is_expert, is_accepted, upvotes, status, created_at
       FROM forum_reply WHERE post_id=$1 AND status='visible'
      ORDER BY is_accepted DESC, upvotes DESC, created_at ASC`,
    [postId],
  );
  return { post: post.rows[0], replies: replies.rows };
}
