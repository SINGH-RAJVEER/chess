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
    go
    gcc
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
  ] ++ lib.optionals pkgs.stdenv.isLinux (with pkgs; [
    glib
    gtk3
    webkitgtk_4_1
    libsoup_3
    cairo
    pango
    gdk-pixbuf
    gobject-introspection
    dbus
  ]);

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
      bash -c 'set -e; ${loadRootEnv} export CGO_ENABLED=1 AUTO_MIGRATE=true; until ${pkgs.postgresql_16}/bin/pg_isready -h "''${PGHOST:-localhost}" -p "''${PGPORT:-5432}" -U "''${PGUSER:-postgres}"; do sleep 1; done; ${pkgs.postgresql_16}/bin/createdb -h "''${PGHOST:-localhost}" -p "''${PGPORT:-5432}" -U "''${PGUSER:-postgres}" "''${PGDATABASE:-chess}" 2>/dev/null || true; cd apps/engine; cargo build --release --lib; cd ../api; exec go run ./cmd/api'
    '';
    web.exec = ''
      bash -c '${loadRootEnv} cd apps/web; exec bun run dev'
    '';
  };

  enterShell = ''
    ${loadRootEnv}
    echo "chess: run 'devenv up' to start PostgreSQL, API, and web"
  '';
}
