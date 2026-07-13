# Aria

An AI agent monorepo that helps **non-experts** create complete songs — from a plain-language idea through planning, lyrics, composition, and mixing.

## Architecture

```
aria/
├── apps/
│   ├── web/                    # Next.js UI (guided song creation wizard)
│   └── mobile/                 # Flutter mobile client for the same Agent API
├── packages/
│   └── shared-types/           # TypeScript contracts shared with the frontend
├── services/
│   ├── api/                    # Modular NestJS API: songs, ingestion, settings, health
│   ├── agent/                  # LangGraph orchestrator (plan → lyrics → compose → mix)
│   ├── lyrics/                 # Lyric generation service
│   ├── composition/            # MIDI + stem generation service
│   └── mixing/                 # Stem mixing + loudness normalization
├── docker-compose.yml
└── package.json                # pnpm + Turborepo root
```

```mermaid
flowchart LR
    User[Non-expert user] --> Web[Next.js Web / Flutter Mobile]
    Web --> API[NestJS API + converter]
    API --> Agent[Python LangGraph Agent]
    Agent --> Plan[Planning]
    Plan --> Lyrics[Lyrics Service]
    Lyrics --> Compose[Composition Service]
    Compose --> Mix[Mixing Service]
    Mix --> Agent
    Agent --> Redis[(Redis state)]
```

## Technology choices

| Layer | Choice | Why |
|-------|--------|-----|
| **Monorepo** | pnpm workspaces + Turborepo | Fast installs, cached builds, clean separation between UI and services while sharing types |
| **Frontend** | TypeScript + Next.js 15 + React 19 | Best-in-class DX for accessible, guided UIs; SSR-ready; non-experts need a simple wizard, not a CLI |
| **Public API** | NestJS + TypeScript | Validates requests, accepts media uploads, converts audio/video, stores settings, and forwards AI jobs |
| **Agent orchestration** | Python + LangGraph | Song creation is a multi-step state machine; the AI runtime remains Python |
| **LLM integration** | LangChain + OpenAI | Mature tooling for structured JSON outputs in planning and lyrics; works without an API key via template fallbacks for local dev |
| **Microservices** | FastAPI (Python) | Each creative step is CPU/GPU-intensive and independently scalable; FastAPI gives async I/O, auto OpenAPI docs, and Pydantic validation |
| **Audio** | midiutil, numpy, scipy | Lightweight, no-GPU local dev path; composition generates MIDI + stems, mixing applies EQ/normalization. Swap internals for MusicGen, Suno, or Udio APIs in production |
| **State** | Redis | Fast project polling from the web UI while long-running pipelines execute |
| **Persistence** | PostgreSQL + S3-compatible object storage | PostgreSQL stores project/artifact metadata; media binaries use MinIO locally and S3 (or R2) in production |
| **Containers** | Docker Compose | One command to run the full stack locally |

### Why Python for AI services and TypeScript for the UI?

Python dominates the AI/ML ecosystem (LangChain, audio libraries, model hosting). TypeScript dominates interactive web UIs. A polyglot monorepo lets each layer use the best tool without forcing Python into the frontend or React into the agent.

### Why microservices instead of one monolith?

Planning, lyrics, composition, and mixing have different resource profiles (LLM calls vs. DSP vs. future GPU inference). Splitting them lets you scale composition/mixing on GPU nodes while keeping lightweight LLM services on CPU instances.

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- (Optional) `OPENAI_API_KEY` for higher-quality planning and lyrics

### 1. Install frontend dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Add OPENAI_API_KEY=sk-... for LLM-powered output (optional)
```

### 3. Start backend services

```bash
docker compose up --build
```

Services:

| Service | Port | Role |
|---------|------|------|
| API | 8010 | Public NestJS API, media converter, and settings |
| Agent | 8000 | Internal Python/LangGraph orchestrator |
| Lyrics | 8001 | Generates lyrics |
| Composition | 8002 | Creates MIDI + stems |
| Mixing | 8003 | Produces final WAV |
| Postgres | 5432 | Prisma-managed project, artifact, lineage, provenance, and review metadata |
| MinIO | 9000 / 9001 | Private S3-compatible artifact objects / local admin console |
| Redis | 6379 | Project state |

The API ingestion module requires `ffmpeg` and `ffprobe`. The Docker image installs them automatically; for local API development install FFmpeg 6 or newer from your operating system.
The API container applies pending Prisma migrations before it starts. MinIO creates the private
`aria-artifacts` bucket on first boot and persists objects in the `minio_data` volume.

### 4. Start the web app

```bash
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000), describe your song, and watch the pipeline progress. The web app connects to the agent via Server-Sent Events and streams lyrics and instrumental previews as each LangGraph stage completes.

### 5. Run the Flutter mobile app

The Flutter client lives in `apps/mobile` and uses the existing Agent REST API. It polls project status while a song is being generated and provides mobile views for the brief form, pipeline progress, lyrics, instrumental preview, and final mix.

For a browser preview from a remote server, use Flutter's web server target rather than the Linux desktop target:

```bash
cd apps/mobile
flutter run -d web-server --web-hostname 127.0.0.1 --web-port 3000 --dart-define=AGENT_API_URL=http://localhost:8010
```

Flutter development can be done entirely from VS Code and a terminal; Android Studio's UI is not required. Install the Flutter SDK, Android command-line tools, a JDK, and accept the Android SDK licenses before targeting Android.

```bash
cd apps/mobile
flutter create .                         # first run: generate Android/iOS runners
flutter pub get
flutter run --dart-define=AGENT_API_URL=http://10.0.2.2:8010
```

Use `http://localhost:8010` for iOS simulators or desktop Flutter targets. For a physical device, replace the host with the machine's LAN IP and ensure port 8010 is reachable.

## Web ↔ Agent connection

```
Browser (Next.js)
  │  POST /songs              → start LangGraph pipeline
  │  GET  /songs/{id}/events  → SSE stream (plan → lyrics → compose → mix)
  │  GET  /songs/{id}/assets/instrumental → preview WAV while mixing runs
  │  GET  /songs/{id}/assets/mix        → final mastered WAV
  └  GET  /songs/{id}/assets/midi       → MIDI arrangement download

Agent (LangGraph + FastAPI)
  │  plan node    → lyrics service
  │  lyrics node  → saves lyrics → web shows LyricsPanel
  │  compose node → composition service → saves MIDI + instrumental preview
  │  mixing task  → mixing service (parallel, while user listens to preview)
  └  Redis        → project state + SSE fan-out
```

Set `NEXT_PUBLIC_AGENT_API_URL=http://localhost:8010` in `.env` for the browser or mobile client to reach the NestJS API.

## Audio and artifact storage

Media binaries belong in object storage, not PostgreSQL. PostgreSQL stores project and artifact
metadata, versions, dependency edges, provenance, model/prompt versions, quality scores, human edits,
pipeline phases, and review status through Prisma. MinIO is the local S3-compatible provider; Amazon
S3 and Cloudflare R2 can use the same adapter in production. The NestJS API records immutable object
keys internally and exposes opaque artifact IDs plus short-lived signed upload/playback URLs, never
object keys or host filesystem paths to clients.

Keep original uploads, normalized WAV files, analysis outputs, stems, previews, draft deliverables,
and final masters as separate immutable artifacts. This allows drafted lyrics, drafted instrumental,
and drafted composed song to be reviewed or regenerated without overwriting their parents. Object
keys follow `projects/{projectId}/{namespace}/{artifactId}/{fileName}`. Artifact rows use independent
`logicalName`/`version` sequences, an optional parent, and typed many-to-many dependency edges.

Retention is metadata-driven: originals and final masters/exports are deletion-protected;
intermediates may be deleted only after active descendants are removed; previews may receive a short
`expiresAt`; deleting an eligible artifact tombstones its metadata rather than reusing its key. The
current converter still uses `MEDIA_STORAGE_DIR` as its FFmpeg compatibility workspace while the
object-storage contract and metadata repository are adopted by subsequent pipeline phases.

The versioned payload contracts are in `services/api/src/artifacts/artifact.contracts.ts`, the Prisma
schema is in `services/api/prisma/schema.prisma`, and migrations live under
`services/api/prisma/migrations`. Redis remains limited to locks, progress, queues, and event fan-out.

### Signed artifact URLs

Create a project directly with `POST /projects`, or use the project created by `POST /songs`. Request
an immutable pending artifact and signed upload URL with:

```bash
curl -X POST http://localhost:8010/projects/{projectId}/artifacts/upload-url \
  -H 'Content-Type: application/json' \
  -d '{"artifactType":"LYRICS","namespace":"LYRICS","retentionClass":"INTERMEDIATE","logicalName":"draft-lyrics","fileName":"lyrics.json","contentType":"application/json"}'
```

After the worker verifies the object and marks it `AVAILABLE`, request playback/download metadata at
`GET /projects/{projectId}/artifacts/{artifactId}/download-url`. URLs expire after 15 minutes by
default; allowed lifetimes are 60–3600 seconds.

### MinIO security, backup, and restore

Compose binds MinIO only to loopback for development. Replace the default credentials, mount
`public.crt` and `private.key` under `infrastructure/minio/certs`, switch internal/public endpoints to
HTTPS, and use a certificate matching the MinIO hostname before exposing it outside the host.
PostgreSQL metadata and MinIO objects form one logical backup and must be captured at the same
application quiescence point:

```bash
docker compose exec -T postgres pg_dump -U aria -d aria -Fc > aria-postgres.dump
docker run --rm -v aria_minio_data:/source:ro -v "$PWD/backups:/backup" alpine \
  tar -C /source -czf /backup/aria-minio.tgz .
```

For restore, stop API/worker writes, restore PostgreSQL with `pg_restore --clean --if-exists`, restore
the MinIO volume archive, start PostgreSQL and MinIO, run `npm run prisma:migrate:deploy` in
`services/api`, then verify a sample checksum through a signed download URL before resuming jobs.

The full storage contract is in [`requirements/converter-module.md`](requirements/converter-module.md).

## API overview

**Create a song** (NestJS API):

```bash
curl -X POST http://localhost:8010/songs \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "A rainy night in the city, feeling hopeful",
    "mood": "chill",
    "genre": "r-and-b",
    "length": "medium",
    "vocal_style": "female"
  }'
```

**Stream live updates** (SSE — proxied by NestJS):

```bash
curl -N http://localhost:8010/songs/{project_id}/events
```

**Download assets**:

```bash
curl -O http://localhost:8010/songs/{project_id}/assets/instrumental
curl -O http://localhost:8010/songs/{project_id}/assets/mix
curl -O http://localhost:8010/songs/{project_id}/assets/midi
```

**Set the global producer prompt**:

```bash
curl -X PUT http://localhost:8010/settings/prompt \
  -H "Content-Type: application/json" \
  -d '{"global_prompt":"You are a songwriter who is very into pop and rap music."}'
```

**Upload an inspiring audio/video file**:

```bash
curl -X POST http://localhost:8010/songs \
  -F "media=@inspiration.mp3" \
  -F "idea=Write a new song inspired by this reference" \
  -F "media_purpose=mixture" \
  -F "mood=energetic" -F "genre=pop"
```

The multipart `media` field accepts MP3, WAV, FLAC, AAC/M4A, OGG/Opus, WMA, MP4/MOV, WebM/MKV, MPEG, and AVI when FFprobe confirms a supported audio stream. Set `media_purpose=voice` only for isolated speech, singing, or humming; omit it or use `mixture` for instrument recordings, mixes, and reference songs. Text-only requests may include optional `lyrics` alongside `idea`.

Accepted media is stored once under an opaque source artifact ID and SHA-256 checksum. Ingestion creates a 48 kHz/24-bit WAV working copy (stereo for mixtures, mono for isolated voice), plus a 44.1 kHz/16-bit mono compatibility WAV for the current Python generators. The response exposes repository-independent artifact references and an input manifest, never host filesystem paths. Unsupported, malformed, no-audio, silence-only, excessive-duration, oversized, and excessively clipped uploads return structured 4xx errors with a stable `code`.

The API contract is documented in [`services/api/openapi.yaml`](services/api/openapi.yaml).

### Ingestion configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `MEDIA_STORAGE_DIR` | `outputs` | Immutable source media, normalized audio, manifests, and settings |
| `MEDIA_TEMP_DIR` | `<MEDIA_STORAGE_DIR>/.tmp` | Bounded multipart staging area; keep it on the same filesystem for atomic moves |
| `MAX_UPLOAD_BYTES` | `262144000` | Maximum encoded upload size |
| `MAX_MEDIA_DURATION_SECONDS` | `1800` | Maximum decoded media duration |
| `MAX_MEDIA_STREAMS` | `16` | Maximum streams accepted from a container |
| `MEDIA_PROCESS_TIMEOUT_MS` | `120000` | Timeout for each FFmpeg/FFprobe process |
| `MEDIA_SILENCE_THRESHOLD_DB` | `-60` | Silence-only detection threshold |
| `MEDIA_CLIPPING_WARNING_DB` | `-0.1` | Peak level that adds a clipping warning |
| `MEDIA_MAX_CLIPPING_RATIO` | `0.01` | Estimated clipped-sample ratio that rejects an upload |
| `DATABASE_URL` | `postgresql://aria:aria@localhost:5432/aria` | Prisma PostgreSQL connection |
| `OBJECT_STORAGE_ENDPOINT` | `http://localhost:9000` | API-to-S3/MinIO endpoint |
| `OBJECT_STORAGE_PUBLIC_ENDPOINT` | `OBJECT_STORAGE_ENDPOINT` | Endpoint embedded in browser-facing signed URLs |
| `OBJECT_STORAGE_BUCKET` | `aria-artifacts` | Private immutable artifact bucket |
| `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | development credentials | S3-compatible credentials; replace outside local development |
| `OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS` | `900` | Signed URL lifetime; 60–3600 seconds |

For production, monitor storage capacity and ingestion rejection logs, alert on process timeouts, periodically verify that the temporary directory is empty, pin/test the deployed FFmpeg version, and replace the default no-op `UploadScanner` provider with the deployment's malware scanner.

## Local development (without Docker)

Run each Python service in its own terminal:

```bash
cd services/agent && pip install -e . && uvicorn agent.main:app --reload --port 8000
cd services/lyrics && pip install -e . && uvicorn lyrics.main:app --reload --port 8001
cd services/composition && pip install -e . && uvicorn composition.main:app --reload --port 8002
cd services/mixing && pip install -e . && uvicorn mixing.main:app --reload --port 8003
cd services/api && npm install && npm run prisma:migrate:deploy && npm test && npm run build && node dist/main.js
```

You also need Redis running locally (`redis-server` or Docker).

## Production upgrades

The scaffold uses template/MIDI fallbacks so the full pipeline runs without paid APIs. To reach production quality:

1. **Lyrics / Planning** — Connect `OPENAI_API_KEY` or any OpenAI-compatible endpoint
2. **Composition** — Replace MIDI generator with [MusicGen](https://github.com/facebookresearch/audiocraft), Stable Audio, Suno, or Udio
3. **Mixing** — Add `pyloudnorm` + `pedalboard` for pro-grade mastering
4. **Vocals** — Integrate a singing voice synthesis API (e.g. ACE Studio, Kits.ai)
5. **Storage** — Serve final audio via S3/Cloudflare R2 instead of local paths

## License

MIT
