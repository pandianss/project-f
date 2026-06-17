# FarmOS AI India — GIS Architecture & Data Sources

## 1. Geospatial stack
| Layer | Choice | Why |
|---|---|---|
| Spatial DB | **PostGIS** (on Postgres/Aurora) | vector storage, topology, spatial joins, RLS |
| Time-series geo | TimescaleDB | NDVI/weather per field over time |
| Raster store | **S3 + Cloud-Optimized GeoTIFF (COG) + STAC catalog** | cheap, range-readable, scalable |
| Tile/map server | **GeoServer** (WMS/WMTS/WFS) + **TiTiler** (dynamic COG tiles) | serve vector + raster layers |
| Frontend maps | **Mapbox GL JS** (or MapLibre to avoid license cost) + **OpenLayers** for heavy GIS portals | smooth vector tiles; OL for analyst tools |
| Vector tiles | Tegola / pg_tileserv → MVT | fast field rendering at scale |
| Desktop/analyst | **QGIS** connected to PostGIS | curation, QA, manual digitization |
| Raster compute | Google Earth Engine (rapid prototyping) → self-hosted (rasterio, rioxarray, dask, openEO) for production | NDVI/index pipelines |

## 2. Layer catalog
**Administrative/cadastral:** village boundaries, survey/parcel boundaries (Bhu-Naksha/ULPIN), field boundaries (user-drawn + satellite-segmented).
**Natural resource:** soil maps (NBSS&LUP), rainfall grids (IMD), groundwater (CGWB), flood zones, drought zones, watersheds, rivers, canals.
**Infrastructure:** roads, mandis/markets (Agmarknet), cold storages, warehouses, bank branches, input dealers, weather stations.
**Remote-sensing (raster, continuous):** NDVI, EVI, NDWI, soil moisture, Land Surface Temperature — from Sentinel-2, Landsat 8/9, MODIS.

## 3. Field boundary capture
- **Farmer-drawn polygon** on map (offline-capable).
- **GPS perimeter walk** (record track → polygon).
- **AI-assisted segmentation:** SAM/U-Net on high-res imagery snaps boundary to parcel edges.
- **Validation:** overlap detection, area sanity vs survey record, self-intersection check.

## 4. Satellite index pipeline
```
STAC search (Sentinel-2 L2A, 5-day) → cloud mask (s2cloudless/SCL)
  → clip to field polygon → compute NDVI/EVI/NDWI/LST/soil-moisture
  → zonal stats (mean/median/min/max per field) → satellite_history
  → time-series smoothing (Savitzky-Golay) → phenology (greenup/peak/senescence)
```
- Gap-fill cloudy dates via temporal interpolation + Landsat/MODIS fusion.
- Store both per-field zonal stats (hot path) and tiled COGs (visual path).

## 5. Data sources, frequency, ingestion
| Source | Data | Update freq | Access | Notes |
|---|---|---|---|---|
| **Sentinel-2** (Copernicus/AWS Open Data) | 10–20m multispectral | ~5 days | STAC/S3 | primary vegetation indices |
| **Landsat 8/9** (USGS) | 30m, thermal | ~16 days | STAC/S3 | LST, gap-fill |
| **MODIS** | 250m–1km, daily | daily | LP DAAC | broad trends, fire |
| **IMD** | rainfall, temp, forecast | daily/sub-daily | API/grids | gridded + station |
| **data.gov.in** | many agri datasets | varies | REST API | catalog source |
| **ICAR / NBSS&LUP** | soil maps, agronomy | static/periodic | files/portal | soil series |
| **Soil Health Card** | field nutrient tests | per-cycle | portal/API | per-farmer |
| **ISRO Bhuvan** | thematic layers, LULC | periodic | WMS/API | land use, watersheds |
| **FASAL/Mahalanobis (MNCFC)** | crop forecasts | seasonal | reports/API | benchmark yields |
| **Agmarknet** | mandi prices, arrivals | daily | API/scrape | market engine |
| **PMFBY** | insurance, CCE | seasonal | portal | insurance ground truth |
| **CGWB** | groundwater level/quality | periodic | portal | water engine |
| **State Ag Depts** | scheme, advisory | varies | MOUs | partnerships |

## 6. Ingestion architecture
- **Orchestrator:** Airflow/Dagster DAGs per source; idempotent, checkpointed.
- **Pattern:** pull → land bronze (raw) → validate → conform CRS (EPSG:4326 store, 32643/44 for area calc) → join to fields → silver → features/gold.
- **Validation:** schema checks (Great Expectations), range checks, CRS/geometry validity (ST_IsValid + ST_MakeValid), cloud-% thresholds, freshness SLAs, dedup.
- **Scaling:** per-field satellite jobs fan out via Kafka + workers; backfill with dask on spot GPUs/CPUs.
- **Lineage:** OpenLineage; every gold feature traceable to source pull.

## 7. Performance & cost
- Pre-compute zonal stats nightly for active fields only (don't process empty geographies).
- Tile pyramids cached on CDN; vector tiles generalized by zoom.
- COG range reads avoid full-scene downloads; cluster fields by tile to batch reads.
