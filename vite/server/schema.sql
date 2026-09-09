-- The Node server applies this schema automatically on startup.
-- Run this manually only if your deployment user cannot create tables.

CREATE TABLE IF NOT EXISTS auth_roles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_permissions (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS auth_role_permissions (
  role_id BIGINT NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES auth_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS auth_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_hash TEXT NOT NULL,
  role_id BIGINT NOT NULL REFERENCES auth_roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Seed permissions are applied by server/auth.cjs on startup.

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  application VARCHAR(160) NOT NULL DEFAULT '',
  action VARCHAR(120) NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT 'success',
  details TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_activity_occurred_at_idx ON audit_activity(occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_activity_user_id_idx ON audit_activity(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS managed_applications (
  name VARCHAR(160) PRIMARY KEY,
  display_name VARCHAR(160) NOT NULL,
  pm2_id INTEGER,
  namespace VARCHAR(80) NOT NULL DEFAULT 'default',
  status VARCHAR(30) NOT NULL DEFAULT 'unknown',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS managed_applications_active_idx ON managed_applications(is_active);
CREATE INDEX IF NOT EXISTS managed_applications_updated_at_idx ON managed_applications(updated_at DESC);

CREATE TABLE IF NOT EXISTS auth_user_applications (
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  application_name VARCHAR(160) NOT NULL,
  assigned_by BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, application_name)
);

CREATE INDEX IF NOT EXISTS auth_user_applications_name_idx ON auth_user_applications(application_name);

CREATE TABLE IF NOT EXISTS monitored_domains (
  id BIGSERIAL PRIMARY KEY,
  domain VARCHAR(253) NOT NULL UNIQUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'error',
  status_message TEXT NOT NULL DEFAULT '',
  dns JSONB NOT NULL DEFAULT '{}'::jsonb,
  ssl JSONB NOT NULL DEFAULT '{}'::jsonb,
  http JSONB NOT NULL DEFAULT '{}'::jsonb,
  registration JSONB NOT NULL DEFAULT '{}'::jsonb,
  scan_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS registration JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS scan_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS monitored_domains_status_idx ON monitored_domains(status);
CREATE INDEX IF NOT EXISTS monitored_domains_scanned_at_idx ON monitored_domains(scanned_at DESC);
