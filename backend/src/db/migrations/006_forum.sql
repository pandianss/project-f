-- Community forum (docs/14): hyperlocal posts, replies, votes, moderation flags.

CREATE TABLE IF NOT EXISTS forum_post (
  post_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES farmer(farmer_id) ON DELETE CASCADE,
  scope      TEXT NOT NULL DEFAULT 'village',  -- village|block|district|state|national
  geo        GEOGRAPHY(POINT,4326),
  crop       TEXT,
  topic      TEXT,
  type       TEXT NOT NULL DEFAULT 'question',  -- question|tip|photo|poll|market|news|story
  lang       TEXT NOT NULL DEFAULT 'en',
  body       TEXT NOT NULL,
  audio_uri  TEXT,
  image_uri  TEXT,
  ai_draft_answer TEXT,                          -- FarmGPT first-responder
  status     TEXT NOT NULL DEFAULT 'open',       -- open|answered|flagged|removed
  upvotes    INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forum_geo ON forum_post USING GIST (geo);
CREATE INDEX IF NOT EXISTS idx_forum_crop ON forum_post(crop, created_at DESC);

CREATE TABLE IF NOT EXISTS forum_reply (
  reply_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES forum_post(post_id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES farmer(farmer_id),
  lang       TEXT NOT NULL DEFAULT 'en',
  body       TEXT NOT NULL,
  audio_uri  TEXT,
  is_expert  BOOLEAN NOT NULL DEFAULT false,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  upvotes    INT NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'visible',    -- visible|flagged|removed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reply_post ON forum_reply(post_id);

CREATE TABLE IF NOT EXISTS forum_vote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id    UUID NOT NULL REFERENCES farmer(farmer_id),
  target_type TEXT NOT NULL,                     -- post|reply
  target_id   UUID NOT NULL,
  value       INT NOT NULL CHECK (value IN (-1,1)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_forum_vote ON forum_vote(voter_id, target_type, target_id);

CREATE TABLE IF NOT EXISTS forum_flag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID,
  target_type TEXT NOT NULL,                     -- post|reply
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL,                     -- spam|misinfo|abuse|scam|offplatform
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending|upheld|rejected
  auto        BOOLEAN NOT NULL DEFAULT false,    -- raised by the misinfo guardrail
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
