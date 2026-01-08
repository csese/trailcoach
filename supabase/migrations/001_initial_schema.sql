-- TrailCoach Database Schema
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- WORKOUTS TABLE
-- Stores the training plan workouts
-- ============================================
CREATE TABLE IF NOT EXISTS workouts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week INTEGER,
  phase TEXT,
  dates TEXT,
  day TEXT,
  session_type TEXT,
  planned_duration TEXT,
  target_hr_zone TEXT,
  details TEXT,
  workout_description TEXT,
  focus TEXT,
  workout_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS workouts_user_id_idx ON workouts(user_id);
CREATE INDEX IF NOT EXISTS workouts_workout_date_idx ON workouts(workout_date);

-- ============================================
-- WORKOUT_LOGS TABLE
-- Stores user's completed workout data
-- ============================================
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_id UUID REFERENCES workouts(id) ON DELETE CASCADE,
  actual_duration INTEGER, -- in minutes
  actual_hr_avg INTEGER,
  actual_distance DECIMAL(10, 2), -- in km
  actual_elevation INTEGER, -- in meters
  rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10),
  notes TEXT,
  external_link TEXT,
  strava_activity_id BIGINT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, workout_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS workout_logs_user_id_idx ON workout_logs(user_id);
CREATE INDEX IF NOT EXISTS workout_logs_workout_id_idx ON workout_logs(workout_id);

-- ============================================
-- USER_SETTINGS TABLE
-- Stores user preferences and configuration
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT DEFAULT 'Athlete',
  theme TEXT DEFAULT 'dark',
  hr_zones JSONB DEFAULT '{
    "z1": {"min": 0, "max": 129, "label": "Recovery", "color": "#525252"},
    "z2": {"min": 130, "max": 149, "label": "Aerobic", "color": "#22c55e"},
    "z3": {"min": 150, "max": 150, "label": "Threshold", "color": "#f97316"},
    "z4": {"min": 151, "max": 180, "label": "Hard", "color": "#ef4444"},
    "z5": {"min": 181, "max": 220, "label": "Max", "color": "#dc2626"}
  }'::jsonb,
  races JSONB DEFAULT '[]'::jsonb,
  strava_access_token TEXT,
  strava_refresh_token TEXT,
  strava_token_expires_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STRAVA_ACTIVITIES TABLE
-- Stores synced Strava activities
-- ============================================
CREATE TABLE IF NOT EXISTS strava_activities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  strava_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  type TEXT,
  sport_type TEXT,
  distance DECIMAL(12, 2), -- in meters
  moving_time INTEGER, -- in seconds
  elapsed_time INTEGER, -- in seconds
  total_elevation_gain DECIMAL(10, 2), -- in meters
  average_heartrate DECIMAL(5, 2),
  max_heartrate INTEGER,
  start_date TIMESTAMPTZ,
  start_date_local TIMESTAMPTZ,
  summary_polyline TEXT,
  raw_data JSONB,
  linked_workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS strava_activities_user_id_idx ON strava_activities(user_id);
CREATE INDEX IF NOT EXISTS strava_activities_strava_id_idx ON strava_activities(strava_id);
CREATE INDEX IF NOT EXISTS strava_activities_start_date_idx ON strava_activities(start_date);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Ensures users can only access their own data
-- ============================================

-- Enable RLS on all tables
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;

-- Workouts policies
CREATE POLICY "Users can view own workouts" ON workouts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workouts" ON workouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workouts" ON workouts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workouts" ON workouts
  FOR DELETE USING (auth.uid() = user_id);

-- Workout logs policies
CREATE POLICY "Users can view own workout logs" ON workout_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout logs" ON workout_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout logs" ON workout_logs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout logs" ON workout_logs
  FOR DELETE USING (auth.uid() = user_id);

-- User settings policies
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Strava activities policies
CREATE POLICY "Users can view own strava activities" ON strava_activities
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strava activities" ON strava_activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strava activities" ON strava_activities
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own strava activities" ON strava_activities
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- Automatically updates the updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_workouts_updated_at
  BEFORE UPDATE ON workouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workout_logs_updated_at
  BEFORE UPDATE ON workout_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strava_activities_updated_at
  BEFORE UPDATE ON strava_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
