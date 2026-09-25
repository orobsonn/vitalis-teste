-- Security state is separate from product/reset data.
CREATE TABLE auth_rate_limits (
  key_hash TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_rate_expiry ON auth_rate_limits(expires_at);
CREATE TABLE oauth_state_consumptions (
  state_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_oauth_consumption_expiry ON oauth_state_consumptions(expires_at);
