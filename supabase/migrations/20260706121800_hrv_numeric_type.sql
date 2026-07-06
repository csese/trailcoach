-- Eight Sleep (and most wearables) report HRV with one decimal place,
-- but hrv_rmssd was integer — fractional values failed to insert.
-- (Already applied to trailcoach-prod via MCP on 2026-07-06.)
ALTER TABLE biometrics ALTER COLUMN hrv_rmssd TYPE numeric(5,1);
ALTER TABLE daily_summaries ALTER COLUMN hrv_rmssd TYPE numeric(5,1);
