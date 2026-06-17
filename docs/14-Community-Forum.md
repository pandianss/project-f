# FarmOS AI India — Community Forum (Kisan Community)

> Farmers trust other farmers. A forum turns the app from a tool into a *habit* and a *community*, feeds Respect Points and FarmGPT, and surfaces hyperlocal knowledge no model has. In-app, **Android-only**, multilingual, voice-first.

## 1. Why a forum (not just the AI assistant)
- **Peer trust** — advice from a nearby farmer who grew the same crop beats a generic answer.
- **Engagement/retention** — daily reason to open the app between alerts.
- **Hyperlocal knowledge** — village-level practices, local pest events, which dealer/mandi is fair.
- **Data flywheel** — Q&A becomes FarmGPT fine-tuning + RAG corpus; outbreak chatter is an early disease signal.
- **Trust currency** — helpful, upvoted answers earn **Respect Points**, accelerating marketplace unlock for good contributors.

## 2. Structure
- **Hyperlocal feeds:** village → block → district → state → national. Default view = "near me" (geo + crop) so content is relevant.
- **Crop/topic groups:** per crop (paddy, tomato…), plus themes (pest control, water, schemes, machinery, market, organic).
- **Post types:** question, tip/experience, photo (disease/field), poll, market chatter, scheme/news, success story.
- **Expert presence:** KVK scientists, agronomists, field officers, FPO leads get a **verified expert badge**; their answers rank higher and can be marked "official."

## 3. Voice-first & multilingual (forum-specific)
- **Ask/answer by voice** (ASR) and **listen to posts** (TTS) — essential for low-literacy users.
- **Auto-translation** across the 7 languages: a Tamil question is readable/answerable in Hindi; original + translated shown. Cross-language reach multiplies useful answers.
- Voice notes as first-class posts; image posts with optional auto disease-scan attached.

## 4. AI + forum integration
- **AI first-responder:** new question gets an instant **FarmGPT draft answer** (grounded in the asker's field twin where consented), then humans add/confirm — so no question goes unanswered, and experts refine rather than start cold.
- **Smart routing:** a question is pushed to nearby farmers who grow that crop / have relevant Respect tier.
- **Disease/outbreak signal:** clustered symptom posts in an area auto-feed the **disease prediction engine** and can trigger a regional risk alert.
- **Best-answer harvesting:** accepted/upvoted answers (with consent) flow into the FarmGPT corpus and a curated **knowledge base**.
- Assistant can cite forum threads: "3 farmers near you solved this — here's what worked."

## 5. Trust, Respect Points & moderation
- **RP from the forum** (extends [12 §3.1a](12-Android-Apps-and-Marketplace.md)): accepted answer (+15), upvoted helpful answer (+5, capped/day), verified-expert endorsement (+25); **spam/misinformation/abuse = negative RP + strikes.**
- **Reputation gating:** new accounts post with limits; trusted/expert tiers get more reach — same trust ladder that gates the marketplace, so quality contributors rise.
- **Moderation stack:**
  - **Automated:** multilingual toxicity/spam classifier, **agri-misinformation guardrail** (flags unsafe/banned-chemical advice, fake "miracle" inputs, scams), duplicate/bot detection.
  - **Community:** report, downvote, flag-as-wrong.
  - **Human:** moderators + experts review flagged + high-impact (safety) posts; SLA on takedowns.
- **Safety rule:** any advice recommending banned/unsafe agrochemicals or fraudulent schemes is auto-held and corrected — same guardrail as the AI assistant. Misinformation is the top risk for a farm forum and is treated as such.
- **Anti-commerce-leakage:** off-platform sale solicitation that bypasses the marketplace/escrow is discouraged/flagged (protects buyers and the trust model).

## 6. Schema (additions)
```sql
CREATE TABLE forum_post (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES farmer,          -- or expert/officer
  scope TEXT,                                 -- village|block|district|state|national
  geo GEOGRAPHY(POINT,4326), crop TEXT, topic TEXT,
  type TEXT,                                  -- question|tip|photo|poll|market|news|story
  lang TEXT, body TEXT, audio_uri TEXT, image_uri TEXT,
  ai_draft_answer TEXT,                       -- FarmGPT first-responder
  status TEXT DEFAULT 'open',                 -- open|answered|flagged|removed
  upvotes INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_forum_geo ON forum_post USING GIST (geo);

CREATE TABLE forum_reply (
  reply_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES forum_post, author_id UUID,
  lang TEXT, body TEXT, audio_uri TEXT,
  is_expert BOOL DEFAULT false, is_accepted BOOL DEFAULT false,
  upvotes INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE forum_vote (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID, target_type TEXT, target_id UUID, value INT,  -- +1/-1
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE forum_flag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID, target_type TEXT, target_id UUID,
  reason TEXT,                                -- spam|misinfo|abuse|scam|offplatform
  status TEXT DEFAULT 'pending', resolved_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);
```

## 7. APIs (additions)
```
GET  /v1/forum/feed?scope&crop&lang&near        ranked, geo+crop relevant
POST /v1/forum/posts                            create (text/voice/image)
GET  /v1/forum/posts/{id}                        post + replies (with translations)
POST /v1/forum/posts/{id}/replies
POST /v1/forum/{type}/{id}/vote
POST /v1/forum/{type}/{id}/flag
POST /v1/forum/posts/{id}/accept-answer          asker marks best → RP to answerer
GET  /v1/forum/experts                            verified experts directory
```

## 8. UX placement (Farmer App)
- Add **"Community"** to navigation (or surface a "Near me" feed strip on Home).
- Post composer = big **mic** + camera + text; language auto-detected, translation toggle.
- Each answer shows author **trust tier/expert badge** and distance ("2 km away, grows tomato").
- Deep links from alerts/assistant: "Discuss this in your village group."

## 9. Phasing
- **MVP+ (post-core):** keep forum light at launch — risk of low-density empty feeds. Seed with **expert/KVK content + FPO groups** in pilot districts first, enable peer posting once a village has enough active farmers. Misinformation moderation must be live **before** open posting.
- **Year 2:** full hyperlocal feeds, AI first-responder, cross-language at scale, RP integration.

## 10. Why it strengthens the whole platform
The forum is a low-cost **acquisition + retention + data** engine: it deepens daily engagement, generates hyperlocal training data for FarmGPT, provides an early outbreak signal, and rewards trustworthy farmers with Respect Points — feeding the same trust ladder that unlocks the marketplace and the verified-activity signals behind the credit/risk moat.
