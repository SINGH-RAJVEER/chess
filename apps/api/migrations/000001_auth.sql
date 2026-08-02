CREATE TABLE IF NOT EXISTS "user" (
    id varchar(256) PRIMARY KEY,
    name varchar(256) NOT NULL,
    email varchar(256) NOT NULL UNIQUE,
    email_verified boolean NOT NULL DEFAULT false,
    password varchar(1024),
    image varchar(256),
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
    id varchar(256) PRIMARY KEY,
    expires_at timestamp NOT NULL,
    token varchar(256) NOT NULL UNIQUE,
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL,
    ip_address varchar(256),
    user_agent varchar(256),
    user_id varchar(256) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
    id varchar(256) PRIMARY KEY,
    account_id varchar(256) NOT NULL,
    provider_id varchar(256) NOT NULL,
    user_id varchar(256) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    access_token text,
    refresh_token text,
    id_token text,
    expires_at timestamp,
    password text,
    created_at timestamp NOT NULL,
    updated_at timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
    id varchar(256) PRIMARY KEY,
    identifier varchar(256) NOT NULL,
    value varchar(256) NOT NULL,
    expires_at timestamp NOT NULL,
    created_at timestamp,
    updated_at timestamp
);

CREATE TABLE IF NOT EXISTS password (
    id serial PRIMARY KEY,
    user_id varchar(256) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    password_hash varchar(256) NOT NULL
);
