# FarmOS AI India — AI / ML Architecture

## 1. Principles
- **Hybrid models:** agronomic rules + ML. Pure ML fails cold-start; rules give safe defaults, ML refines as field history accumulates.
- **Explainability mandatory** for risk/credit/insurance (SHAP, reason codes) — regulators and lenders require it.
- **Cold-start → personalized:** start with regional/agro-climatic-zone priors, shrink toward field-specific as data grows (hierarchical/Bayesian).
- **Ground-truth loops:** yield outcomes, claim outcomes, repayment outcomes feed back as labels.

## 2. MLOps platform
- **Tracking/registry:** MLflow. **Feature store:** Feast. **Pipelines:** Kubeflow/Dagster.
- **Serving:** BentoML/Triton for tabular+CV; vLLM for LLM. **Batch scoring:** Spark/Ray.
- **Monitoring:** Evidently/Arize — data drift, prediction drift, performance vs backfilled ground truth.
- **CI/CD for models:** versioned datasets (DVC/lakeFS), shadow deploys, champion/challenger, automatic rollback on metric regression.

## 3. Engine-by-engine model choices
(Detailed methodology in [08-Engines-Spec.md](08-Engines-Spec.md). Model selection summary here.)

| Engine | Approach | Model(s) | Why |
|---|---|---|---|
| Weather alerts | Rules over IMD forecast + thresholds + nowcasting | Gradient-boosted classifiers for disease/heat risk; rule thresholds for spray/irrigation | interpretable, fast, robust |
| Crop reco | Hybrid: suitability rules + ranking ML | LightGBM ranker + agro-climatic suitability matrix; collaborative signal from neighbor fields | cold-start safe |
| Yield prediction | Spatio-temporal regression | LightGBM (tabular features) baseline → LSTM/Temporal-CNN/Transformer on NDVI time-series + weather; crop-model (DSSAT/APSIM) as physics prior | best mix accuracy+explainability |
| Disease diagnosis (image) | Computer vision | EfficientNet/ConvNeXt or **ViT** fine-tuned; **YOLOv8** for localization/severity; Gemini/Claude Vision as fallback/bootstrap | accuracy + on-device option |
| Disease prediction (pre-symptom) | Epidemiological risk | GBM on weather+stage+history; classic disease models (e.g., wheat rust, blast favorability) | agronomically grounded |
| Market intelligence | Price/arrival forecasting | SARIMAX/Prophet baseline → Temporal Fusion Transformer; seasonality + arrivals | handles seasonality |
| Farm risk | Composite scoring | weighted multi-factor + GBM calibration | transparent 0–100 |
| Credit score | Banking-grade scorecard | logistic/GBM scorecard with reason codes + reject-inference; monotonic constraints | regulator-friendly |
| Insurance | Loss/claim probability | GBM survival/classification; actuarial overlay | pricing + fraud |
| FarmGPT assistant | RAG + fine-tuned LLM | see §5 | multilingual advisory |

## 4. Computer Vision pipeline (disease)
```
Capture (leaf/stem/fruit/whole-plant) → quality check (blur/lighting/crop-type gate)
  → detection (YOLOv8: lesions/pests bbox) → classification (ViT/ConvNeXt: disease/pest/deficiency)
  → severity (% leaf area affected via segmentation) → confidence calibration (temperature scaling)
  → remedy lookup (agronomy KB: product, dose, cost, expected outcome) → log to disease_history
```
- **Edge option:** quantized TFLite/ONNX model on-device for offline + low-data; server model for hard cases.
- **Data flywheel:** farmer-confirmed outcomes + officer labels → active learning retrain.
- **Open-source bases:** PlantVillage/PlantDoc pretrain → fine-tune on India field photos. Augmentations for real-field noise (occlusion, soil, mixed lighting).

## 5. FarmGPT (multilingual voice-first assistant)
**Architecture: RAG over the farmer's own twin + agronomy KB + a fine-tuned Indian-ag LLM.**
```
Voice in → ASR (IndicConformer/Whisper fine-tuned for Indian languages + farm vocab)
  → intent + entity extraction → RAG retrieval:
      [farm context: this field's soil/water/crop-stage/weather/market]
      [agronomy KB: ICAR practices, package-of-practices, regional advisories]
  → LLM (FarmGPT: base open LLM fine-tuned + Indic instruction-tuned; Claude/Gemini for hard reasoning)
  → grounded answer with citations to KB + the field's data → TTS (Indic) → voice out
```
- **Languages:** Tamil, Hindi, English, Telugu, Kannada, Malayalam, Punjabi (phased).
- **Guardrails:** never recommend banned/unsafe agrochemicals; dose limits validated; defer to human officer on low confidence; refuse medical/financial advice beyond scope.
- **FarmGPT fine-tuning corpus:** ICAR package-of-practices, KVK advisories, state ag dept bulletins, crop calendars, anonymized Q&A from the assistant, regional dialect data. Continual eval set per crop/region.
- **Vector DB:** pgvector/Qdrant; hybrid (BM25 + dense) retrieval; per-tenant + per-field namespaces.

## 6. Drone integration (later phase)
- Multispectral/RGB drone scans → orthomosaic → field-level NDVI hotspots → disease/pest hotspot detection (same CV stack at higher res) → targeted advisory + variable-rate input maps.

## 7. Responsible AI
- Bias checks across land size, gender, region (credit must not unfairly penalize marginal farmers).
- Human-in-the-loop for adverse credit/insurance decisions; reason codes surfaced.
- Model cards + datasheets per model; periodic fairness audits.
