CREATE TABLE IF NOT EXISTS games (
    id serial PRIMARY KEY,
    current_turn text NOT NULL,
    status text NOT NULL,
    mode text NOT NULL DEFAULT 'vs_player',
    time_control integer NOT NULL DEFAULT 10,
    increment integer NOT NULL DEFAULT 0,
    white_time_remaining bigint NOT NULL DEFAULT 600000,
    black_time_remaining bigint NOT NULL DEFAULT 600000,
    last_move_time bigint,
    white_player_id varchar(256),
    black_player_id varchar(256),
    draw_offered_by text,
    half_move_clock integer NOT NULL DEFAULT 0,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS queue (
    id serial PRIMARY KEY,
    player_id varchar(256) NOT NULL,
    time_control integer NOT NULL,
    increment integer NOT NULL DEFAULT 0,
    joined_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS pieces (
    id serial PRIMARY KEY,
    game_id integer NOT NULL REFERENCES games(id),
    color text NOT NULL,
    piece_type text NOT NULL,
    square integer NOT NULL,
    has_moved boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS moves (
    id serial PRIMARY KEY,
    game_id integer NOT NULL REFERENCES games(id),
    from_square integer NOT NULL,
    to_square integer NOT NULL,
    piece_type text NOT NULL,
    piece_color text NOT NULL,
    captured_piece_type text,
    promotion_piece text,
    move_number integer NOT NULL,
    created_at bigint NOT NULL
);
