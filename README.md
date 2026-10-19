# AmbedkarGPT

AI tools for Bahujan politics, at [ambedkargpt.in](https://www.ambedkargpt.in).

It has four parts:

- **Post generator.** A party worker picks a news story. AmbedkarGPT then writes a social media post about it in their party's voice, from their position in the party, in Hindi or English. The post is grounded in the source story and in the political commentary the system has indexed.
- **BhimBot.** A chat assistant that answers from Dr. B. R. Ambedkar's writings and speeches and from that commentary archive, and cites what it drew on.
- **Bhim Radio.** A daily Hindi news bulletin, *दैनिक मध्य भारत समाचार*, read by the anchor काजल जाटव. It plays on a public page with a headline ticker.
- **News pipeline.** It gathers the day's political news and turns it into the stories that the other three parts use.

## How it fits together

```
News sources ─────▶ watcher Lambda ──▶ Batch worker ──▶ MongoDB `news`
                    (every few min)    (collects, writes        │
                                        stories, RAG index)      │
                                                                 ▼
   React app (Vercel) ◀──── API Gateway ◀──── FastAPI on Lambda ─┤
   ambedkargpt.in                                                │
                                                                 ▼
   /bhimradio page ◀──── CloudFront ◀──── S3 `ambedkargpt-radio` ◀── bulletin build
```

| Part | Where it lives | Runs on |
|---|---|---|
| Web app | `frontend/` (React 19, Vite, Tailwind 4, React Router 7) | Vercel, deployed from `main` |
| API | `backend/` (FastAPI, served by Mangum) | AWS Lambda behind API Gateway (`ap-south-1`) |
| Ingest and RAG rebuild | `backend/worker/`, `backend/pipeline/` | Watcher Lambda and AWS Batch (Fargate) |
| BhimBot's book corpus | `backend/semrag/` | Memgraph (graph) plus page citations in `backend/semrag/data/` |
| Radio | `backend/worker/build_radio.py`, `docs/bheem-radio.md` | Built on the Bheem Radio engine; audio on S3 behind CloudFront |

Data lives in MongoDB: users, sessions, news, posts, preference answers and streaks. See [`backend/DATABASE_DESIGN.md`](backend/DATABASE_DESIGN.md).

Models:
- DeepSeek writes the posts, BhimBot's answers and the radio scripts. OpenAI and Gemini are fallbacks.
- Gemini makes the embeddings, which are stored in Pinecone.
- Sarvam provides the radio voice.

## Running it locally

You need Python 3.11 or newer, Node 20 or newer, and a MongoDB you can reach (Atlas is fine).

### API

```bash
python -m venv backend/.venv
backend/.venv/Scripts/activate          # Windows; on macOS/Linux: source backend/.venv/bin/activate
pip install -r backend/requirements-api.txt
cp backend/.env.example backend/.env    # then fill it in
uvicorn backend.main:app --reload --port 8000
```

Run it from the repository root: the code imports itself as `backend.…`. The API is then at `http://localhost:8000/api/v1`, and the interactive docs are at `/docs`.

`backend/.env.example` lists every setting, with a comment for each. You need these to get going:
- `MONGODB_URI`, `MONGODB_DATABASE` and `JWT_SECRET`
- `DEEPSEEK_API_KEY`, for posts and BhimBot
- `GEMINI_API_KEY` and `PINECONE_API_KEY`, for retrieval
- `MEMGRAPH_URI`, `MEMGRAPH_USERNAME` and `MEMGRAPH_PASSWORD`. Without them, BhimBot answers from the commentary archive only and shows no book-page citations.

### Web app

```bash
cd frontend
npm ci
cp .env.example .env                    # VITE_API_URL=http://localhost:8000/api/v1
npm run dev                             # http://localhost:5173
```

### Tests

```bash
python -m pytest backend/tests          # from the repository root
cd frontend && npm run build            # what CI checks for the frontend
cd frontend && npx playwright test      # browser tests; start `npm run dev` first
```

## Repository layout

```
backend/
  api/v1/        HTTP routes: auth, news, posts, questions, profile, chat, contact, integrations
  services/      the logic behind the routes (post generation, auth, news)
  repositories/  MongoDB access, one module per collection
  pipeline/      retrieval, generation, fact-checking, research
  prompts/       the system and user prompts for every model call
  semrag/        BhimBot's Ambedkar corpus: graph retrieval, citations, page links
  worker/        ingest, RAG rebuild, radio build, and the Lambdas that start them
  tests/         pytest
frontend/
  src/pages/     one file per screen (dashboard, generator, BhimBot, radio, auth…)
  src/components/
  src/i18n/      Hindi and English strings (hi.js, en.js)
  e2e/           Playwright tests
deploy/          self-hosted server setup (nginx, systemd, gunicorn) and SearXNG
backend/deploy/  radio infrastructure scripts (CloudFront, IAM, upload)
docs/            longer write-ups, starting with docs/bheem-radio.md
.github/workflows/
```

## Deployment

All production deploys come from `main`. Work happens on the `deploy` branch and reaches `main` through a pull request.

| Workflow | When it runs | What it does |
|---|---|---|
| `ci.yml` | pull requests and pushes to `main` | backend tests and the frontend build |
| `deploy-lambda.yml` | push to `main` | tests, builds the API image, pushes it to ECR and updates the Lambda |
| `deploy-worker.yml` | push to `main` | builds the worker image and registers a new Batch job definition |
| `rebuild.yml` | every 2 days, or by hand | rebuilds the RAG index on Batch |
| `deploy-radio.yml` | changes to the radio build | builds the radio image and its Batch job definition |

Vercel builds the frontend from `main` on its own.

GitHub Actions signs in to AWS through OIDC (`AWS_ROLE_ARN`). The role's trust policy names this repository, so renaming the repository means updating that policy first.

Secrets used in production are kept in SSM Parameter Store under `/ambedkargpt/prod/`, not in the repository.

## Status

- **Live:** the post generator with party, position and preference onboarding; BhimBot; the public radio page.
- **Radio bulletins are still built and uploaded by hand.** The scheduled build exists in AWS but is switched off. It needs read access to the Bheem Radio engine repository and the current bulletin format moved into `backend/worker/`. See `docs/bheem-radio.md`.
- **Book-page citations in BhimBot** need the Memgraph settings on the API Lambda.
