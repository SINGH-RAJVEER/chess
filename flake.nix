{
  description = "Chess monorepo — local dev environment with PostgreSQL";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs_22
            postgresql_16
            just
            cargo
            rustc
            clippy
            rustfmt
            pkg-config
            openssl
            direnv
            nix-direnv
          ];

          shellHook = ''
            export PGDATA="$PWD/.postgres/data"
            export PGHOST="$PWD/.postgres"
            export PGPORT="5432"
            export PGUSER="postgres"
            export DATABASE_URL="postgres://postgres:postgres@localhost:5432/chess"

            mkdir -p "$PGHOST"

            if [ ! -d "$PGDATA" ]; then
              echo "chess: initialising PostgreSQL cluster..."
              initdb \
                --auth=trust \
                --username=postgres \
                --pgdata="$PGDATA" \
                --no-locale \
                --encoding=UTF8
            fi

            if ! pg_ctl status -D "$PGDATA" 2>/dev/null | grep -q "server is running"; then
              echo "chess: starting PostgreSQL on localhost:5432..."
              pg_ctl start -D "$PGDATA" \
                -l "$PGDATA/postgres.log" \
                -o "-p 5432 -k $PGHOST -h localhost" \
                -w
              createdb -h localhost -p 5432 -U postgres chess 2>/dev/null || true
              echo "chess: PostgreSQL ready at localhost:5432/chess"
            fi

            stop_pg() {
              if pg_ctl status -D "$PGDATA" 2>/dev/null | grep -q "server is running"; then
                echo "chess: stopping PostgreSQL..."
                pg_ctl stop -D "$PGDATA" -m fast
              fi
            }
            trap stop_pg EXIT
          '';
        };
      });
}
