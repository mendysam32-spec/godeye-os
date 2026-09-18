-- GodEye auth — users, sessions & access requests (deployed D1)
-- Key/value rows are used so user data can evolve without schema churn.
CREATE TABLE IF NOT EXISTS auth_state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);