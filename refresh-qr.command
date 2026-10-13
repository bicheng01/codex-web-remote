#!/bin/sh
remote_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$remote_root/plugin/cli.mjs" qr "$@"
