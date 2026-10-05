CREATE TABLE IF NOT EXISTS computer_game_archives (
	user_id varchar(256) NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
	client_id bigint NOT NULL,
	revision bigint NOT NULL,
	state jsonb NOT NULL,
	updated_at bigint NOT NULL,
	PRIMARY KEY (user_id, client_id)
);
