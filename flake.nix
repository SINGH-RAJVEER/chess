{
  description = "Chess local development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    devenv.url = "github:cachix/devenv";
    devenv.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils, devenv, ... } @ inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        envOr = name: default:
          let value = builtins.getEnv name;
          in if value == "" then default else value;
      in {
        devShells.default = devenv.lib.mkShell {
          inherit inputs pkgs;

          modules = [
            {
              packages = with pkgs; [
                bun
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
                nil
                nixd
              ];

              services.postgres = {
                enable = true;
                package = pkgs.postgresql_16;
                listen_addresses = envOr "PGHOST" "localhost";
                port = pkgs.lib.toInt (envOr "PGPORT" "5432");
                initialDatabases = [
                  {
                    name = envOr "PGDATABASE" "chess";
                    user = envOr "PGUSER" "postgres";
                    pass = envOr "PGPASSWORD" "postgres";
                  }
                ];
                initdbArgs = [
                  "--auth=trust"
                  "--username=${envOr "PGUSER" "postgres"}"
                  "--locale=C"
                  "--encoding=UTF8"
                ];
              };

              processes = {
                api.exec = ''
                  bash -lc 'set -e; set -a; [ ! -f .env ] || source .env; set +a; until pg_isready -h "''${PGHOST:-localhost}" -p "''${PGPORT:-5432}" -U "''${PGUSER:-postgres}"; do sleep 1; done; (cd packages/db && bun run db:migrate); cd apps/api; exec bun run dev'
                '';
                engine.exec = ''
                  bash -lc 'set -a; [ ! -f .env ] || source .env; set +a; cd apps/engine; exec bun run dev'
                '';
                web.exec = ''
                  bash -lc 'set -a; [ ! -f .env ] || source .env; set +a; cd apps/web; exec bun run dev'
                '';
              };

              enterShell = ''
                if [ -f .env ]; then
                  set -a
                  source .env
                  set +a
                fi
                echo "chess: run 'devenv up' to start PostgreSQL, API, engine, and web"
              '';
            }
          ];
        };
      });
}
