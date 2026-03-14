# Prosodic Feedback Integration Plan

## Goal
Add offline/parallel prosodic feedback after a conversation ends, using student audio stored in Supabase. The final prosodic result must be numerical and separate from dialogic feedback.

## Prerequisite (Before Step 1)
Align schema source-of-truth and migration definitions before adding prosody fields.

- Runtime schema currently used by app/server: `shared/schema.ts`
- Migration schema snapshot to align: `migrations/schema.ts`

Without this alignment, new prosody columns may drift between runtime types and actual DB structure.

## Step 1: Queue Prosody Work On Conversation End
When a conversation is ended, trigger an asynchronous prosody job by conversation ID.

### Inputs
- `conversationId`

### Behavior
- Keep end-conversation UX fast (no blocking analysis).
- Start job in background immediately after the user clicks End Conversation, in parallel with text/dialogic feedback generation.
- Fetch conversation transcript and sort entries by timestamp.
- Select only student turns with `audioUrl`.
- For each student turn audio file (typically 5-10 per conversation), create one per-segment processing record.

### Notes on Transcript Model
- Transcript is ping-pong JSON entries.
- Prosodic analysis must ignore `ai` and `teacher` turns.
- Student turns are the source of truth for analysis.

### Expected Outcome
- Conversation completes immediately.
- Prosody pipeline starts asynchronously with reliable input scope and one queued unit per student speech segment.

## Step 2: Collect and Normalize Audio From Supabase URLs
Build a robust audio ingestion pipeline from transcript `audioUrl` values.

### Behavior
- Download student audio files server-side from Supabase storage links.
- Handle mixed formats (`webm` dominant, occasional `mp3`).
- Normalize to analysis format (mono WAV, consistent sample rate).
- Process clips in transcript timestamp order.

### Processing Strategy (Choose and keep consistent)
- Option A: Concatenate ordered student clips, then run one analysis pass.
- Option B: Analyze each clip individually, then aggregate numeric metrics.

Recommended for this project: Option B. Each student sub-audio is analyzed independently first, then conversation-level numeric scores are aggregated.

### Job Status Tracking
Add async status tracking for observability.

- `pending`
- `running`
- `completed`
- `failed`

### Expected Outcome
- Deterministic student-only audio stream per conversation.
- Repeatable preprocessing across all sessions.

## Step 3: Run Python Analyzer Asynchronously
Use `single_speaker_analyzer.py` as the canonical prosody engine in async mode.

### Behavior
- Invoke Python from backend worker/process (not request-blocking).
- Provide normalized audio input.
- Return strict numeric results plus optional raw diagnostics.

### Required Numeric Outputs
- `prosodyOverallScore`
- `prosodyPacingScore`
- `prosodySpeakingRateWpm`
- `prosodyPauseFreqPerMin`
- `prosodyLongPauseCount`
- `prosodyMeanPauseDurationSec`
- `prosodyPitchVariabilityScore`
- `prosodyEnergyVariabilityScore`
- `prosodyFillerRatePer100Words`

### Optional Diagnostics
- `prosodyRawMetrics` (JSON for tuning/debugging)

### Expected Outcome
- Stable numeric prosody result generated asynchronously.

## Step 4: Persist Numeric Prosody Separately (Not Dialogic-Integrated)
Store prosody in DB as structured numeric fields and surface it independently in UI/admin.

### Critical Rule
Do **not** inject prosody scores into dialogic/teacher feedback prompts.

### Storage Approach
Use a hybrid storage model:

- Per-segment metrics in a dedicated table (one row per student speech audio file).
- Conversation-level aggregate metrics in the feedback table (or a dedicated conversation-level prosody summary table).

#### Proposed Columns
- `prosodyStatus` (text)
- `prosodyComputedAt` (timestamp)
- `prosodyOverallScore` (numeric)
- `prosodyPacingScore` (numeric)
- `prosodySpeakingRateWpm` (numeric)
- `prosodyPauseFreqPerMin` (numeric)
- `prosodyLongPauseCount` (integer)
- `prosodyMeanPauseDurationSec` (numeric)
- `prosodyPitchVariabilityScore` (numeric)
- `prosodyEnergyVariabilityScore` (numeric)
- `prosodyFillerRatePer100Words` (numeric)
- `prosodyRawMetrics` (jsonb)

#### Proposed Per-Segment Table (New)
- `prosody_segment_metrics.id` (uuid)
- `prosody_segment_metrics.conversation_id` (uuid fk)
- `prosody_segment_metrics.feedback_id` (uuid fk, nullable)
- `prosody_segment_metrics.segment_index` (integer)
- `prosody_segment_metrics.source_audio_url` (text)
- `prosody_segment_metrics.source_timestamp` (timestamp)
- `prosody_segment_metrics.status` (text: pending/running/completed/failed)
- `prosody_segment_metrics.pitch_mean_hz` (numeric)
- `prosody_segment_metrics.pitch_range_hz` (numeric)
- `prosody_segment_metrics.energy_variance` (numeric)
- `prosody_segment_metrics.words_per_minute` (numeric)
- `prosody_segment_metrics.long_pause_count` (integer)
- `prosody_segment_metrics.pause_freq_per_min` (numeric)
- `prosody_segment_metrics.raw_metrics` (jsonb)
- `prosody_segment_metrics.error` (text)
- `prosody_segment_metrics.created_at` (timestamp)
- `prosody_segment_metrics.updated_at` (timestamp)

### API/UI Exposure
- Add API endpoint(s) to fetch prosody status + numeric results.
- Show a dedicated numeric prosody panel in feedback/admin UI.

### Expected Outcome
- Final prosodic feedback is numerical, persisted, queryable, and clearly separate from dialogic feedback.

## Acceptance Criteria
- Ending a conversation does not wait for prosody analysis.
- Prosody job reads only student `audioUrl` transcript entries.
- One prosody segment record is created per student speech audio file in transcript order.
- Audio is downloaded from Supabase and normalized before analysis.
- Output is stored as numeric fields in DB.
- Dialogic feedback text remains independent from prosody scoring.
- UI/admin can view job status and final numeric prosody metrics.

