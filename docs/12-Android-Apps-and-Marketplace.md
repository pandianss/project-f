# FarmOS AI India — Android App Suite + Direct-Retail Marketplace

**Scope decisions**
- **Android-exclusive** native apps (no iOS, no web-first farmer/buyer experience). Web is reserved only for internal/B2B consoles (bank, insurer, admin).
- **Direct-retail marketplace**: farmers sell produce **directly to buyers** (consumers, retailers, restaurants, FPO aggregators, traders) — disintermediating the mandi where possible.
- **Companion Buyer App** (separate Android app) for the demand side.
- **Multilingual** end to end (UI + voice) across all consumer apps.

---

## 1. Android app portfolio (consumer-facing = Android only)
| App | Audience | Distribution |
|---|---|---|
| **FarmOS Farmer** (Kisan) | farmers | Play Store + sideload APK for low-connectivity zones |
| **FarmOS Buyer** (Bazaar) | consumers, retailers, restaurants, traders, FPOs | Play Store |
| **FarmOS Field Officer** | FPO/extension/logistics officers | Play Store (managed) / MDM |
| Bank / Insurer / Admin consoles | institutions | **Web only** (not Android) |

> Rationale for Android-only consumer apps: India smartphone base is ~95%+ Android; one platform = faster iteration, smaller team, deeper offline + voice investment, and a single codebase to keep multilingual.

## 2. Android tech stack (native, offline-first, multilingual)
| Concern | Choice |
|---|---|
| Language/UI | **Kotlin + Jetpack Compose** |
| Architecture | MVVM + Clean architecture; Kotlin Coroutines/Flow |
| Local DB / offline | **Room** + WorkManager sync (outbox), DataStore for prefs |
| Networking | Retrofit/OkHttp + protobuf/JSON; gRPC for streaming where useful |
| Maps/GIS | **MapLibre Android SDK** (vector tiles) + offline tile packs |
| Media/CV | CameraX; **on-device TFLite/ONNX** disease model for offline; server fallback |
| Voice | On-device + cloud **ASR/TTS** (IndicConformer/Whisper fine-tuned; Indic TTS) |
| Payments | UPI (intent + collect), Razorpay/Cashfree, wallet/escrow |
| Push | FCM + SMS/IVR fallback |
| Multilingual | Android per-app locale (Android 13 `LocaleManager`), string resources + **remote string catalog** for over-the-air language updates; RTL-safe; number/script formatting per locale |
| Auth | Phone OTP + JWT; optional KYC for sellers/buyers |
| Min SDK | API 24 (Android 7) to cover low-end devices; APK size budget < 25 MB (app bundle + dynamic features) |

### Multilingual implementation notes
- Languages: **Tamil, Hindi, English, Telugu, Kannada, Malayalam, Punjabi** (phased; same set for Buyer app).
- **Voice-first** parity: every core flow (browse, list produce, place order, negotiate) operable by speech in local language.
- Remote, versioned translation catalog so new languages/phrases ship without app updates; ICU message format for plurals/gender; agronomy + commerce glossaries curated per language.
- Fallback chain: chosen language → English → key. Pseudolocalization in QA to catch truncation.

---

## 3. Direct-Retail Marketplace (the new module)

### 3.1 Concept
Farmers list harvested/forthcoming produce; buyers discover, negotiate, order, and pay; logistics + escrow close the loop. The **digital twin adds trust the mandi can't**: every listing can carry a **verified provenance badge** (this produce came from field <passport>, this crop history, residue/spray log, optional disease-free/organic-practice signals).

### 3.1a Marketplace is OFF by default — unlocked by Respect Points
The marketplace **Sell** capability is **disabled for every new farmer**. Selling rights are *earned*, not given. This protects buyers from day-one fraud/low-quality listings, makes the **provenance badge** meaningful, and gives farmers a reason to keep the twin populated and behave well.

**Respect Points (RP)** = a trust/reputation score earned through verified, good-faith activity:

| Action (verified) | RP | Why it signals trust |
|---|---|---|
| Complete Farm Passport (boundary + ownership + water source) | +50 | real, geolocated field |
| KYC verified (phone + ID) | +75 | real, accountable identity |
| Each season of crop history logged & satellite-corroborated | +40 | genuine cultivation, not a fake plot |
| Soil/water test on record | +20 | engaged, real operation |
| Field-officer / FPO physical verification | +100 | strongest ground-truth |
| Confirmed disease-scan outcomes / following advisory | +10 each (capped) | active, honest user |
| Tenure on platform (per active month) | +5/mo | not a throwaway account |
| **Negative:** flagged fake polygon / failed verification / impersonation | −150 | anti-fraud |

**Gate logic**
- **`SELL_UNLOCK_THRESHOLD` (default 250 RP)** + **mandatory KYC** + **at least 1 verified field with ≥1 corroborated crop season** → marketplace **Sell** unlocks.
- Below threshold: the **Sell** tab shows a **progress screen** ("You're 120/250 points away — verify KYC (+75), add a soil test (+20)…") turning the gate into an onboarding funnel, not a dead end.
- **Probation tier:** first unlock starts capped (e.g., max ₹X listing value / N concurrent listings) and **escrow-only**; caps lift as RP and completed-order history grow.
- **Demotion / re-lock:** sustained low ratings, confirmed quality fraud, or failed re-verification drops RP below threshold → Sell **auto-disables** until recovered. Buyers are never exposed to a seller who fell out of good standing.
- **FPO fast-path:** FPO-verified members inherit institutional trust and can cross the threshold via the officer-verification bonus.

**Where RP fits the existing design**
- Extends the **Gamification** module (Farm Health Score, badges, leaderboard) — RP is the *trust* currency; Farm Health is the *agronomy* score. Badges and leaderboard rank can grant cosmetic recognition; **RP alone controls selling rights.**
- Buyer-visible: a listing shows the seller's **trust tier** (e.g., Bronze/Silver/Gold by RP band) alongside the provenance badge.
- **Not** a credit input by itself, but the underlying verified actions (KYC, real fields, corroborated seasons, completed sales) already feed the Credit Engine positively — RP and creditworthiness rise together without double-counting disputes.

### 3.2 Marketplace flows
**Farmer (seller) flow** *(precondition: seller rights unlocked — see §3.1a; if locked, "Sell" opens the RP progress screen instead)*
```
Harvest/forecast → "Sell my produce" (voice or form)
  → pick field (auto-fills crop, quantity est. from yield engine, harvest date)
  → set: grade, quantity, price (AI price suggestion from Market engine), packaging, pickup location
  → provenance auto-attached (Farm Passport, crop/spray history, NDVI vigor)
  → publish listing → receive orders/offers → accept/negotiate → confirm pickup/delivery
  → escrow holds payment → produce handed over (OTP/QR) → payment released → rated
```

**Buyer flow (companion app)**
```
Browse/search (by crop, location radius, grade, price, provenance, organic)
  → view listing + provenance + farmer rating + farm map
  → buy now OR make offer/negotiate (chat, voice-translated across languages)
  → choose delivery (self-pickup / FarmOS logistics / 3PL) → pay (UPI/escrow)
  → track → receive (confirm via OTP/QR) → rate farmer
Recurring: standing orders, bulk RFQs (for retailers/restaurants/FPO buyers)
```

### 3.3 Trust, quality & logistics
- **Provenance badge** from the twin = key differentiator vs generic agri-commerce.
- **Escrow / split settlement**: payment held until delivery confirmation; instant UPI payout to farmer.
- **Grading**: self-declared + photo + optional field-officer/QC verification; disputes → mediation.
- **Logistics — fully outsourced (asset-light).** FarmOS owns **no fleet, no warehouses**. Delivery is either **self-pickup** or fulfilled by **integrated 3PL partners** (Delhivery/Porter/ECom Express-class + regional/agri-logistics + cold-chain providers). FarmOS only **orchestrates**: get quotes, book, hand off pickup/drop, track via partner webhooks, and pass the cost through. FPOs/officers may aggregate member produce into a single pickup point to make 3PL economical, but the transport itself is always the partner's. Cold-chain flag for perishables routes to cold-capable partners (links to cold-storage GIS layer for aggregation points).
- **Discovery ranking**: distance, freshness/harvest date, price, seller rating, provenance score, fulfillment reliability.
- **Group selling**: FPOs aggregate member listings into bulk lots for larger buyers.

### 3.6 Dispute & liability policy (asset-light)
FarmOS is a **neutral marketplace + escrow operator**, not the seller, buyer, or carrier. Liability follows custody, and **escrow is the enforcement lever** — funds are only released once delivery is cleanly confirmed.

**Custody handoff = liability boundary**
```
Farmer (packaging/quality)  →  3PL (transit/damage/delay)  →  Buyer (acceptance)
        |                              |                            |
   pre-pickup QC photos          carrier POD + condition       OTP/QR + accept/reject
```

| Scenario | At fault | Resolution | Who bears cost |
|---|---|---|---|
| Quality/grade not as listed (verified at delivery) | **Farmer** | partial refund or return; repeat offense → rating/penalty/suspension | farmer (deducted from escrow before payout) |
| Damage/spoilage **in transit** | **3PL** | claim against carrier under SLA; buyer refunded from escrow; FarmOS recovers from 3PL | 3PL (carrier insurance/SLA) |
| Late delivery causing perishable loss | **3PL** (if outside agreed window) | refund/partial; carrier penalty per SLA | 3PL |
| Buyer no-show / refuses valid delivery | **Buyer** | restocking/return-leg fee charged to buyer; farmer compensated for return freight | buyer |
| Buyer falsely claims bad quality | **Buyer** (on evidence) | photo + carrier-POD evidence review; escrow released to farmer | buyer (no refund) |
| Genuine ambiguity / no clear evidence | shared | FarmOS mediation; default **50/50 split** or goodwill credit | split / FarmOS goodwill pool |

**Mechanisms that make this enforceable**
- **Evidence trail (mandatory):** pre-pickup QC photos (farmer), carrier proof-of-pickup + proof-of-delivery with condition note (3PL), delivery photo + OTP/QR + accept-or-reject within a **time-boxed inspection window** (buyer). No reject within the window = auto-accept → escrow released.
- **Escrow as backstop:** payment held until acceptance; refunds/penalties debited before farmer payout, so no chasing money after the fact.
- **3PL SLA + insurance:** partners contractually carry transit insurance and damage/delay penalties; FarmOS recovers carrier-fault costs from the 3PL, never from the farmer.
- **Perishables:** mandatory cold-chain-capable partner + tighter inspection window; spoilage default-attributed to transit unless packaging defect is evident.
- **Ratings & strikes:** two-way ratings; repeated faults → reduced visibility, deposit requirement, or suspension. Marketplace dispute history is **not** fed into the credit score as a penalty (only verified sales/cash-flow are positive signals) to avoid unfairly harming farmers over logistics faults.
- **Mediation:** `marketplace_order.status = disputed` opens a case; FarmOS support arbitrates on the evidence trail; SLA for resolution (e.g., 72h). A small **goodwill/insurance pool** (funded from the convenience fee) covers genuine no-fault losses to protect trust.

> Net: FarmOS never owns transport risk (3PL SLA absorbs it), never owns quality risk (farmer's, verified at delivery), and uses escrow + evidence + mediation to settle the rest — consistent with the asset-light model.

### 3.4 Buyer App (FarmOS Bazaar) — key screens
1. Home — nearby fresh produce, deals, categories, big search + mic.
2. Listing detail — produce, grade, price, **provenance + farm map**, farmer rating, "buy/offer".
3. Negotiate/chat — cross-language auto-translated messaging + voice.
4. Cart/Order — delivery options, payment (UPI/escrow), schedule.
5. Track order — status, pickup OTP/QR, support.
6. Recurring/RFQ — standing orders, bulk request to multiple farmers/FPOs.
7. Ratings & saved sellers.

### 3.5 Farmer App — marketplace additions
- New bottom-tab **"Sell"**: my listings, active orders, offers, earnings/payouts, ratings.
- Pre-harvest "sell forward" using yield-engine estimate; price suggestion from Market engine.
- One-tap relist; voice listing ("Sell 200 kg tomato grade A at 18 rupees").

---

## 4. Schema additions (marketplace)
```sql
CREATE TABLE buyer (
  buyer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, phone TEXT UNIQUE, buyer_type TEXT,   -- consumer|retailer|restaurant|trader|fpo
  preferred_lang TEXT DEFAULT 'en', kyc_status TEXT DEFAULT 'none',
  geom GEOGRAPHY(POINT,4326), created_at TIMESTAMPTZ DEFAULT now()
);

-- Respect Points: trust ledger that gates marketplace selling rights (see §3.1a)
CREATE TABLE respect_ledger (             -- append-only; current RP = SUM(points) per farmer
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID REFERENCES farmer,
  reason TEXT,                           -- passport_complete|kyc|crop_season_verified|officer_verified|fraud_flag|...
  points INT,                            -- may be negative
  ref_id UUID,                           -- linked field/order/verification
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE seller_status (             -- materialized gate state per farmer
  farmer_id UUID PRIMARY KEY REFERENCES farmer,
  respect_points INT DEFAULT 0,
  trust_tier TEXT DEFAULT 'locked',      -- locked|bronze|silver|gold
  sell_enabled BOOL DEFAULT false,       -- OFF by default
  probation BOOL DEFAULT true,           -- caps apply on first unlock
  max_listing_value NUMERIC, max_concurrent_listings INT,
  unlocked_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE listing (
  listing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, farmer_id UUID REFERENCES farmer,
  crop TEXT, variety TEXT, grade TEXT,
  quantity NUMERIC, unit TEXT, price NUMERIC, price_basis TEXT,  -- per_kg|per_quintal|lot
  harvest_date DATE, available_from DATE, packaging TEXT,
  provenance JSONB,                 -- passport_no, crop/spray history, ndvi vigor, organic flag
  pickup_geom GEOGRAPHY(POINT,4326),
  status TEXT DEFAULT 'active',      -- active|reserved|sold|expired|withdrawn
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_listing_geom ON listing USING GIST (pickup_geom);

CREATE TABLE offer (                 -- negotiation
  offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listing, buyer_id UUID REFERENCES buyer,
  offer_price NUMERIC, quantity NUMERIC, status TEXT,  -- pending|accepted|rejected|countered
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE marketplace_order (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listing, buyer_id UUID REFERENCES buyer,
  farmer_id UUID REFERENCES farmer,
  quantity NUMERIC, unit_price NUMERIC, total NUMERIC,
  delivery_mode TEXT,               -- pickup|3pl  (3PL = outsourced partner; no in-house fleet)
  delivery_geom GEOGRAPHY(POINT,4326),
  status TEXT,                       -- placed|paid_escrow|in_transit|delivered|released|cancelled|disputed
  pickup_code TEXT,                  -- OTP/QR for handover
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payment (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES marketplace_order,
  amount NUMERIC, method TEXT,       -- upi|card|wallet
  escrow_status TEXT,                -- held|released|refunded
  gateway_ref TEXT, payout_ref TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rating (
  rating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES marketplace_order,
  rater TEXT, ratee TEXT, stars INT, comment TEXT,  -- farmer<->buyer two-way
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE logistics_job (              -- record of an OUTSOURCED 3PL booking (no in-house fleet)
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES marketplace_order,
  provider TEXT,                         -- 3PL partner name (delhivery|porter|regional|coldchain)
  provider_job_ref TEXT,                 -- partner's tracking/AWB id
  status TEXT,                           -- mirrors partner webhook status
  pickup_geom GEOGRAPHY(POINT,4326), drop_geom GEOGRAPHY(POINT,4326),
  cold_chain BOOL, quoted_cost NUMERIC, billed_cost NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## 5. Marketplace APIs (add to API surface)
```
# Seller eligibility (Respect Points gate)
GET  /v1/market/seller/status            RP, trust_tier, sell_enabled, probation caps
GET  /v1/market/seller/next-steps        what to do to unlock + RP each step grants

# Seller (require sell_enabled=true; else 403 SELLER_LOCKED)
POST /v1/market/listings                 create (field-linked, provenance auto)
GET  /v1/market/listings/mine
PATCH/DELETE /v1/market/listings/{id}
GET  /v1/market/price-suggestion?crop&grade&geo
GET  /v1/market/orders/mine              seller orders + payouts

# Buyer
GET  /v1/market/listings?crop&grade&radius&organic&sort
GET  /v1/market/listings/{id}            + provenance + farm map
POST /v1/market/offers                   negotiate
POST /v1/market/orders                   place order
POST /v1/market/orders/{id}/pay          escrow
POST /v1/market/orders/{id}/confirm      OTP/QR handover → release payment
POST /v1/market/rfq                      bulk request (retailer/restaurant/FPO)

# Shared
POST /v1/market/chat/{orderId}           messages (auto-translated)
POST /v1/market/orders/{id}/dispute
GET  /v1/logistics/quote
```

## 6. Marketplace monetization (adds to Monetization doc)
- **Commission** on direct produce sales: 1–4% (lower than mandi/aggregator margins → farmer earns more, buyer pays less; we win on volume).
- **Logistics convenience fee** — a thin markup/booking fee on the **outsourced 3PL** quote passed to the buyer. FarmOS carries **no fleet capex or transport risk**; margin is pure orchestration.
- **Listing boosts / featured placement** (sellers), **buyer subscription** for bulk/retail buyers (priority RFQ, analytics).
- **Provenance-verified premium**: certified-provenance listings command higher prices; small verification fee.
- **Payments/escrow float + payout services.**
- Synergy: marketplace transaction history becomes another **credit-score signal** (proven sales/cash-flow) feeding the Credit Engine — reinforcing the core moat.

## 7. Why this strengthens the thesis
The marketplace is another **acquisition + data** engine *and* a revenue line: it gives farmers a reason for daily engagement (income), produces **verified cash-flow data** that sharpens credit scoring, and the **Farm Passport provenance** is a trust feature no generic agri-commerce app can replicate without the twin. Buyer app expands the network onto the demand side.
```
```
