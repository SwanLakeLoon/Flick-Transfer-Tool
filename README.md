# Flick File Transfer Tool

Flick File Transfer Tool is a highly scalable, secure, and intuitive web application designed to replace your current Proton Drive flow. It is built to seamlessly handle the ingestion of large video batches from anonymous users, provide an administrative backend for drop management, and bridge the cloud storage layer with your local `Flick-AI` processing pipeline.

**Core Principles:**
- **Anonymous Uploading via Magic Links:** Users start a drop and are immediately given a cryptographically secure "magic link." This link acts as both their identifier and password. No accounts are required, but their submissions remain 100% private.
- **Direct-to-S3 Architecture:** To bypass the physical limitations (resumability, large memory payloads) of traditional proxy backends, we use a custom lightweight Node.js sidecar service. This service generates temporary, presigned S3 URLs, allowing the browser to push gigabytes of video directly to Hetzner Object Storage.
- **Micro-Service State via PocketBase:** A secure and rapid PocketBase instance tracks the state of `drops` and video `metadata`. The PocketBase server requires zero interaction with the heavy video files themselves, thus staying lean.
- **Data Privacy:** Users only ever have access to drops tied to their magic link hash. Administrators have a separated authentication layer to view, manage, and process all drops.

## Architecture

| Component | Tech | Hosting |
|---|---|---|
| **Frontend** | React + Vite | Vercel |
| **Metadata Backend** | PocketBase v0.25 | PikaPods |
| **File Storage** | Hetzner Object Storage (S3) | Hetzner |
| **Presign Sidecar** | Express.js (~80 lines) | PikaPods / Hetzner VM |
| **CLI Scripts** | Python 3.11+ (`uv`) | Local |

---

## Detailed Deployment Plan

Deploying Flick requires spinning up components across a few services. Below is a step-by-step guide indicating how to launch this in production.

### Phase 1: Storage Infrastructure (Hetzner)
1. **Create S3 Bucket:**
   Log into your Hetzner Cloud Console, navigate to Object Storage, and create a new bucket (e.g., `flick-inbox`). Note the region (e.g., `fsn1`).
2. **Generate Credentials:**
   Create an S3 Access Key and Secret Key. Keep these secure—they will only ever be placed in the Sidecar and your local `.env`.
3. **Configure CORS:**
   Because browsers will upload directly to this bucket, Hetzner requires a CORS policy. Use your preferred S3 tool or the Hetzner CLI to apply a broad CORS policy allowing `PUT` and `GET` requests from your eventual Vercel domain.

### Phase 2: Metadata Layer (PikaPods + PocketBase)
1. **Deploy PocketBase:**
   Just like you did for Fluke, spin up a new PocketBase pod on PikaPods. Note the public URL.
2. **Apply Database Schema:**
   From your local `Flick-File-Transfer-Tool` repo, point the `setup-schema.py` script to your new PikaPod URL and run it to provision the `drops`, `videos`, and `users` tables along with all secure API rules:
   ```bash
   POCKETBASE_URL=https://your-pikapod-url.com \
   PB_ADMIN_EMAIL=your-email@example.com \
   PB_ADMIN_PASS=your-secure-password \
   uv run scripts/setup-schema.py
   ```
3. **Create the First App Admin User:**
   Log in to the PocketBase Admin UI, go to the `users` collection, and create your first login with `role: admin`.

### Phase 3: Presigned URL Sidecar (PikaPods / Hetzner VM)
1. **Prepare Environment Variables:**
   The sidecar needs to talk to Hetzner and PocketBase. Configure the following variables on the host environment:
   - `POCKETBASE_URL` (Your PikaPod URL)
   - `S3_ENDPOINT` (Your Hetzner endpoint, e.g. `https://fsn1.your-objectstorage.com`)
   - `S3_REGION` (e.g., `fsn1`)
   - `S3_ACCESS_KEY` & `S3_SECRET_KEY`
   - `S3_BUCKET` (e.g. `flick-inbox`)
   - `CORS_ORIGINS` (Your UI domain, e.g. `https://flick.example.com`)
2. **Launch Docker Container:**
   Deploy the sidecar using the provided Dockerfile. If using PikaPods, you can run Custom Docker images, or you can host it on a cheap $4 Hetzner VM.
   ```bash
   docker build -t flick-sidecar ./sidecar
   docker run -d -p 4000:4000 --env-file .env flick-sidecar
   ```
3. **Expose securely:** Ensure the sidecar is accessible via HTTPS (e.g. via Cloudflare tunnel, Caddy, or Nginx).

### Phase 4: Frontend UI (Vercel)
1. **Create Vercel Project:**
   Connect your GitHub repository to Vercel and set the Root Directory to `frontend`.
2. **Apply Build Settings:**
   Framework Preset: `Vite`. Build Command: `npm run build`.
3. **Set Environment Variables:**
   Add `VITE_POCKETBASE_URL` (pointing to your PikaPod) and `VITE_SIDECAR_URL` (pointing to your remote sidecar).
4. **Deploy:** Hit deploy and Vercel will launch the React tool.

### Phase 5: Verification
1. Access the Vercel URL and create a test drop.
2. Ensure you can drag and drop a 500MB+ `.mp4` and successfully upload it to Hetzner without memory crash issues.
3. Log in as your PocketBase `admin` user at `/admin`.
4. Perform a local test pull script: `python scripts/pull_drop.py <token> ./test_batch/`

---

## Workflows

### Uploaders (Anonymous)
1. Visit the site → **Start New Submission**
2. Drag & drop video files → Upload
3. **Save your unique link** (bookmark it!)
4. Click **Submit for Processing**
5. Return later → download your results CSV

### Admins
1. Login at `/admin`
2. Review submissions on the dashboard
3. Use CLI to pull videos for local processing

### CLI Bridge
```bash
# Pull all videos from a drop
python scripts/pull_drop.py <drop_token> ./batch_folder/

# Run Flick-AI pipeline (your existing tool)
cd ../Flick-AI
PYTHONPATH=src python src/pipeline/orchestrator.py ../Flick-File-Transfer-Tool/batch_folder/

# Push results back
python scripts/push_results.py <drop_token> ./batch_folder/results.csv
```

---

## Local Development Quick Start

### 1. Requirements
- Node.js 18+
- Python 3.11+ and `uv`
- PocketBase v0.25+ binary

### 2. Startup Servers
```bash
cp .env.example .env

# Terminal 1: PocketBase
./backend/pocketbase serve --http 127.0.0.1:8091

# Terminal 2: Sidecar
cd sidecar && npm run dev

# Terminal 3: Frontend
cd frontend && npm run dev
```

Frontend: `http://localhost:5173` · PocketBase: `http://127.0.0.1:8091` · Sidecar: `http://127.0.0.1:4000`
