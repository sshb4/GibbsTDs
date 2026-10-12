-- State for a future boxscore-diff detector. The active play-based detector
-- uses the events table and does not need to update this baseline.
CREATE TABLE IF NOT EXISTS td_state (
  game_key TEXT PRIMARY KEY,
  td_total INTEGER NOT NULL CHECK (td_total >= 0),
  updated_at INTEGER NOT NULL
);
