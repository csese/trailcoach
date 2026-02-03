-- Store user customizations for workout dates (swaps)
CREATE TABLE workout_date_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id TEXT NOT NULL,  -- Original workout ID from JSON (e.g., "workout-0")
  custom_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, workout_id)
);

-- Enable RLS
ALTER TABLE workout_date_overrides ENABLE ROW LEVEL SECURITY;

-- Users can only access their own overrides
CREATE POLICY "Users can view own overrides" ON workout_date_overrides
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own overrides" ON workout_date_overrides
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own overrides" ON workout_date_overrides
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own overrides" ON workout_date_overrides
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_workout_date_overrides_user ON workout_date_overrides(user_id);;
