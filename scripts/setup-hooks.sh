#!/bin/sh
# Point git at the tracked hooks in .githooks/ (one-time, per clone).
# core.hooksPath is local config, so a fresh clone runs this once to enable
# the pre-commit formatter. Safe to re-run.
set -e
root=$(git rev-parse --show-toplevel)
git config core.hooksPath .githooks
echo "core.hooksPath -> .githooks (pre-commit formatting enabled for $root)"
