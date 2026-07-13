#!/usr/bin/env bash
#
# Publish the SDK to its public open-source mirror (github.com/slvr-fun/sdk).
#
# The canonical source lives here in the monorepo (slvr-mono/sdk/ts). This script
# takes the current sdk/ts tree, flattens it to the ROOT of the public repo, and
# pushes a single clean commit — so the public repo never carries the monorepo's
# internal history, and every commit is authored by a neutral identity (never a
# personal account).
#
# Usage:
#   scripts/publish-mirror.sh [message]
#
# Env (override as needed):
#   MIRROR_REMOTE   git URL of the public repo   (default: git@github.com:slvr-fun/sdk.git)
#   MIRROR_BRANCH   branch to push               (default: main)
#   GIT_AUTHOR/COMMITTER identity is FORCED to slvr-dev below and cannot be
#   overridden by your local git config, so the commit is never attributed to
#   your personal account. NOTE: the *push* is authenticated with whatever
#   credentials your shell has for the remote — make sure that's the project
#   account (a token/SSH key for slvr-fun), not your personal login.
#
set -euo pipefail

MIRROR_REMOTE="${MIRROR_REMOTE:-git@github.com:slvr-fun/sdk.git}"
MIRROR_BRANCH="${MIRROR_BRANCH:-main}"
MSG="${1:-release: sync @slvr-labs/sdk from slvr-mono}"

# Neutral identity — intentionally not tied to any individual.
export GIT_AUTHOR_NAME="slvr-dev"
export GIT_AUTHOR_EMAIL="noreply@slvr.fun"
export GIT_COMMITTER_NAME="slvr-dev"
export GIT_COMMITTER_EMAIL="noreply@slvr.fun"

SRC="$(cd "$(dirname "$0")/.." && pwd)"   # .../sdk/ts
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ source:  $SRC"
echo "→ mirror:  $MIRROR_REMOTE ($MIRROR_BRANCH)"

# Clone the public repo (shallow). If it's empty, start a fresh history.
if git clone --depth 1 --branch "$MIRROR_BRANCH" "$MIRROR_REMOTE" "$WORK" 2>/dev/null; then
  (cd "$WORK" && git rm -rq . >/dev/null 2>&1 || true)
else
  echo "  (empty or missing branch — starting fresh history)"
  git clone --depth 1 "$MIRROR_REMOTE" "$WORK" 2>/dev/null || { git init -q "$WORK"; }
  (cd "$WORK" && git checkout -q -B "$MIRROR_BRANCH")
fi

# Copy the SDK tree to the mirror root, excluding build/output/local files.
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  "$SRC"/ "$WORK"/
# Keep the tracked example env template.
cp -f "$SRC/examples/.env.example" "$WORK/examples/.env.example" 2>/dev/null || true

cd "$WORK"
git add -A
if git diff --cached --quiet; then
  echo "✓ mirror already up to date — nothing to publish"
  exit 0
fi

git commit -q -m "$MSG"
git push origin "HEAD:$MIRROR_BRANCH"
echo "✓ published to $MIRROR_REMOTE ($MIRROR_BRANCH) as slvr-dev"
