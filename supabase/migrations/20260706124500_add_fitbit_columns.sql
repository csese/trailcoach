-- Google Health API (Fitbit device) daily metrics
-- (Already applied to trailcoach-prod via MCP on 2026-07-06.)
ALTER TABLE biometrics
  ADD COLUMN IF NOT EXISTS fitbit_resting_hr integer,
  ADD COLUMN IF NOT EXISTS fitbit_hrv_rmssd numeric(5,1),
  ADD COLUMN IF NOT EXISTS steps integer;
