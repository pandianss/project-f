# FarmOS AI India — Loss Aversion & Profitability Engine

> The farmer doesn't care about NDVI or models. They care about two things: **"don't let me lose money / my crop"** and **"help me earn more."** Every feature must ladder up to one of these. This doc makes that explicit and measurable.

## 1. The two farmer promises
1. **Protect** — see threats early enough to act, and act in time (disaster/loss aversion).
2. **Profit** — make every season earn more than it cost, optimized end to end.

These are tracked as the app's **North-Star farmer metrics**: ₹ loss averted/season and ₹ net profit uplift/season per field — shown back to the farmer and used in B2B value proof.

---

## 2. LOSS AVERSION — the Protection layer

### 2.1 Proactive, not reactive
The platform predicts and warns **before** loss occurs, and confirms the farmer acted. A prediction that doesn't change behavior is worthless, so every protective alert is **action-first**: one plain-language threat + one recommended action + a deadline.

### 2.2 Threat → early-warning → action map
| Threat | Detected by | Lead time | Action delivered |
|---|---|---|---|
| Heavy rain / flood | Weather engine + flood-zone GIS | 24–72 h | delay irrigation/spray, drain field, harvest-now if mature, move stored produce |
| Drought / water stress | rainfall deficit + soil-moisture (NDWI) + ET0 balance | days–weeks | irrigation scheduling, mulching, switch to less-thirsty stage management |
| Pest/disease outbreak | Disease **prediction** engine (pre-symptom) + neighbor spread | 7–14 days | preventive spray window, resistant practice, scouting prompt |
| Heat stress | temp/GDD anomaly vs crop stage | 1–3 days | shade/irrigation timing, foliar action |
| Nutrient deficiency | soil engine + NDVI vigor drop | in-season | corrective dose before yield is lost |
| Wrong spray timing | weather (wind/rain/humidity) | same-day | "safe to spray now" / "don't spray" windows |
| Market price crash | market engine forecast | days–weeks | hold/store vs sell-now, alternate mandi |
| Input over-application | soil/input efficiency | pre-application | avoid wasted ₹ + soil degradation |
| Insurance lapse / claim miss | insurance + calendar | before deadline | enroll/renew PMFBY, file claim with auto-evidence |
| Credit renewal lapse | credit engine + KCC calendar | before due | renew KCC, avoid penal interest |

### 2.3 Closing the loop (alert → action → confirmation)
1. **Predict** threat with confidence + estimated ₹ at risk.
2. **Alert** via push → SMS → IVR/AI call-back (so it reaches even offline/low-literacy users).
3. **Guide** the exact action (product, dose, timing) via the assistant.
4. **Confirm** the farmer acted (one-tap / voice "done"); if not, **escalate** (repeat, call, notify FPO officer).
5. **Verify outcome** next satellite pass / officer check → log ₹ loss averted.

### 2.4 Disaster mode
On a high-severity regional event (cyclone, flood, locust, major outbreak), the app switches to **Disaster Mode**: prioritized critical alerts, simplified single-action screens, offline-cached guidance, FPO/officer coordination, and fast-tracked **insurance claim evidence** (satellite + weather record auto-attached) so recovery money arrives faster.

---

## 3. PROFITABILITY — the Optimization layer

Profit = **(yield × price) − cost**. The platform optimizes all three levers, every season.

### 3.1 Profit levers and how each is improved
| Lever | Engine(s) | How profit improves |
|---|---|---|
| **Choose the right crop** | Crop reco (yield × profit × risk ranking) | plant what actually pays in *this* field/season, not habit |
| **Raise yield** | Yield engine + soil/water reco + disease protection | close the yield gap vs zone benchmark; prevent losses that cap yield |
| **Cut input cost** | Soil/input-efficiency engine | right dose, no over-application; avoid wasted seed/fertilizer/pesticide |
| **Time the harvest** | weather + phenology | harvest in the right window → quality grade → better price |
| **Sell at the best price/place/time** | market engine + marketplace | best mandi vs store-and-wait; **direct-retail removes middleman margin** |
| **Lower finance cost** | credit engine | better score → KCC at lower rate, right limit, no penal interest |
| **Lower risk cost** | risk + insurance engine | right-priced insurance, fewer uninsured losses |
| **Capture provenance premium** | digital twin + marketplace | verified clean/organic produce sells higher |

### 3.2 Season Profit Planner (farmer-facing)
A single guided flow that turns optimization into a plan:
```
Before sowing → crop reco picks best ₹-return crop for this field/budget/risk
During season → yield tracking + input-efficiency nudges + protection alerts keep the plan on track
At harvest    → harvest-window + grade guidance
At sale       → market timing + best channel (direct-retail marketplace vs mandi)
After         → actual vs planned P&L in Family ERP → learn for next season
```
The **Family ERP** records income/expense/profit per season so "profitability" is *measured*, not claimed — and that real cash-flow becomes a positive credit signal.

### 3.3 Profit dashboard (Home)
The farmer sees, per field/season:
- **Projected net profit** (live, updates with conditions and prices).
- **Profit at risk** (₹ exposed to current threats) + the actions to protect it.
- **Profit opportunities** (e.g., "sell in <mandi> +₹3/kg", "cut urea by 15 kg saves ₹X", "switch sowing date +₹Y").
- **Realized profit** vs projection at season end.

---

## 4. How this reshapes priorities (design rule)
- **Every alert states ₹ at risk and the protective action.** No bare data.
- **Every recommendation states expected ₹ impact** (cost, expected gain/loss avoided, confidence).
- **The assistant is profit-aware:** "What should I do today?" answers in terms of protecting/earning money, grounded in the field's twin.
- **Success is measured in the farmer's currency:** ₹ loss averted + ₹ profit uplift — surfaced to the farmer and aggregated as the platform's outcome proof for FPOs, lenders, insurers, and investors.

## 5. Why this also powers the business
Demonstrable, logged **₹ loss averted + profit uplift** is the strongest possible evidence for:
- **Farmer retention** (tangible value, not novelty).
- **FPO/govt contracts** (aggregate productivity + resilience gains).
- **Lenders** (more profitable, more resilient borrowers = lower NPA → validates the credit score).
- **Insurers** (proactive loss prevention lowers loss ratios → validates risk pricing).

Protection and profitability aren't separate from the credit/risk moat — they are *what generates* the outcome data the moat is built on.
