# FarmOS AI India — Mobile App Design & UX Flows

## 1. App portfolio
| App | Platform | Users | Core |
|---|---|---|---|
| Farmer App | Android (offline-first) | farmers | voice advisory, alerts, disease scan, crop reco, ERP |
| FPO App | Android/Web | FPO staff | member fields, bulk advisory, procurement, village dashboard |
| Field Officer App | Android | extension/agri officers | field surveys, validation, ground-truth labeling |
| Bank App / Console | Web | loan officers | credit scores, KCC eligibility, portfolio monitoring |
| Insurance Console | Web | underwriters | risk pricing, claim assessment, fraud flags |
| Admin Portal | Web | internal/govt | tenant mgmt, data ops, model ops, dashboards |

## 2. Farmer App — design principles
- **Voice-first, low-literacy:** big icons, color-coded status (green/amber/red), minimal text, audio for every screen.
- **Offline-first:** works on 2G; queues actions; cached advisory + map tiles.
- **Local language** by default from phone locale / first-run choice.

### Key screens
1. **Home / "My Farm Today"** — field health dial (Farm Health Score), today's 3 actions, weather strip, active alerts, big mic button.
2. **Field detail** — map polygon, NDVI trend, crop stage, soil/water snapshot, history timeline (Farm Passport).
3. **Ask (Assistant)** — full-screen mic; live transcription; spoken answer + cards. Sample-question chips.
4. **Disease Scan** — camera → capture leaf/plant → result card (disease, confidence, remedy, cost, expected outcome) → "buy inputs" link.
5. **Crop Recommendation** — wizard: season, water, soil test, budget, risk appetite → top-5 crop cards (yield/profit/risk/demand).
6. **Market** — best mandi, price trend, sell-now vs store advice.
7. **Family ERP** — income/expense/profit per season; voice entry of expenses.
8. **Alerts** — chronological; each with recommended action + "remind me".
9. **Rewards & Trust** — two distinct meters: **Farm Health Score** (agronomy) and **Respect Points / trust tier** (Bronze/Silver/Gold). Shows badges, village leaderboard, and an explicit **"Unlock Selling" progress tracker** (RP earned vs the marketplace threshold + next actions and the points each grants). See marketplace gate in [12-Android-Apps-and-Marketplace.md §3.1a](12-Android-Apps-and-Marketplace.md).
10. **Profile/Consent** — language, KYC, who-can-see-my-data toggles.

### Voice-only mode
Entire core flow operable hands-free: "What should I do today?", "My tomato leaves have spots" (prompts photo), "What's the brinjal price in <mandi>?", "Log 20 kg urea." Falls back to IVR/AI call centre when app unavailable.

### AI Call Centre flow
Missed call from farmer → system calls back → ASR conversation in local language → same RAG assistant → actions logged to field → SMS summary.

## 3. Farmer onboarding flow
```
Install → language → phone OTP → "Add your field"
  → choose: walk perimeter (GPS) OR draw on map OR pick survey parcel
  → confirm area/ownership/water source → Farm Passport issued
  → quick crop history (voice) → first advisory generated → done
```

## 4. FPO / Field Officer flows
- Officer: assigned villages → field list → verify boundary/crop → capture soil/photo → submit (becomes ground truth).
- FPO: **Village Intelligence Dashboard** — map of all member fields colored by risk/productivity; drill to field; bulk advisory broadcast; aggregate procurement planning.

## 5. Bank / Insurer console flows
- Bank: search farmer/field → consent check → credit score + reason codes + KCC limit + repayment forecast → export to LOS; portfolio view with deterioration alerts.
- Insurer: upload portfolio → batch risk pricing → season monitoring → claim assessment with satellite/weather evidence + fraud flags (replaces/augments manual CCE).

## 6. Navigation pattern (Farmer App)
Bottom tabs: **Home · Fields · Ask(mic) · Market · More**. "Ask" center FAB = mic. Persistent alert bell. Everything ≤2 taps from home.

## 7. Notification engine (UX)
- Channels: push → SMS → IVR fallback. Respect quiet hours + language.
- Alert types: heavy rain, disease risk, nutrient deficiency, irrigation reminder, harvest window, market opportunity, insurance warning, credit renewal.
- Each alert = plain-language reason + 1 recommended action + optional "explain" (assistant).

## 7a. Gamification & Respect Points
Two separate currencies, deliberately not merged:
- **Farm Health Score** — agronomy quality of the field (soil/water/crop vigor). Motivates better practices.
- **Respect Points (RP) → trust tier (Bronze/Silver/Gold)** — earned trust from *verified, good-faith* activity (complete Farm Passport, KYC, satellite-corroborated seasons, officer/FPO verification, tenure, honest outcomes; penalized for fraud). **RP alone gates marketplace selling rights** (off by default, unlocks at the RP threshold). Full earning table, thresholds, probation, and re-lock rules live in [12-Android-Apps-and-Marketplace.md §3.1a](12-Android-Apps-and-Marketplace.md).

Other gamification: **badges** (verification, first sale, consistent advisory-follower), **village leaderboard**, **best-farmer awards**, seasonal challenges. Cosmetic recognition is broad; **only RP controls selling**, so the game directly rewards trustworthy, well-documented farming — which also enriches the digital twin.

## 8. Wireframe notes (for design handoff)
Low-fidelity frames per screen above; design tokens: high contrast, 16dp+ tap targets, iconography tested with low-literacy users, color-blind-safe palette. Deliver in Figma with a component library + Lottie voice-state animations.
