# Flick File Transfer Tool

Flick File Transfer Tool is a web application backed by S3-compatible designed to seamlessly handle the ingestion of large video batches from anonymous users and provide an administrative backend for drop management.

**Core Principles:**
- **Anonymous Uploading via Magic Links:** Users start a drop and are immediately given a cryptographically secure "magic link." This link acts as both their identifier and password. No accounts are required, but their submissions remain 100% private.
- **Direct-to-S3 Architecture:** To bypass the physical limitations (resumability, large memory payloads) of traditional proxy backends, we use a custom lightweight Node.js sidecar service. This service generates temporary, presigned S3 URLs, allowing the browser to push gigabytes of video directly to Hetzner Object Storage.
- **Micro-Service State via PocketBase:** A secure and rapid PocketBase instance tracks the state of `drops` and video `metadata`. The PocketBase server requires zero interaction with the heavy video files themselves, thus staying lean.
- **Data Privacy:** Users only ever have access to drops tied to their magic link hash. Administrators have a separated authentication layer to view, manage, and process all drops.

## Architecture

| Component | Tech | Hosting |
|---|---|---|
| **Frontend & API** | React + Vercel Serverless | Vercel |
| **Metadata Backend** | PocketBase v0.25 | PikaPods |
| **File Storage** | Hetzner Object Storage (S3) | Hetzner |
| **CLI Scripts** | Python 3.11+ (`uv`) | Local |

---

## Detailed Deployment Plan

Deploying the Flick File Transfer Tool requires spinning up components across a few services. Below is a step-by-step guide indicating how to launch this in production.

### Phase 1: Storage Infrastructure (Hetzner)
1. **Create S3 Bucket:**
   Log into your Hetzner Cloud Console, navigate to Object Storage, and create a new bucket (e.g., `flick-inbox`). Note the region (e.g., `fsn1`).
2. **Generate Credentials:**
   Create an S3 Access Key and Secret Key. Keep these secure—they will only ever be placed in the Sidecar and your local `.env`.


### Phase 2: Metadata Layer (PikaPods + PocketBase)
1. **Deploy PocketBase:**
   Spin up a new PocketBase pod on PikaPods. Note the public URL (e.g. `https://flick-pb.pikapod.net`).
2. **Initialize Superuser:**
   Navigate your browser to your pod's admin route: `https://your-pikapod-url.com/_/`
   PocketBase will immediately prompt you to establish your initial admin email and password. Save these credentials.
3. **Apply Database Schema:**
   From your local `Flick-File-Transfer-Tool` repo, point the `setup-schema.py` script to your new PikaPod URL and run it with your new superuser credentials to provision the `drops`, `videos`, and `users` tables along with all secure API rules:
   ```bash
   POCKETBASE_URL=https://your-pikapod-url.com \
   PB_ADMIN_EMAIL=your-email@example.com \
   PB_ADMIN_PASS=your-secure-password \
   uv run scripts/setup-schema.py
   ```
4. **Create the First App Admin User:**
   Log back in to the PocketBase Admin UI (`/_/`), go to the `users` collection, and create your first frontend login account with the `role` field set to `admin`.

### Phase 3: Frontend UI & Serverless API (Vercel)
1. **Create Vercel Project:**
   Connect your GitHub repository to Vercel and set the Root Directory to `frontend`.
2. **Apply Build Settings:**
   Framework Preset: `Vite`. Build Command: `npm run build`.
3. **Environment Variables:**
   Add these securely to your Vercel project settings:
   - `POCKETBASE_URL` (Your PikaPod URL, e.g. `https://flick-pb.pikapod.net`)
   - `S3_ENDPOINT` (Your Hetzner endpoint, e.g. `https://fsn1.your-objectstorage.com`)
   - `S3_REGION` (e.g., `fsn1`)
   - `S3_ACCESS_KEY` & `S3_SECRET_KEY` (From your Hetzner console)
   - `S3_BUCKET` (e.g. `flick-inbox`)
   - `VITE_POCKETBASE_URL` (Same as POCKETBASE_URL. Must have `VITE_` prefix to reach client browser)
4. **Deploy:** Hit deploy and Vercel will install the React app and initialize the Serverless API functions automatically.

### Phase 4: Verification
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

### 4. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173` · PocketBase: `http://127.0.0.1:8090`
