-- Sprint 1 auth: refresh token rotation/reuse detection state.

ALTER TABLE refresh_token
    ADD COLUMN revoked_at DATETIME NULL AFTER expires_at;

CREATE INDEX idx_refresh_token_user_revoked ON refresh_token (user_id, revoked_at);
