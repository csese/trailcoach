-- Adaptations, readiness, and extended logging

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workout date overrides (legacy support)
CREATE TABLE IF NOT EXISTS workout_date_overrides (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_id TEXT NOT NULL,
  custom_date DATE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, workout_id)
);

-- Workout overrides (date + content)
CREATE TABLE IF NOT EXISTS workout_overrides (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_id TEXT NOT NULL,
  custom_date DATE,
  custom_session_type TEXT,
  custom_planned_duration TEXT,
  custom_target_hr_zone TEXT,
  custom_details TEXT,
  custom_focus TEXT,
  custom_workout_description TEXT,
  source TEXT DEFAULT 'manual',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, workout_id)
);

-- Readiness entries
CREATE TABLE IF NOT EXISTS readiness_entries (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_date DATE NOT NULL,
  sleep INTEGER,
  soreness INTEGER,
  stress INTEGER,
  mood INTEGER,
  motivation INTEGER,
  pain INTEGER,
  notes TEXT,
  readiness_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, entry_date)
);

-- Adaptation proposals
CREATE TABLE IF NOT EXISTS adaptation_proposals (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  window_days INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  summary TEXT,
  algorithm_version TEXT DEFAULT 'v1',
  signals_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adaptation changes
CREATE TABLE IF NOT EXISTS adaptation_changes (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  proposal_id UUID REFERENCES adaptation_proposals(id) ON DELETE CASCADE NOT NULL,
  workout_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  from_state JSONB,
  to_state JSONB,
  reason_code TEXT,
  reason_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extend workout logs with feedback + Strava metrics
ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS felt_vs_planned TEXT,
  ADD COLUMN IF NOT EXISTS pain INTEGER,
  ADD COLUMN IF NOT EXISTS terrain TEXT,
  ADD COLUMN IF NOT EXISTS conditions TEXT,
  ADD COLUMN IF NOT EXISTS fueling TEXT,
  ADD COLUMN IF NOT EXISTS issues TEXT,
  ADD COLUMN IF NOT EXISTS avg_pace TEXT,
  ADD COLUMN IF NOT EXISTS max_hr INTEGER,
  ADD COLUMN IF NOT EXISTS training_load NUMERIC,
  ADD COLUMN IF NOT EXISTS relative_effort NUMERIC;

-- Indexes
CREATE INDEX IF NOT EXISTS workout_overrides_user_id_idx ON workout_overrides(user_id);
CREATE INDEX IF NOT EXISTS workout_date_overrides_user_id_idx ON workout_date_overrides(user_id);
CREATE INDEX IF NOT EXISTS readiness_entries_user_id_idx ON readiness_entries(user_id);
CREATE INDEX IF NOT EXISTS adaptation_proposals_user_id_idx ON adaptation_proposals(user_id);
CREATE INDEX IF NOT EXISTS adaptation_changes_proposal_id_idx ON adaptation_changes(proposal_id);

-- RLS
ALTER TABLE workout_date_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE adaptation_changes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own workout date overrides" ON workout_date_overrides
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own workout date overrides" ON workout_date_overrides
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workout date overrides" ON workout_date_overrides
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workout date overrides" ON workout_date_overrides
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own workout overrides" ON workout_overrides
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own workout overrides" ON workout_overrides
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workout overrides" ON workout_overrides
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workout overrides" ON workout_overrides
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own readiness entries" ON readiness_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own readiness entries" ON readiness_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own readiness entries" ON readiness_entries
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own readiness entries" ON readiness_entries
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own adaptation proposals" ON adaptation_proposals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own adaptation proposals" ON adaptation_proposals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own adaptation proposals" ON adaptation_proposals
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own adaptation proposals" ON adaptation_proposals
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own adaptation changes" ON adaptation_changes
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM adaptation_proposals p
    WHERE p.id = adaptation_changes.proposal_id AND p.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own adaptation changes" ON adaptation_changes
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM adaptation_proposals p
    WHERE p.id = adaptation_changes.proposal_id AND p.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own adaptation changes" ON adaptation_changes
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM adaptation_proposals p
    WHERE p.id = adaptation_changes.proposal_id AND p.user_id = auth.uid()
  ));

-- Updated_at triggers
CREATE TRIGGER update_workout_overrides_updated_at
  BEFORE UPDATE ON workout_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_readiness_entries_updated_at
  BEFORE UPDATE ON readiness_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_adaptation_proposals_updated_at
  BEFORE UPDATE ON adaptation_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
