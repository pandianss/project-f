# FarmOS AI India — API Design

## 1. Conventions
- REST/JSON over HTTPS for external; gRPC internal. Versioned `/v1`.
- Auth: OAuth2 client-credentials (B2B), OTP/JWT (farmer app). B2B requests HMAC-signed.
- Idempotency keys on writes. Cursor pagination. RFC-7807 problem+json errors.
- Every B2B data read requires a valid `consent_grant` and is audited.
- Rate limits + quotas per plan; `429` with `Retry-After`.

## 2. Farmer / app APIs
```
POST /v1/auth/otp                      request/verify OTP
POST /v1/fields                        create field (polygon, ownership) → passport_no
GET  /v1/fields/{id}                   field + latest twin snapshot
GET  /v1/fields/{id}/passport          full historical record
POST /v1/fields/{id}/observations      farmer log (crop, input, irrigation, note)
POST /v1/fields/{id}/disease/diagnose  multipart image → disease result
GET  /v1/fields/{id}/advisory          today's contextual advisory
GET  /v1/fields/{id}/alerts            active alerts
POST /v1/assistant/ask                 {text|audio, lang} → answer (RAG)
GET  /v1/fields/{id}/crop-reco         crop recommendation (params)
GET  /v1/fields/{id}/yield             yield prediction
GET  /v1/market/prices?crop&mandi      market intelligence
GET  /v1/erp/{farmerId}/summary        Family ERP income/expense/profit
```

## 3. Engine APIs (internal + B2B-exposed subset)
```
GET  /v1/fields/{id}/scores/soil
GET  /v1/fields/{id}/scores/water
GET  /v1/fields/{id}/scores/risk        farm risk 0-100 + sub-scores + explanation
GET  /v1/fields/{id}/scores/credit      credit score + reason codes
GET  /v1/fields/{id}/scores/insurance   loss/claim prob + premium reco
POST /v1/disease/predict                pre-symptom risk for field/region
```

## 4. B2B / institutional APIs (the revenue surface)
```
# Banks / NBFC / MFI
POST /v1/b2b/credit/score               batch: [field/farmer ids] → scores + reason codes
GET  /v1/b2b/credit/{farmerId}/kcc      KCC eligibility + recommended limit
GET  /v1/b2b/credit/{farmerId}/repayment-forecast
POST /v1/b2b/portfolio/monitor          ongoing risk on a loan book (webhooks on deterioration)

# Insurers
POST /v1/b2b/insurance/price            field → premium reco + loss prob
POST /v1/b2b/insurance/claims/assess    claim → satellite/weather-backed loss evidence + fraud signals
GET  /v1/b2b/insurance/cce-replacement  yield estimate replacing manual crop-cutting

# Input companies
GET  /v1/b2b/demand/heatmap?region&product   demand intelligence
POST /v1/b2b/recommendations/place           sponsored input reco (marketplace)

# Govt / FPO
GET  /v1/b2b/dashboard/village/{id}     aggregate risk/productivity (Village Intelligence)
GET  /v1/b2b/dashboard/district/{id}    scheme targeting, drought/flood exposure
```

## 5. Consent & data APIs
```
POST /v1/consent/grant     {field_id, org_id, scope[], valid_until}
POST /v1/consent/revoke
GET  /v1/consent/mine       farmer view of who can see what
GET  /v1/audit?field_id     access log (farmer + regulator view)
```

## 6. Webhooks / events (B2B)
- `risk.deteriorated`, `disease.outbreak.predicted`, `harvest.window.open`,
  `credit.score.changed`, `claim.evidence.ready`. HMAC-signed, retried with backoff.

## 7. Score response shape (explainable)
```json
{
  "field_id": "…", "score_type": "credit", "value": 712,
  "band": "B+", "model_version": "credit-2.3.1",
  "sub_scores": {"productivity": 78,"stability": 65,"repayment_capacity": 71,
                 "climate_resilience": 60,"input_efficiency": 74},
  "reason_codes": [
    {"code":"YIELD_TREND_POS","impact":"+","weight":0.18},
    {"code":"WATER_RISK_HIGH","impact":"-","weight":0.12}],
  "computed_at": "2026-06-17T…", "valid_until": "2026-09-17T…"
}
```
