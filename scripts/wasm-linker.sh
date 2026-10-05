#!/usr/bin/env bash
# Use the shell's linker when rustup's bundled LLD wrapper is unavailable.
args=()
for arg in "$@"; do
	if [ "$arg" != '-fuse-ld=lld' ]; then args+=("$arg"); fi
done
exec cc "${args[@]}"
