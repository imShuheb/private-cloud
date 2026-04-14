# Phase 2: Observability Engine (Community Insight)

**Goal**: Deliver the "Wow" feature—identifying storage waste and providing transparency into what is actually stored.

## 🔍 Core Features

### 1. S3 Inventory Ingestion (Efficient Metadata)
Scanning a bucket with 100 million objects via `ListObjectsV2` is expensive and slow. 
- **The Solution**: Ingest **S3 Inventory Reports**. 
- **Implementation**: The worker picks up an Inventory CSV/Parquet file from a designated S3 bucket, parses it, and bulk-inserts metadata into the `object_metadata` table.
- **Benefit**: 100x faster and zero-cost for the user compared to API scanning.

### 2. The "Transparency" Dashboard
A visualization of silent space-wasters:
- **Non-Current Versions**: Tracking data kept from bucket versioning that is no longer active.
- **Forgotten multipart uploads**: Identifying failed uploads that are taking up space but are invisible in the file explorer.
- **Ghost Data**: Objects unmodified for >365 days that should likely be moved to Cool Storage (Glacier/IA).

### 3. Dynamic Cost Tracking
- Mapping bucket sizes to real-world cloud prices to help community members budget.
- **Standard vs. Archive**: Show the potential savings if "Ghost Data" is transitioned to Glacier.

---

## ✅ Deliverables (v1.5.0)
- [ ] **Ingestion Handler**: Go logic to process gzipped CSV/Parquet inventory files.
- [ ] **Insights UI**: A new "Health" tab in the frontend with Tremor charts.
- [ ] **Storage Class Breakdown**: Visualizing the distribution of data across S3 tiers.
- [ ] **Empowerment Calculator**: "You saved $X by optimizing non-current versions."

> [!TIP]
> This is the "Community Value" phase. This proves that the tool is an essential utility for anyone looking to optimize their personal or professional cloud storage.
