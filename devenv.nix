{ pkgs, lib, ... }:

let
  envOr = name: default:
    let value = builtins.getEnv name;
    in if value == "" then default else value;
  loadRootEnv = ''
    if [ -f .env ]; then
      _devenv_pg_port="''${PGPORT-}"
      while IFS= read -r line; do
        case "$line" in
          ""|\#*) continue ;;
        esac
        key="''${line%%=*}"
        if [ -n "$key" ] && [ -z "''${!key+x}" ]; then
          export "$line"
        fi
      done < .env
      if [ -n "$_devenv_pg_port" ]; then
        export DATABASE_URL="postgres://''${PGUSER:-postgres}:''${PGPASSWORD:-postgres}@''${PGHOST:-localhost}:''${PGPORT}/''${PGDATABASE:-chess}"
      fi
    fi
  '';
in
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
    nil
    nixd
  ] ++ lib.optionals pkgs.stdenv.isLinux (with pkgs.cudaPackages; [
    cudatoolkit
    cudnn
  ]);

  env = lib.optionalAttrs pkgs.stdenv.isLinux {
    LD_LIBRARY_PATH = lib.makeLibraryPath (with pkgs.cudaPackages; [
      cudatoolkit
      cudnn
    ]) + ":/run/opengl-driver/lib";
  };

  services.postgres = {
    enable = true;
    package = pkgs.postgresql_16;
    listen_addresses = envOr "PGHOST" "localhost";
    port = lib.toInt (envOr "PGPORT" "5432");
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
      bash -c 'set -e; ${loadRootEnv} until ${pkgs.postgresql_16}/bin/pg_isready -h "''${PGHOST:-localhost}" -p "''${PGPORT:-5432}" -U "''${PGUSER:-postgres}"; do sleep 1; done; ${pkgs.postgresql_16}/bin/createdb -h "''${PGHOST:-localhost}" -p "''${PGPORT:-5432}" -U "''${PGUSER:-postgres}" "''${PGDATABASE:-chess}" 2>/dev/null || true; (cd packages/database && bun run database:migrate); cd apps/api; exec bun run dev'
    '';
    engine.exec = ''
      bash -c '${loadRootEnv} cd apps/engine; exec bun run dev'
    '';
    web.exec = ''
      bash -c '${loadRootEnv} cd apps/web; exec bun run dev'
    '';
  };

  enterShell = ''
    ${loadRootEnv}
    echo "chess: run 'devenv up' to start PostgreSQL, API, engine, and web"
  '';
}
