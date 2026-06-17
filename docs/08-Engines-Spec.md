# FarmOS AI India — Intelligence Engines (Methodology)

All scores are **0–100, explainable** (component sub-scores + reason codes). Cold-start uses agro-climatic-zone priors; personalizes as field history accumulates.

## 1. Weather Intelligence Engine
**Inputs:** rainfall, humidity, wind, temp (max/min), solar radiation, IMD forecast, field history.
**Outputs/alerts:**
- **Rain alert:** forecast rainfall > threshold in next 24–72h.
- **Spraying alert:** wind < X, no rain in 6–8h window, humidity range OK → "safe to spray now."
- **Irrigation alert:** soil-moisture proxy (NDWI + ET0 water balance) below crop-stage threshold.
- **Heat-stress alert:** Tmax / GDD anomaly vs crop stage tolerance.
- **Disease-risk alert:** humidity+leaf-wetness+temp favorability (feeds disease prediction engine).
- **Harvest-window alert:** dry spell forecast + crop maturity (phenology from NDVI).
**Algorithms:** ET0 via Penman-Monteith; GDD accumulation; threshold rules + GBM for compound risks; nowcasting blends station + forecast.

## 2. Soil Intelligence Engine
**Inputs:** N,P,K,S,Zn,Fe,Mn,Cu,B, organic carbon, pH, EC, CEC, bulk density, WHC (from SHC/lab/model).
**Scores:**
- **Soil Health Score** = weighted index (OC, NPK balance, pH, micronutrients, physical).
- **Nutrient Deficiency Score** = deviation from crop-specific optimal ranges.
- **Yield Limitation Score** = Liebig's-law limiting-factor analysis.
- **Soil Degradation Score** = trend of OC/EC/pH over history + erosion risk (slope, LULC).
**AI reco:** fertilizer recommendation (kg/ha by nutrient) reconciled with crop target yield + soil test + 4R nutrient stewardship; flags over-application (cost + degradation).

## 3. Water Intelligence Engine
**Inputs:** pH, EC, TDS, SAR, RSC, chloride, bicarbonate, hardness, source type, depth, recharge.
**Scores:**
- **Water Quality Score** (irrigation suitability classes from EC/SAR/RSC — US Salinity Lab).
- **Crop Suitability Score** (crop salt tolerance vs water EC).
- **Irrigation Risk Score**, **Salinity Risk Score**, **Sustainability Score** (draft vs recharge, declining water table from CGWB).
**Reco:** amendment (gypsum for high RSC), leaching fraction, drip vs flood, crop switch under salinity.

## 4. Crop Recommendation Engine
**Inputs:** location/agro-climatic zone, season, water availability, soil test, investment capacity, risk appetite.
**Method:** (1) agronomic **suitability filter** (climate, soil, water match) → feasible set; (2) for each feasible crop estimate **yield, cost, price (market engine), profit, risk (risk engine)**; (3) **LightGBM ranker** trained on neighbor-field outcomes ranks by farmer's risk/return preference.
**Output:** top-5 crops with expected yield, profit, risk band, required inputs, market demand, historical performance in similar fields. Reason: "ranked #1: high suitability, strong mandi demand, low water need."

## 5. Yield Prediction Engine
**Features:** weather (GDD, rainfall, stress days), soil, **NDVI/EVI phenology time-series**, management (sowing date, inputs), crop history.
**Models:** LightGBM baseline (tabular + summarized NDVI) → **Temporal model (LSTM/Temporal-CNN/Transformer)** on raw index time-series for in-season updates; **crop simulation model (DSSAT/APSIM)** as physics prior / ensemble member.
**Output:** expected yield, yield range (quantile regression), confidence score. **Model selection:** start tabular GBM (robust, low-data); graduate to temporal once ≥2 seasons of per-field NDVI exist; ensemble with crop model for explainability. In-season: update prediction at each cloud-free pass.

## 6. Disease Diagnosis Engine (image)
Pipeline in [05-AI-Architecture.md §4]. Output: disease/pest/deficiency, **confidence (calibrated)**, severity %, **remedy (product, dose, cost), expected outcome**. Logs to disease_history; farmer confirmation drives active learning.

## 7. Disease Prediction Engine (pre-symptom)
**Inputs:** humidity, rainfall/leaf-wetness, temperature, crop stage, historical outbreaks, neighbor-field detections.
**Method:** crop-disease favorability models (e.g., blast, rust, blight, downy mildew) + GBM trained on past outbreak labels + spatial spread (neighbor outbreaks within radius).
**Output:** disease probability (next 7–14 days), **risk map** (village/region heatmap), preventive actions (prophylactic spray window, resistant practices). Drives B2B outbreak webhooks.

## 8. Market Intelligence Engine
**Inputs:** Agmarknet arrivals + modal prices, seasonality, distance to mandis, storage cost.
**Method:** SARIMAX/Prophet baseline → **Temporal Fusion Transformer** for multi-mandi price forecast; arrivals-vs-price elasticity.
**Output:** best market (net of transport), best selling time, price forecast (with band), store-vs-sell recommendation, profit optimization across mandis/timing.

## 9. Farm Risk Engine
**Sub-risks (each 0–100):** flood (flood-zone + rainfall forecast + drainage), drought (rainfall deficit + soil moisture + irrigation access), pest, disease (from prediction engine), water (sustainability/quality), market (price volatility), climate (long-term zone trend), yield (variance of predicted yield).
**Overall Farm Risk Score:** weighted aggregation, weights calibrated by GBM against realized loss outcomes; **explanation** = top contributing risks. Used by insurers, lenders, FPOs, govt.

## 10. Farm Credit Score (banking-grade)
**Sub-scores:**
- **Farm Productivity** (yield vs zone benchmark, NDVI vigor trend).
- **Farm Stability** (yield variance, crop diversification, irrigation reliability).
- **Repayment Capacity** (modeled net farm income vs obligation; Family ERP if available).
- **Climate Resilience** (risk engine inverse, water sustainability).
- **Input Efficiency** (output per input cost).
- **Credit Risk Score** (PD model).
**Model:** logistic/GBM **scorecard with monotonic constraints + reason codes**, calibrated to PD; reject-inference where labels biased; validated on partner repayment data (credit_history). Outputs score band + recommended limit (KCC) + repayment forecast.
**Use cases:** Banks (KCC underwriting, limit setting, monitoring), NBFCs (thin-file alt-data lending), MFI (group lending risk), Insurers (cross-signal).
**Governance:** model risk management, fairness audit (no unfair penalty to small/marginal), human-in-loop for adverse decisions.

## 11. Insurance Engine
**Outputs:** claim probability, loss probability/expected loss, crop vulnerability score, **premium recommendation** (risk-based), **fraud signals** (claim vs satellite/weather evidence mismatch, duplicate polygons, anomalous timing).
**Value prop:** satellite+weather yield estimation can **replace/augment manual crop-cutting (CCE)** for faster, cheaper PMFBY settlement.

## 12. Scoring governance (all engines)
Versioned models, SHAP explanations stored in `field_score.explanation`, drift monitoring, ground-truth backfill, champion/challenger before any score affecting credit/insurance goes live.
