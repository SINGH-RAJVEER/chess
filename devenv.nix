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
  # TLS backend for WebKitGTK/GIO so https (e.g. piece CDN images) works
  # inside `devenv shell` and the desktop webview run from it.
  env.GIO_EXTRA_MODULES = lib.optionalString pkgs.stdenv.isLinux "${pkgs.glib-networking}/lib/gio/modules";

  packages = with pkgs; [
    bun
    # Node.js runs the Expo CLI and Metro bundler for apps/mobile.
    # They crash under the Bun runtime, so plain `bun run dev` is not
    # enough there; use the mobile-* just recipes inside this shell.
    nodejs
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
    # Container CLI for building and running the deployment images.
    # Rootless podman also needs subuid/subgid ranges for this user, which
    # NixOS provides via users.users.<name>.subUidRanges/subGidRanges.
    podman
    netavark
    aardvark-dns
    nil
    nixd
  ] ++ lib.optionals pkgs.stdenv.isLinux (with pkgs; [
    glib
    glib-networking
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
