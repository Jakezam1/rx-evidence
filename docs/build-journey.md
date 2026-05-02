# RxEvidence — Build Journey

Comprehensive readout of the architectural and product decisions made while building **RxEvidence**, an AI application that breaks down randomized controlled trial (RCT) PDFs from a clinical pharmacist's perspective, with explicit traceability to source passages.

**Tone**: honest, raw, neutral-voice. Includes the wins, the dead ends, the bugs, and the decisions to *not* build certain things.

**Audience**: dual — clinical/healthcare folks (the target users) and engineering/product folks (peers learning to build LLM applications). Chunks are designed to be mineable for individual posts.

---

## 1. Origin and Problem Framing

### Who built it

A practicing clinical pharmacist with no prior software engineering background, building a portfolio project to demonstrate AI fluency in healthcare workflows. The build was done in pair with an AI coding agent (Claude in the Cursor IDE) — the pharmacist drove product decisions, clinical framing, and design taste; the agent drove implementation, debugging, and technical proposals.

### The thesis

Healthcare adoption of AI lags other industries primarily because of one fear: **hallucination in workflows where patient impact is real**. A clinician reading an AI-generated trial summary cannot trust conclusions without seeing the underlying evidence. Existing AI tools generate confident prose that buries (or fabricates) the source. The trust problem is the adoption problem.

RxEvidence is a deliberate response to this. It does something difficult — parse a 12-page RCT PDF and produce a structured clinical breakdown — and it makes the AI's work auditable by attaching every finding to the section of the paper that supports it.

### The product

Single-paper analysis. The user uploads a digital trial PDF. The system extracts structured findings across four lenses (Findings, PICO, Risk & Limitations, Summary), each with:

- A category-coded card (primary outcome, secondary outcome, safety, bias, etc.)
- Statistical claims in a normalized grid (HR, CI 95%, p-value, ARR, NNT, absolute events)
- A confidence rating (high / moderate / low)
- A source location pill showing which section the finding was extracted from
- An expandable view of the verbatim source passages
- A reviewer footer where a pharmacist can approve, flag, or annotate the finding

The product is built around the assumption that the human is the final reviewer. Every UI choice optimizes for "does this make the reviewer's job easier or harder?"

---

## 2. The Pivot Decision: Rebuild, Not Patch

The starting point was a non-functional legacy Replit prototype with the right tab structure but broken core functionality. The first real decision was whether to fix it or rebuild from scratch.

The rebuild won, for these reasons:

1. The legacy code had brittle exact-text highlighting on the PDF — fragile and ultimately the wrong product choice (paraphrased findings with source-passage anchors is a better trust model than verbatim highlighting).
2. The pharmacist was not technical enough to debug it; the agent could not navigate enough unknown legacy code efficiently.
3. Starting clean meant deliberate component choices instead of inherited ones.
4. The tab structure (Findings / PICO / RoB 2.0 / Summary) was the only piece worth preserving — easy to recreate.

**Lesson**: the cost of fixing unfamiliar broken code is often higher than rebuilding deliberately. The framing question was not "how long to fix this?" — it was "do we even want what's here once it works?"

---

## 3. The Stack — Decisions and Trade-offs

### Backend: Python + FastAPI

Chosen because the PDF processing and LLM ecosystems are Python-native. PyMuPDF and pdfplumber are mature; the Gemini, Anthropic, and OpenAI SDKs are all first-class in Python. FastAPI was picked over Flask for native async, Pydantic-based schema validation (critical for an LLM application), and type-friendly request/response models.

Rejected alternatives:
- **TypeScript backend (Node/Express)** — would have unified language with the frontend, but PDF tooling is weaker and Pydantic has no real equivalent for runtime schema validation at the LLM boundary.

### Frontend: Next.js (React) + TypeScript

Chosen for the SSR-friendly tab structure inherited from the legacy product, the maturity of the ecosystem, and Tailwind CSS for fast iteration on a design system. TypeScript was non-negotiable for a project where the data shapes are central — every finding has a strict type contract from API to UI.

### LLM: Gemini 2.5 Flash

Chosen for two reasons:
- **Large context window** — enables passing entire trial sections without aggressive chunking
- **Low cost per token** — important because the per-paper cost on a higher-tier model would have made experimentation expensive

The free tier hit 429 (rate limit) errors immediately during development. Upgrading to paid Gemini was a forced early decision and unlocked reliable throughput. The free tier is not suitable for application development; the paid tier is inexpensive enough that the cost-vs-friction trade-off was obvious.

**Tested alternatives**:
- Gemini 2.5 Pro — better output quality but slower (~3x latency on typical sections) and meaningfully more expensive. Chose Flash for the demo's iteration speed.
- Claude (Anthropic) — supported via the abstraction layer but not the default for portfolio cost reasons.
- GPT-4o-mini — also supported.

The system was built provider-agnostic from early on (see §5), so swapping is a configuration change, not a code change.

### Database: SQLite (with a Postgres-ready ORM)

Chosen for V1 simplicity. SQLAlchemy ORM with SQLite as the dev driver. The choice was explicitly framed as "single-file local DB until traffic justifies otherwise." Postgres migration is trivial — change `DATABASE_URL`, run migrations. SQLite was a deliberate "don't pre-optimize" call.

### PDF Storage: Local disk cache

PDFs are persisted to `pdf_cache/` on disk as the analysis runs. This was added after a specific bug: when the backend restarted (e.g., during development hot-reload), retry-missing operations would fail because the in-memory PDF buffer was gone. Disk-backing made retries idempotent across restarts and is the right primitive for the eventual cloud volume / object storage migration.

---

## 4. Data Model

### `Finding` is the unit of clinical claim

Each finding has:
- `id`, `category`, `title`, `summary` — the descriptive shell
- `clinicalImplication` — one sentence on what this means for practice
- `statistics` — structured map of HR, CI95, pValue, ARR, NNT, etc.
- `confidenceLevel` — high / moderate / low
- `confidenceRationale` — why the AI assigned that confidence
- `evidenceStrengthScore` — derived signal (anchor match quality)
- `sourcePassages[]` — array of verbatim passages with section name and page hint
- `isCompositeEndpoint` + `compositeComponents[]` — flag for composite outcomes
- `reviewStatus` + `reviewNote` — pharmacist-facing audit fields

The schema is enforced with Pydantic at the LLM boundary. Any LLM response that fails validation is logged as an observability event and dropped, rather than allowed to corrupt the database. This was a hard architectural commitment: **the schema is the contract, not a suggestion**.

### The six required statistical slots

For findings in three categories (`primary_outcome`, `secondary_outcome`, `safety`), six statistical slots are *required* in the prompt and explicitly tracked:

- **HR** — Hazard Ratio
- **CI95** — 95% Confidence Interval
- **pValue** — p-value
- **ARR** — Absolute Risk Reduction
- **NNT** — Number Needed to Treat
- **absoluteEvents** — Event counts in each arm

If the paper doesn't report one, the model is instructed to return `null` — not omit the field, not guess. The UI then displays "Not reported" in a dashed-style placeholder, making gaps visible at a glance. The other slots (RR, OR, NNH, RRR) appear inline as chips only if reported.

This is one of the load-bearing design decisions for clinical trust: a finding with no statistical detail looks visually different from one with full detail, and a pharmacist can scan a card in seconds to decide whether to read deeper.

---

## 5. The LLM Provider Abstraction

Built early after Gemini went down for an extended period during a demo session. The abstraction lives at `app/services/llm/` and exposes:

```
generate_json(prompt, model) -> (parsed_json, usage_metadata)
get_provider() -> "gemini" | "anthropic" | "openai"
get_model() -> str
```

Each provider has its own adapter; selection is via `LLM_PROVIDER` env var. The retry/backoff logic is centralized in `retry.py` and shared across providers — `with_retry(call_fn, label="llm")` wraps any call and handles transient errors (HTTP 408, 429, 500, 502, 503, 504, 529).

The retry budget: **6 attempts with exponential backoff capped at 30 seconds**, plus a `0–0.5s` jitter. Total worst-case retry budget per call is ~61 seconds.

This was tuned during a Gemini 503 outage that broke an analysis mid-run. The previous configuration (4 attempts, ~15s total) was too conservative for extended platform incidents.

---

## 6. Prompt Engineering — The V1 → V2 Pivot

### V1 — what went wrong

The initial prompt was loose: a paragraph describing the role and asking for an array of structured findings. Gemini returned valid JSON but the findings were surface-level — "primary outcome was reduced," "drug X improved outcomes." A pharmacist scanning these would learn nothing they couldn't get from the abstract.

### V2 — structural rigor

The V2 prompt (`docs/prompts/gemini_findings_v2.md`) treats the model as a structured extractor with **non-negotiable contracts**:

1. **Required statistical slots by category** — for `primary_outcome`, `secondary_outcome`, and `safety` findings, six slots (HR, CI95, p-value, ARR, NNT, absolute events) must appear in the response. If not in the paper, the value is explicitly `null`. The prompt does not let the model omit them.

2. **Composite endpoint flagging** — the model must set `isCompositeEndpoint: true` and enumerate `compositeComponents` for any composite outcome. Composite endpoints are a known source of clinical mis-interpretation; surfacing them is a core product behavior.

3. **Source passage prioritization** — when more than 3 source passages exist, the model is told to prioritize by *evidentiary weight*: passages with numerical anchors and confidence intervals beat verbatim narrative. Contextual filler is dropped first. The schema enforces `max_length=3`.

4. **Confidence rationale** — the model must articulate *why* it assigned a confidence level, not just label it. This becomes part of the "Findings to Review" surface later.

The shift from V1 to V2 was the highest-leverage prompt change of the entire build. Output quality went from "vague clinical commentary" to "structured clinical assessment a pharmacist could quote in a journal club."

---

## 7. The Analysis Pipeline

### Per-section, not whole-paper

The PDF is split into named sections (Abstract, Methods, Results, Discussion, etc.) and the findings prompt is run *per section*. This keeps each call's context manageable on Flash, gives the AI a clear "what to look for" frame, and produces section-tagged findings that can be sorted into the right cards.

Per-section caps:
- **Results section**: 6 findings (the densest clinical content)
- **All other sections**: 3 findings

Global cap (post-aggregation): **16 findings per paper**.

### Findings-cap journey

This number was tuned through several iterations:

- **12 (original)** — too restrictive; safety findings got squeezed out by primary/secondary outcomes
- **20** — too noisy; the model generated filler to fill the slots
- **12 (back)** — same problem as the first time
- **16 (current)** — sweet spot where genuinely different findings get room without forcing the model to invent

The takeaway: caps shape model behavior. A higher cap is not "more information for the user" — it's "permission for the model to pad."

### Parallel execution

Section analysis runs in a `ThreadPoolExecutor` with `MAX_PARALLEL_WORKERS=3`. The default was originally 4 but was reduced after observing burst-induced 503 spikes from Gemini. Lower concurrency = more reliable throughput in practice. Sequential fallback is available via `PARALLEL_SECTIONS=false` for debugging.

### Auto-recovery pass

If any section call exhausts its retry budget, the section is queued for a sequential second pass after the main parallel phase completes. Each recovery call gets the *full* retry budget again, with a 2-second spacer between attempts. This salvages most transient-outage failures without losing the speed benefit of parallel execution on healthy runs.

### The dedupe pass — the most subtle piece

After all section calls (plus auto-recovery) complete, a dedupe pass runs over the aggregated candidate findings before the global cap is applied. This was added late in the build after the demo paper produced 16 findings, *several of which were duplicates of the same outcome*.

The dedupe has three layers:

1. **Stub drop** — any finding in a required-stats category (primary outcome, secondary outcome, safety) with zero of the six required slots populated is dropped. These are descriptive findings the model produced as filler (e.g., "Composite primary outcome defined") that add no clinical value.

2. **Title-similarity clustering** — remaining findings are grouped by Jaccard similarity on normalized title tokens (stopwords removed, case-folded). Threshold: **0.6**. Only findings of the same category can cluster. Within a cluster, the variant with the most populated required slots wins (tiebreak: longer summary, more source passages).

3. **Statistics fingerprint clustering** — for findings that survive step 2, a second pass clusters by exact match on normalized `(HR, CI95, p-value)`. This catches semantically-equivalent findings the model worded differently (e.g., "LCZ696 reduces primary outcome" and "LCZ696 reduces composite endpoint" — same numbers, different titles).

The threshold of 0.6 was chosen carefully. At **0.5**, a dry-run on the PARADIGM-HF demo paper *incorrectly* clustered "LCZ696 reduces all-cause mortality" with "LCZ696 reduces CV mortality" (Jaccard score 3/6 = 0.5 exactly). These are clinically distinct secondary outcomes. Catching that false positive in dry-run mode and re-tuning was a critical near-miss; applying it would have silently merged a meaningful clinical distinction.

**Lesson**: every clustering threshold is a clinical decision. The default value matters less than the verification step.

The stats fingerprint also required normalization beyond what was obvious: the same CI could appear as `0.73 to 0.87` or `0.73–0.87` (en-dash) or `0.73-0.87` (hyphen). All three had to normalize to the same canonical form. The first regex attempt stripped the en-dash entirely, producing `0.730.87` — non-matching strings for an obviously identical CI. The bug was caught by visual inspection of dry-run output, not by automated tests.

On the PARADIGM-HF demo, dedupe took 16 findings → 9 unique findings (4 stubs dropped, 3 duplicates merged), with zero false positives.

The dedupe pass runs **after** the parallel/recovery phases but **before** the global cap, so genuine findings aren't dropped to make room for duplicates.

---

## 8. The "Findings to Review" Surface — Two Major UX Pivots

### Pivot 1: Killing the Observability Drawer

The build started with a dedicated observability drawer (right-side panel triggered by an activity icon in the header) showing pipeline metrics, confidence distribution, and event log. It was functional but the framing was wrong.

The pharmacist eventually articulated the problem: the drawer was conflating **"is the AI doing a good job?"** with **"is this paper trustworthy?"** Those are two different reader questions, and burying both behind one icon was the wrong UX.

The fix:
- Drawer deleted entirely
- **Analysis confidence** (counts, evidence-linked %, high/moderate/low distribution) moved to the top of the Summary tab — this is the AI-quality signal
- **Findings to Review** moved to the second position in the Summary tab — this is the paper-quality signal
- Pipeline events (LLM retries, sparse sections) appear as a "Pipeline note" type within Findings to Review, alongside paper-level concerns

The reframe from a hidden drawer to an integrated top-of-Summary block was the right product call. Trust signals belong in the reader's primary scan path, not behind a button.

### Pivot 2: From "Sparse Statistics" to "Not Statistically Significant"

The first version of the review surface had a flag called "Sparse statistics" for any finding with fewer than 2 of the 6 required stat slots reported. This flag fired on a finding where the AI had only extracted a p-value but missed the HR and CI — even though the *paper* contained both.

The pharmacist correctly identified this as a trust-undermining behavior: the flag made the AI look like it was making a claim about the paper ("this finding lacks statistical detail") when really it was a claim about the AI's own extraction ("we couldn't find this"). The two are not the same. Surfacing AI extraction limits as if they were paper limits is exactly the kind of mistake that erodes clinical trust.

The replacement:

- **Not statistically significant** — fires only when the AI has extracted unambiguous evidence of non-significance: either `p ≥ 0.05` (parsed from strings like `<0.001`, `0.04`, `0.45`, `NS`, `not significant`) **or** a CI 95% that cleanly straddles 1.0 (parsed from any range format).
- **Conflicting stats** — fires when the AI extracted `p < 0.05` *and* a CI that crosses 1.0. This is a meaningful internal contradiction worth a human review. (Initially this case was silent; the pharmacist pushed back that conflicts should be surfaced, not buried.)

The principle: **never make a claim the AI didn't earn.** Silence is better than a false claim about the paper.

### The unified "Findings to Review" section

The final surface (yellow caution treatment, in the Summary tab, second from top) includes seven types of items, each with a type badge:

- **Sponsorship** — any `bias` category finding
- **Composite endpoint** — `isCompositeEndpoint = true`
- **Conflicting stats** — `p < 0.05` AND CI crosses 1.0
- **Not significant** — `p ≥ 0.05` OR CI cleanly crosses 1.0
- **Low confidence** — AI rated `confidenceLevel = "low"`
- **Reviewer flagged** — pharmacist marked for follow-up
- **Pipeline note** — observability warn/error events

Sort order: paper-level concerns first (sponsorship, composite, stat issues), then AI-quality concerns (low confidence, reviewer flags), then pipeline notes. This puts the highest-signal items first.

---

## 9. UX Architecture

### Landing → Workspace split

The app has two distinct top-level views:

- **Landing screen** — branded entry point with "Try the demo" and "Analyze a paper" CTAs
- **Workspace** — the analysis surface with PDF pane, tabs pane, and header chrome

This separation was deliberate. A landing screen lets first-time visitors evaluate the product before being thrown into a complex multi-tab workspace.

### Resizable PDF/tabs split

The workspace uses `react-resizable-panels` (pinned to v2 — see §11 for the bug story) for a horizontal split between the PDF pane (left, default 60%) and the tabs pane (right, default 40%). The user can drag the divider; both sides have a 25% minimum. This was added because the PDF pane is reference material — sometimes you want it wide for reading, sometimes narrow to focus on the tabs.

### Color palette

Two palettes were mocked: a "Replit Faithful" navy-and-slate option and a "Clinical Modern" teal-and-stone option. The clinical modern palette was chosen for its cooler, more medical-feeling tone. The palette is stored as CSS variables on the root element under `data-palette="a"` vs `data-palette="b"` so a future palette toggle is one attribute swap.

### Font

Inter, via `next/font/google`, replaced an initial localFont (Geist) after the pharmacist requested something "closer to Arial." Inter renders cleanly at small sizes (the stat grid runs at 11px) and is a standard choice for data-dense UIs.

### Design system primitives

Two small components anchor the visual consistency:

- **`SectionCard`** — white card on gray background, 1px subtle border, uppercase muted label above the body. Used in PICO, Risk & Limitations, Summary tabs and the Confidence Coverage / Findings to Review blocks.
- **`FindingCard`** — the dense per-finding artifact with category pill, confidence pill, title, source location pill, summary, 3×2 stat grid, clinical implication callout, expandable source passages, expandable "more detail," and reviewer footer.

The pattern: a small set of well-shaped primitives, used everywhere, with no inline ad-hoc styling. Cards are consistent because they're the *same component*.

### Finding card details worth calling out

- **Color-coded category pills** — teal (primary), indigo (secondary), rose (safety), amber (bias), violet (generalizability), stone (methods/population), neutral (context). A pharmacist scanning a long list can tell at a glance what categories are over- or under-represented.
- **Source location pill** — white background, gray border, location pin icon, format `Results · p.4`. Subtle but high-signal: every finding answers "where did this come from?" without expanding the source passages.
- **Stat grid** — 3×2 grid showing HR, CI 95%, p-value, ARR, NNT, Events. Reported values render in solid styling; unreported slots show "Not reported" in dashed-italic placeholder. The visual contrast makes gaps visible.
- **Clinical implication callout** — thin gray-outlined white box (intentionally subtle, not a colored callout — the goal was clean contrast against the gray card pane, not visual loudness).
- **Collapsible source passages and detail** — both collapsed by default for a clean scan. The reader expands only the parts they want to drill into.
- **Reviewer state visual** — colored left border on the card (green = approved, red = flagged) so review state is scannable from the list without opening the card. Approve / Flag / Reset buttons + always-visible compact note textarea.

---

## 10. Progress Feedback — From Engineer-y to Clinical

The first progress bar was raw event-count based: "Step 5" on the right, the last event message on the left, percent from `Math.min(eventCount / 9, 0.9)`. Functional but technical.

The redesign exposed seven discrete pipeline stages with weighted percent allocations:

1. **Reading paper** (0–10%)
2. **Analyzing findings** (10–60%) — the longest stage, with substep showing `Completed 3 of 5 sections — Methods`
3. **Extracting PICO** (60–78%)
4. **Assessing risk of bias** (78–86%)
5. **Building clinical summary** (86–93%)
6. **Cleaning up duplicates** (93–97%) — shows `Removed N near-duplicate findings`
7. **Analysis complete** (100%)

The right side of the row shows `Stage 2 of 6` instead of `Step 5`. A yellow caution icon appears next to the stage label if any warnings occurred during the run.

Implementation: the backend emits explicit `pipeline_stage` observability events at each transition (6 lightweight `_log` calls). The frontend `progress.ts` parses the most recent stage event to determine the active stage, then refines the percent based on substep events (e.g., section completion ratio during the findings stage).

This redesign reframed the wait from "the AI is doing 9 mysterious steps" to "the AI is working through a 6-step clinical checklist." Same total wait time, very different perception.

### A rejected idea worth documenting

The pharmacist suggested streaming findings into the Findings tab as they were extracted, to reduce perceived wait time. The agent pushed back:

- Dedupe runs at the *end* of the pipeline, removing stub and duplicate findings
- Streaming would mean the user sees findings appear, then watches them disappear — *exactly* the visual signature of hallucination
- The product thesis is "the AI doesn't make claims it later walks back"
- Better alternative: progressively render PICO, Risk, and Summary tabs as those single-shot stages complete (no dedupe risk)

The pharmacist accepted the trade-off and the streaming idea was shelved. Wait time stays the same; the product's trust narrative stays intact.

---

## 11. The Bugs — A Catalog

Honest engineering posts work best when the failure modes are visible. These are the real bugs encountered during the build, in roughly chronological order.

### 11.1 Gemini 503 outages

Frequent during one development session, manifesting as the analysis returning sparse or empty findings. Initial retry config (4 attempts, ~15s total budget) was insufficient. Fix: bumped to 6 attempts with 30s max backoff, plus the auto-recovery pass that re-runs failed sections sequentially.

### 11.2 Free tier 429 cascade

Free-tier Gemini hit rate limits within minutes of normal development. Forced an early decision to upgrade to paid Gemini — which turned out to be inexpensive and dramatically more reliable.

### 11.3 The API key rotation panic

The Gemini API key was accidentally exposed in plaintext. Google auto-revoked it. The fix path had three layers of failure:

1. Rotated key was placed in `rx-evidence/.env` (root) — but the backend reads from `rx-evidence/api/.env`. Wrong location, silently used the old (now-revoked) key.
2. After moving the key to the right file, it was pasted under `ANTHROPIC_API_KEY=` instead of `GEMINI_API_KEY=`. Wrong variable name, silently failed.
3. After fixing both, the backend *still* returned "API key expired" — because an old `export GEMINI_API_KEY=...` in the developer's shell was overriding the `.env` file via Python's `os.getenv`.

The final fix was a one-line change: `load_dotenv(override=True)` in `app/main.py`, so the `.env` file wins over shell exports. The full incident was over an hour of "the key is right, why isn't it working" debugging.

**Lessons**: secrets layering matters; `.env` precedence isn't obvious; "the file is correct" doesn't mean "the process is reading the file."

### 11.4 Pydantic validation dropping entire findings

Some Gemini responses returned 4+ source passages for a single finding. The schema enforced `max_length=3`. Pydantic strict validation rejected the entire finding rather than just truncating. Result: a high-quality finding got silently dropped because of one over-quota field.

Fix: a pre-validation normalization step (`_normalize_finding_payload`) that truncates source passages to the top 3 using a priority scoring (numerical anchors > verbatim with CI > contextual narrative). The schema cap is still enforced; we just don't lose the finding to it.

### 11.5 Nested LLM responses on PICO and Risk tabs

The "Risk & Limitations" tab was empty in the UI for an entire session. Cause: Gemini occasionally returned nested objects (`{"internalValidity": {"strengths": [...], "weaknesses": [...]}}`) where the backend persistence expected flat strings. The nested dict didn't fit the column type and was silently coerced or dropped.

Fix: two helpers — `_unwrap_envelope` strips common LLM single-key wrappers (`{"riskAndLimitations": {...}}` → `{...}`), and `_flatten_field` collapses nested dicts/lists into a single readable paragraph. Both are applied before persistence.

This is a generic problem with LLM applications: model outputs occasionally drift from the requested shape. The right fix is normalization at the persistence boundary, not stricter prompting.

### 11.6 The EMFILE silent failure (the worst bug)

After several rounds of UI changes, the user reported that nothing was updating — they'd hard-refreshed, killed the browser cache, restarted the dev server, and still saw the previous version after clicking into the workspace.

The cause was *not* obvious. The dev server appeared to be running fine (HTTP 200 responses, normal `Compiled in Xms` logs). But buried in the terminal output were dozens of:

```
Watchpack Error (watcher): Error: EMFILE: too many open files, watch
```

The macOS file watcher had hit OS limits. Next.js's hot-module-reload silently stopped detecting file changes — every edit was being made to files Next.js never re-read. The dev server was serving the *first* compile of the session, frozen in time.

Fix: switch to polling-based file watching with `WATCHPACK_POLLING=true` and `CHOKIDAR_USEPOLLING=true`. Slower but reliable.

**Lesson**: silent failures of dev tooling are extremely expensive. The error was in the log; nothing flagged it as critical. A developer who didn't read every line of the terminal would have been stuck indefinitely.

### 11.7 `react-resizable-panels` v4 vs v2 API mismatch

After fixing the EMFILE issue, a new error appeared in the dev server logs:

```
Attempted import error: 'PanelGroup' is not exported from 'react-resizable-panels'
```

The package had been auto-installed at version 4.11.0, which renamed the exports from `PanelGroup`/`Panel`/`PanelResizeHandle` (v2 API) to `Group`/`Panel`/`Separator` (v4 API). The code was written against the v2 API (which most online docs reference).

This was an "Attempted import error," not a fatal compile error — Next.js compiled the page with `undefined` imports, which then crashed at runtime with no useful stack trace. The user saw "the previous version" because the workspace component was failing silently and falling back to a broken state.

Fix: pin to `react-resizable-panels@^2.1.7`.

**Lesson**: import errors that don't fail the build are footguns. Loose semver in `package.json` is a footgun. The fix took 5 minutes once the actual error was found; finding it took an hour.

### 11.8 The wrong CV-mortality merge (caught in dry-run)

When the dedupe pass was first implemented, the dry-run output showed it wanted to merge:

> `LCZ696 reduces CV mortality` → into `LCZ696 reduces all-cause mortality`

These are *clinically distinct* secondary outcomes. The cause was the Jaccard threshold of **0.5**, which exactly matched the shared token count of these two finding titles (3 shared tokens out of 6 unique = 0.5 exactly, and the threshold check was `>=`).

This was the closest call of the entire build. The merge would have been a silent clinical error — a pharmacist reviewing the demo would have seen `LCZ696 reduces all-cause mortality` and assumed it covered CV mortality too. Catching it in dry-run mode and bumping the threshold to **0.6** was a critical save.

**Lesson**: every threshold in a clinical product is a clinical decision. Dry-run modes for destructive operations should be the default, not an opt-in.

### 11.9 The duplicate findings discovery

The pharmacist complained that a "Sparse statistics" flag was firing on `LCZ696 reduces CV death/HF hospitalization`, but the paper clearly had the HR/CI/p for that outcome. Investigation revealed the flagged finding was *not* the rich primary outcome card — it was a **stub finding** with all-null stats. The pipeline had produced *three different findings* about the same composite primary outcome (one rich, one mid, one stub), and the stub was the one being flagged.

This led to the entire dedupe pass being designed and implemented. The bug surface was a misleading red flag; the root cause was a per-section prompt running on each section that mentioned the primary outcome, producing redundant findings that aggregation didn't catch.

**Lesson**: a UI bug ("why is this flagged?") can reveal a pipeline architecture bug ("why are there three findings for one outcome?"). The fix is often upstream of the visible symptom.

### 11.10 SQL column name typos

A migration query referenced `filename` instead of `file_name`. SQLite raised `OperationalError: no such column`. Mundane bug, fixed in one line. Worth mentioning because it represents the cost of evolving a schema without a strict migration tool — V1 of any LLM application moves fast and SQL hygiene slips.

---

## 12. Decisions to Not Build

A list of things deliberately not built. Each is a small decision but the pattern is the product.

- **Streaming findings during analysis** — rejected because dedupe at end would visibly retract findings (see §10).
- **PDF page highlighting** — out of scope for V1; requires embedded JS-based PDF viewer (pdf.js), several days of work, and adds little to the trust thesis vs. the source location pill that already exists.
- **Real-time observability event streaming to the UI** — snapshot polling is sufficient for the current event volume.
- **Magic-link email auth / full account system** — overkill for a portfolio demo viewed by a small audience; shared password (planned for deployment) is the right balance.
- **Bumping `MAX_FINDINGS_PER_PAPER` past 16** — diminishing returns; the model starts inventing filler to fill slots.
- **Multi-paper batch upload** — single paper at a time keeps the trust narrative tight; batch is a future feature once the single-paper flow is rock solid.
- **Tracking AI quality with active learning** — interesting but premature for portfolio scope.
- **Backend dedupe via embeddings** — token-based Jaccard + statistics fingerprint handles the demo paper well; embeddings would catch more semantic duplicates but add infrastructure and latency.

The discipline of saying "not now" is as important as the discipline of saying "yes." A portfolio piece that does fewer things well is more compelling than one that does many things adequately.

---

## 13. The Human-AI Collaboration Model

This project was built with an AI coding agent (Claude) inside the Cursor IDE. The collaboration pattern is itself worth documenting because it shapes how a non-engineer can ship a real engineering artifact.

### The pattern

1. **Pharmacist articulates a problem or goal** in plain language ("the red flags are showing things that aren't really problems")
2. **Agent proposes options** with explicit trade-offs ("Option A is fast but band-aid; Option B is slower but fixes the root cause")
3. **Pharmacist picks** based on clinical judgment, product taste, or budget
4. **Agent implements**, surfaces relevant risks, and asks before destructive operations
5. **Both QA the result** — the pharmacist on clinical correctness, the agent on technical correctness

### Where the pharmacist drove

- Clinical correctness ("CV mortality and all-cause mortality are different outcomes")
- Product framing ("observability conflates two questions")
- Trust thesis ("never make a claim the AI didn't earn")
- UX taste (palette, font, density, what to surface vs. bury)
- Strategic scope ("save this for V2")

### Where the agent drove

- Stack choices (with rationale presented for sign-off)
- Library selection
- Schema design
- Debugging silent failures (EMFILE, react-resizable-panels v4 mismatch)
- Refactoring patterns
- Performance tuning (parallelization, retry budgets, threshold values)

### The critical safety pattern

For any destructive operation (deleting DB rows, modifying `.env` files, dropping findings), the agent ran a **dry-run first** and showed the result to the pharmacist before applying. This pattern caught the wrong CV-mortality merge before it shipped. The lesson generalizes: any AI agent that can mutate user data should default to preview-before-apply.

### What didn't work as well

- The agent sometimes proposed changes without proposing tests; testing infrastructure remained sparse throughout the build. For a portfolio piece this was acceptable; for production work it would not be.
- The agent occasionally got stuck in long debugging loops when the failure mode was infrastructure-level (e.g., EMFILE) rather than code-level. Recognizing when the bug is *not in the code* takes a different kind of intuition than fixing code bugs.

### What worked surprisingly well

- The pharmacist's clinical expertise was load-bearing for product decisions the agent could not make alone. The agent did not initially recognize that CV mortality and all-cause mortality are different outcomes — that's domain knowledge no model has reliable access to.
- The "agent proposes, human approves, agent builds" pattern compressed the cost of iteration. The pharmacist could explore many product directions without paying the time cost of implementing each one.

This is a model for how clinical experts can build software without learning to code: the expert provides taste, judgment, and domain knowledge; the agent provides implementation, debugging, and technical proposals. The product is better than either could build alone.

---

## 14. The Clinical Thesis, More Deeply

A handful of decisions in this build cohere around a single principle: **trust is earned through visibility, not claimed through confidence.**

Examples:

- Every finding shows where in the paper it was extracted from (source location pill)
- Every finding shows its source passages on demand (expandable)
- The model's confidence is shown alongside its rationale
- Unreported stats render as "Not reported" — the gap is visible, not hidden
- Conflicting stats are surfaced for review, not silently dropped
- The "Not statistically significant" flag only fires when there's extracted evidence; it never makes a claim about what the AI failed to extract
- Pipeline warnings are surfaced in the Summary tab alongside paper-level concerns

The principle inverts the default LLM application pattern. Most LLM apps optimize for confident-sounding output. This one optimizes for *legible* output — the reader can always tell what the AI knows, what it doesn't, and where it's uncertain.

For healthcare specifically, this is the only viable path. A clinician cannot rely on AI output they cannot audit. The product's job is to make auditing fast.

---

## 15. Quantitative Snapshot

State at the time of this writing:

- **Build duration**: ~2 days of active work
- **Stack**: Python 3.9 + FastAPI + SQLAlchemy + SQLite + Pydantic on the backend; Next.js 14 + TypeScript + Tailwind CSS + Inter on the frontend
- **LLM**: Gemini 2.5 Flash (default), with Anthropic and OpenAI as drop-in alternatives via the provider abstraction
- **Demo paper**: NEJMoa1409077 (PARADIGM-HF), pinned via `DEMO_PAPER_ID` env var
- **Findings on the demo (post-dedupe)**: 9 (down from 16 pre-dedupe — 4 stubs + 3 duplicates removed)
- **Typical analysis time**: ~1m47s for the demo paper, ~2 min for new uploads on Gemini Flash
- **Findings cap per paper**: 16 global, 6 for Results, 3 for other sections
- **Retry budget**: 6 attempts, ~61s worst case
- **Parallel workers**: 3 concurrent section calls
- **Dedupe thresholds**: Jaccard 0.6 on title tokens, exact match on normalized HR + CI95 + p-value fingerprint
- **Source passages per finding**: capped at 3, prioritized by evidentiary weight

---

## 16. What's Next

The deployment conversation is pending. Open questions include:

- Hosting platform (Fly.io vs Render vs Cloud Run)
- Auth model (shared password vs magic link vs open with rate limits)
- Rate limiting (per-IP + global daily ceiling)
- Cost ceiling (Gemini billing alert + hard auto-pause flag)
- Upload constraints (10 MB max, 30 page max)
- PDF retention policy (7-day auto-delete)
- Domain (own vs free subdomain)

Beyond deployment, future product directions include:

- PDF page anchoring (highlight the source passage on click)
- Batch paper upload for comparative analysis
- Pharmacist accounts with personal review history
- Explicit RoB 2.0 rubric integration (replacing the current free-form Risk & Limitations)
- Comparative analysis across multiple trials of the same intervention

None of these are required to demonstrate the core thesis. They're growth surface for after V1 ships publicly.

---

## Appendix: Files of Note

For technical readers who want to dig into the implementation:

- **`api/app/services/analyze_pipeline.py`** — the analysis orchestration, dedupe logic, pipeline stages, retry/recovery
- **`api/app/services/llm/`** — provider abstraction (Gemini / Anthropic / OpenAI) and retry/backoff
- **`api/app/schemas/finding.py`** — the Pydantic schema enforcing the LLM output contract
- **`api/scripts/dedupe_existing_findings.py`** — one-off cleanup applying the same dedupe rules to existing DB rows without re-running analysis
- **`docs/prompts/gemini_findings_v2.md`** — the rigorous V2 prompt template
- **`rx-evidence-next/app/components/FindingCard.tsx`** — the dense per-finding UI primitive
- **`rx-evidence-next/app/components/RedFlags.tsx`** — the "Findings to Review" surface (file name is legacy; component is now "Findings to review")
- **`rx-evidence-next/app/components/ConfidenceCoverage.tsx`** — the AI-quality signal at top of Summary tab
- **`rx-evidence-next/app/lib/progress.ts`** — the stage-based progress computation

---

*End of build journey readout.*
