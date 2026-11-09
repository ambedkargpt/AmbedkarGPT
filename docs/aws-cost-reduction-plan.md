# AWS cost spike: diagnosis and plan

Written for: whoever deploys and operates the AWS stack. Branch: `cost/reduce-aws-spend`.

## Summary

The spike is in **ECS / Fargate** CPU and memory. AWS Batch runs our jobs as Fargate tasks, which is why they show up as ECS in the console and the bill. Nothing in the API Lambda changed in a way that costs more.

Two jobs started running far more often in early November:

| Job | Size per run | What changed | Effect |
|---|---|---|---|
| `ambedkargpt-worker` (YouTube → news pipeline, started by the `ambedkargpt-watch` Lambda) | **4 vCPU, 16 GB** | 4 channels added on 4 and 8 Nov (`bjp_mp`, `bjp_up`, `congress_mp`, `congress_up`), so 9 channels / ~16 feeds are checked every 10 minutes | Party channels post all day, so almost every 10-minute tick finds something new and starts a job. A container of this size runs most of the day. |
| `ambedkargpt-radio` (Bhim Radio bulletin) | 1 vCPU, 2 GB | 2 Nov: every channel's last 48 hours are kept; more channels feed it | The bulletin is fully rebuilt (LLM regrouping and a re-mix of up to an hour of audio) whenever the set of stories changes: on every new story *and* every story turning 48 hours old. |

The worker job's size is the biggest lever. The 4 vCPU / 16 GB size was chosen for `auto_rebuild`, the RAG rebuild. The watcher reuses that job definition and only overrides the command, so the news pipeline (`run_channels`) gets the same size. It doesn't need it: `run_channels` downloads transcripts and waits on LLM APIs, and loads no RAG data or ML model (see `backend/worker/run_channels.py`, `backend/pipeline/orchestration/stages.py`).

## Confirm it from the bill first (10 minutes, CloudShell)

These are read-only.

**1. Which service grew.** Billing → Cost Explorer → last 30 days, daily, **Group by: Usage type**. Look for `APS3-Fargate-vCPU-Hours:perCPU` and `APS3-Fargate-GB-Hours` jumping around 4–8 Nov.

**2. How many worker jobs per day, and for how long.**

```bash
for s in SUCCEEDED FAILED; do
  aws batch list-jobs --job-queue ambedkargpt-worker-queue --job-status $s \
    --query 'jobSummaryList[].[jobName, createdAt, startedAt, stoppedAt]' --output text
done | awk '{d=strftime("%Y-%m-%d",$2/1000); n[d]++; if ($4>0) m[d]+=($4-$3)/60000} END {for (k in n) printf "%s  jobs=%d  minutes=%.0f\n", k, n[k], m[k]}' | sort
```

Hours per day × ~$0.27 is roughly the worker's daily Fargate cost at 4 vCPU / 16 GB in ap-south-1 (check the current Fargate prices for ap-south-1).

**3. Same for the radio.** Use the queue the `ambedkargpt-radio` schedule targets, then check how often it fires:

```bash
aws scheduler list-schedules --query 'Schedules[].[Name, State]' --output table
aws scheduler get-schedule --name ambedkargpt-radio-general --query 'ScheduleExpression'
```

If step 2 shows tens of worker jobs per day since early November, that confirms the diagnosis.

## What the branch changes

Surgical: 3 files, 12 existing lines changed, the rest added, with tests (253 backend tests pass). Every new behaviour can be undone with a setting, without a redeploy.

### 1. The pipeline job gets a right-sized container (`backend/worker/watch_handler.py`)

The watcher now sends its own size with each job: **1 vCPU / 4 GB** instead of 4 vCPU / 16 GB. That's about **4× cheaper per minute**. `auto_rebuild` and the RAG rebuild keep the definition's full size.

| Setting on the `ambedkargpt-watch` Lambda | Default | Meaning |
|---|---|---|
| `WATCH_JOB_VCPU` | `1` | vCPU for each pipeline job |
| `WATCH_JOB_MEMORY_MB` | `4096` | memory for each pipeline job |

A size Fargate wouldn't accept (e.g. 1 vCPU with 16 GB) is ignored, and the job uses the definition's size, so a typo can't stop the news.

### 2. Pipeline jobs are spaced out (`backend/worker/watch_handler.py`)

The watcher won't start a job within **30 minutes** of the last one. Videos that arrive in between are picked up by the next job together, so there are fewer starts, and each start no longer pays again for pulling the image and the channel state. Videos waiting this way are not charged a retry attempt.

| Setting on the `ambedkargpt-watch` Lambda | Default | Meaning |
|---|---|---|
| `WATCH_MIN_GAP_MINUTES` | `30` | minimum minutes between pipeline jobs; `0` = old behaviour |

**Trade-off:** a new video can take up to ~30 minutes longer to become a story.

### 3. The radio rebuilds less often (`backend/worker/radio_live/build.py`)

- A **new story** rebuilds the bulletin once the bulletin on air is **30 minutes** old. Before, every change rebuilt at once.
- Stories that only **aged out** of the 48-hour window rebuild after **6 hours**. Before, they rebuilt at once.
- A new day still rebuilds at once, because the intro says the date. `--force` still forces a rebuild.

| Setting on the `ambedkargpt-radio` job definition | Default | Meaning |
|---|---|---|
| `RADIO_MIN_REBUILD_MINUTES` | `30` | `0` = rebuild on every new story |
| `RADIO_DROP_ONLY_HOURS` | `6` | `0` = rebuild on every story that ages out |

**Trade-off:** the newest story may lead the bulletin up to ~30 minutes later.

## Deploying it

1. Open a PR from `cost/reduce-aws-spend` to `main` and merge it. **Deploy Lambda** updates the watcher, which runs from the API image. **Deploy Radio** rebuilds the radio image, because `radio_live/**` changed.
2. Nothing else is required: the defaults above apply.
3. **Watch the first few worker jobs** (CloudWatch → `/aws/batch/job`, streams `ambedkargpt-worker/...`):
   - Healthy: the run ends with `=== done: N channel(s), M story(ies) published ===`.
   - Out of memory shows as the job **FAILED** with `OutOfMemoryError` / exit code 137 in the Batch console. If that happens, set `WATCH_JOB_MEMORY_MB=8192` on the watcher Lambda (1 vCPU allows up to 8 GB). No redeploy is needed.
4. After 2–3 days, repeat the checks above. Expect worker Fargate hours to fall by roughly 4× (size) times the drop in job count (spacing).

### Undo

Set these on the `ambedkargpt-watch` Lambda:
```
WATCH_JOB_VCPU=4
WATCH_JOB_MEMORY_MB=16384
WATCH_MIN_GAP_MINUTES=0
```
And on the radio job definition:
```
RADIO_MIN_REBUILD_MINUTES=0
RADIO_DROP_ONLY_HOURS=0
```
That is exactly the old behaviour. Reverting the PR also works.

## Console-only savings (no code)

In order of value:

1. **Fargate Spot for the worker queue.** Add a `FARGATE_SPOT` compute environment to `ambedkargpt-worker-queue`, first in order. It's about 70% cheaper. `run_channels` is safe to interrupt: it saves channel state in a `finally`, and the next job continues.
2. **An AWS Budget** with an email alert at, say, 120% of the normal monthly spend, so the next spike is seen in days, not weeks. The first two budgets are free.
3. **ECR lifecycle rules.** Every push to `main` pushes a new multi-GB worker image and an API image, and nothing deletes old ones. Add a rule to `ambedkargpt-worker`, `ambedkargpt-api` and `ambedkargpt-radio` to keep the last 10 images. ECR storage is billed per GB-month, and this grows with every deploy.
4. **The radio schedule rate.** Check `ambedkargpt-radio-general` in EventBridge Scheduler. If it's under 10 minutes, `rate(15 minutes)` is plenty now that rebuilds wait 30 minutes anyway.
5. **CloudWatch log retention.** Set `/aws/batch/job` and `/aws/lambda/*` to 14–30 days if they are on "Never expire".
6. **An S3 lifecycle rule for old radio MP3s** in `ambedkargpt-radio` (already on the open list).

## Ruled out

- **The API Lambda and the error monitor (PR #71):** the monitor does nothing unless `ERROR_TRACKING_ENABLED` or `GRAFANA_LOKI_*` is set on the Lambda. Even when on, it adds no measurable time to normal requests and runs no containers. Lambda is also billed separately from ECS/Fargate.
- **The YouTube feed retry (`youtube_feed.py`, Nov):** one extra HTTP request when YouTube errors, inside the watcher Lambda. Negligible.
- **The RAG rebuild (`rebuild.yml` / `auto_rebuild`):** unchanged; it runs every 2 days.
