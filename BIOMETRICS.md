# TrailCoach Biometrics & Sync System

## Overview

This system provides automated daily collection of health and training data from multiple sources, creating a complete picture of your recovery, load, and readiness for ultra-trail training.

## Data Sources

| Source | Metrics | Frequency | Notes |
|--------|---------|-----------|-------|
| **Eight Sleep** | RHR, HRV (RMSSD), sleep stages, sleep score, respiratory rate | Daily (each morning) | Requires email/password auth |
| **Google Fit** | Sleep stages, heart rate | Daily | REST API deprecated end of 2026 |
| **Garmin Connect** | Sleep stages, stress score, body battery | Daily | Requires OAuth |
| **Strava** | Workouts, HR, distance, elevation | Real-time sync | Already integrated |

## Database Schema

### `biometrics` Table
Stores daily health metrics from all sources. Key fields:
- `resting_hr` - Resting heart rate during sleep
- `hrv_rmssd` - Heart rate variability (RMSSD)
- `sleep_score` - 0-100 sleep quality score
- `sleep_*_minutes` - Sleep stage breakdown
- `respiratory_rate` - Breaths per minute
- `wellness_score` - Computed composite score

### `integrations` Table
Stores authentication credentials for each provider per user.

### `sync_logs` Table
Tracks all sync operations for observability and debugging.

### `daily_summaries` Table
Pre-aggregated daily view combining biometrics + workout data for fast dashboard queries.

## Setup

### 1. Apply Database Migration
```bash
supabase db push
# or manually run the migration in Supabase SQL editor:
# supabase/migrations/20260706_add_biometrics_sync.sql
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and fill in your credentials:
```bash
cp .env.example .env.local
```

### 3. Run Daily Sync (Cron Example)
Add to crontab to sync at 5:00 AM UTC daily:
```bash
0 5 * * * cd /Users/charlessese/Documents/trailcoach && /usr/bin/osascript -e 'do shell script "cd /Users/charlessese/Documents/trailcoach && bun scripts/sync-runner.js"'
```

Or use a GitHub Action / Vercel cron for cloud-hosted deployments.

## Usage

### Manual Sync
```bash
# Sync all users
bun run sync

# Dry run (no writes)
bun run sync:dry

# Sync specific user
bun run sync:user --user <user-id>
```

### In the App
Navigate to `/health` in the TrailCoach web app for the complete dashboard.

## Computed Metrics

### Wellness Score (0-100)
Composite score calculated as:
- 40% Sleep score/duration
- 30% HRV (normalized)
- 30% Resting HR (inverted scale)

### Recovery Detection
Flags recovery days when:
- Resting HR > 65 bpm (elevated)
- HRV < 40ms (suppressed)
- Sleep < 6 hours
- High Garmin stress score

### TRIMP
Training Impulse calculation:
```
TRIMP = duration × HRreserv × 0.64 × e^(a × HRreserv)
where HRreserv = (HRavg - HRrest) / (HRmax - HRrest)
      a = 1.92 for women, 1.67 for men
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│ Eight Sleep │────▶│              │     │            │
│ API         │     │  sync-runner │────▶│ Supabase   │
├─────────────┤     │  (daily via  │     │  biometrics│
│ Google Fit  │────▶│   cron)      │     │  tables    │
│ API         │     │              │     │            │
├─────────────┤     └──────────────┘     └──────┬─────┘
│ Garmin      │                              │
│ Connect API │──────────────────────────────┘
└─────────────┘
                                                  │
                                              ┌───▼───┐
                                              │  App  │
                                              │  UI   │
                                              └───────┘
```

## Files Modified/Added

- `supabase/migrations/20260706_add_biometrics_sync.sql` - Database schema
- `src/composables/useBiometrics.js` - Main composable with API clients
- `src/composables/useGarminConnect.js` - Garmin Connect OAuth handling
- `src/views/HealthDashboardView.vue` - Dashboard UI
- `scripts/sync-runner.js` - Daily sync orchestrator
- `src/router/index.js` - Added `/health` route
- `src/components/layout/AppSidebar.vue` - Added Health nav link
