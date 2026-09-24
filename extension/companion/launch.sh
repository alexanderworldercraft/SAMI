#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export PATH
exec node "$SCRIPT_DIR/src/companion.mjs" 2>>"$SCRIPT_DIR/companion.log"
