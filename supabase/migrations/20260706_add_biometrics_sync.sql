-- Biometrics and sync infrastructure
-- Supports: Eight Sleep, Google Fit, Garmin Connect integrations

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- INTEGRATIONS TABLE
-- Stores auth tokens and config for external services
-- ============================================
CREATE TABLE IF NOT EXISTS integrations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL, -- 'eight_sleep', 'google_fit', 'garmin_connect', 'strava'
  -- Encrypted credentials (store encrypted in production)
  credentials JSONB, -- tokens, emails, etc.
  settings JSONB DEFAULT '{}', -- user preferences per provider
  last_sync TIMESTAMP WITH TIME ZONE,
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- ============================================
-- BIOMETRICS TABLE
-- Daily health metrics pulled from external sources
-- ============================================
CREATE TABLE IF NOT EXISTS biometrics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_date DATE NOT NULL,

  -- Eight Sleep metrics
  resting_hr INTEGER,                    -- bpm during sleep
  hrv_rmssd INTEGER,                     -- RMSSD from sleep quality score
  hrv_lfn INTEGER,                       -- Low-frequency power (optional)
  hrv_hfn INTEGER,                       -- High-frequency power (optional)
  sleep_score INTEGER,                   -- 0-100 Eight Sleep sleep score
  sleep_total_minutes INTEGER,           -- total time in bed
  sleep_deep_minutes INTEGER,            -- deep sleep duration
  sleep_rem_minutes INTEGER,             -- REM sleep duration
  sleep_light_minutes INTEGER,           -- light sleep duration
  sleep_awake_minutes INTEGER,           -- awake time in bed
  respiratory_rate DECIMAL(4,1),         -- breaths/min average during sleep
  toss_turns INTEGER,                    -- tosses and turns count
  bed_temperature_celsius DECIMAL(4,1),
  room_temperature_celsius DECIMAL(4,1),

  -- Google Fit sleep data (fallback/duplicate)
  google_sleep_minutes INTEGER,
  google_sleep_deep_minutes INTEGER,
  google_sleep_rem_minutes INTEGER,
  google_sleep_light_minutes INTEGER,

  -- Garmin Connect metrics
  garmin_sleep_minutes INTEGER,
  garmin_sleep_deep_minutes INTEGER,
  garmin_sleep_rem_minutes INTEGER,
  garmin_stress_score INTEGER,           -- 0-100
  garmin_body_battery INTEGER,           -- 0-100 energy reserves
  garmin_respiratory_rate DECIMAL(4,1),
  garmin_overall_achieve_score INTEGER,

  -- Computed fields
  wellness_score INTEGER,                -- 0-100 composite daily score
  trimp DECIMAL(10,2),                   -- training load from last workout (if any)
  acwr DECIMAL(5,2),                     -- acute:chronic workload ratio
  is_recovery_day BOOLEAN DEFAULT false, -- flagged by system

  -- Metadata
  source TEXT DEFAULT 'manual',          -- 'eight_sleep', 'google_fit', 'garmin', 'manual'
  raw_json JSONB,                        -- full API response for debugging
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, entry_date)
);

-- ============================================
-- SYNC LOG TABLE
-- Tracks all sync operations for observability
-- ============================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,                -- 'eight_sleep', 'google_fit', etc.
  operation TEXT NOT NULL,               -- 'fetch', 'store', 'full_sync'
  status TEXT NOT NULL,                  -- 'success', 'partial', 'error'
  records_fetched INTEGER DEFAULT 0,
  records_stored INTEGER DEFAULT 0,
  duration_ms INTEGER,                   -- how long the sync took
  error_message TEXT,
  triggered_by TEXT,                     -- 'scheduled', 'manual', 'app'
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- DAILY SUMMARIES TABLE
-- Pre-aggregated daily view for fast dashboard queries
-- ============================================
CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_date DATE NOT NULL,

  -- Workout data
  workout_count INTEGER DEFAULT 0,
  planned_duration_minutes INTEGER DEFAULT 0,
  actual_duration_minutes INTEGER DEFAULT 0,
  actual_distance_km DECIMAL(10,2) DEFAULT 0,
  actual_elevation_m INTEGER DEFAULT 0,
  actual_hr_avg INTEGER,
  rpe INTEGER,
  training_load DECIMAL(10,2),           -- TRIMP/TSS

  -- Biometric data
  resting_hr INTEGER,
  hrv_rmssd INTEGER,
  sleep_total_minutes INTEGER,
  sleep_deep_minutes INTEGER,
  sleep_rem_minutes INTEGER,
  wellness_score INTEGER,

  -- Readiness
  readiness_score INTEGER,               -- user-entered or computed
  soreness INTEGER,
  stress INTEGER,
  sleep_quality INTEGER,                 -- user-entered 1-10
  mood INTEGER,

  -- Computed
  acwr DECIMAL(5,2),
  recommendation TEXT,                   -- AI-generated: 'train', 'recover', 'easy'
  notes TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, entry_date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS biometrics_user_date_idx ON biometrics(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS biometrics_wellness_idx ON biometrics(user_id, wellness_score);
CREATE INDEX IF NOT EXISTS sync_logs_user_provider_idx ON sync_logs(user_id, provider, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_logs_status_idx ON sync_logs(status, started_at);
CREATE INDEX IF NOT EXISTS daily_summaries_user_date_idx ON daily_summaries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS integrations_provider_idx ON integrations(provider);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own integrations" ON integrations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own integrations" ON integrations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own biometrics" ON biometrics
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert biometrics" ON biometrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own biometrics" ON biometrics
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sync logs" ON sync_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert sync logs" ON sync_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own daily summaries" ON daily_summaries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can upsert daily summaries" ON daily_summaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily summaries" ON daily_summaries
  FOR UPDATE USING (auth.uid() = user_id);

-- Updated_at triggers
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_biometrics_updated_at
  BEFORE UPDATE ON biometrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_daily_summaries_updated_at
  BEFORE UPDATE ON daily_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
