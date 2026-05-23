#!/usr/bin/env bash
# Release script: validate, tag, push, and create a GitHub release in one go.
#
# Usage:
#   ./scripts/release.sh <version> [notes_file]
#
# Examples:
#   ./scripts/release.sh v1.1.0                     # opens $EDITOR for notes
#   ./scripts/release.sh v1.1.0 RELEASE_NOTES.md    # reads notes from file
#
# Pre-flight checks before doing anything irreversible:
#   - version looks like semver (vX.Y.Z or vX.Y.Z-prerelease)
#   - working tree is clean
#   - current branch is main (warn otherwise)
#   - tag doesn't already exist locally or on origin
#   - release notes aren't empty
#
# You'll see a summary and a [y/N] prompt before tag/push/release happens.

set -euo pipefail

VERSION="${1:-}"
NOTES_FILE="${2:-}"

# ── helpers ──────────────────────────────────────────────────────────
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
die()    { red "ERROR: $*"; exit 1; }

# ── arg validation ───────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [notes_file]"
  echo "Example: $0 v1.1.0"
  exit 1
fi

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  die "version must look like v1.2.3 or v1.2.3-beta.1, got: $VERSION"
fi

# Locate repo root, no matter where the script is invoked from.
cd "$(dirname "$0")/.."

# ── pre-flight: dependencies ─────────────────────────────────────────
command -v gh >/dev/null 2>&1 || die "gh CLI not installed. Try: brew install gh"
gh auth status >/dev/null 2>&1 || die "gh not authenticated. Run: gh auth login"
# Configure git to authenticate to GitHub over HTTPS using gh's token.
# Without this, the `git push` below can hang waiting for credentials in
# non-interactive shells.
gh auth setup-git >/dev/null 2>&1 || die "failed to configure git credentials via gh (gh auth setup-git)"

# ── pre-flight: branch & cleanliness ─────────────────────────────────
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  yellow "You're on '$CURRENT_BRANCH', not main."
  read -r -p "Continue anyway? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  red "Working tree has uncommitted changes. Commit or stash first."
  git status -s
  exit 1
fi

# Make sure local is up to date with remote (avoid releasing stale code).
git fetch origin --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$CURRENT_BRANCH" 2>/dev/null || echo "")
if [[ -n "$REMOTE" && "$LOCAL" != "$REMOTE" ]]; then
  yellow "Local HEAD and origin/$CURRENT_BRANCH differ:"
  git log --oneline --left-right "HEAD...origin/$CURRENT_BRANCH" | head -10
  read -r -p "Continue anyway? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 1
fi

# ── pre-flight: tag uniqueness ───────────────────────────────────────
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  die "tag $VERSION already exists locally."
fi
if git ls-remote --tags origin "refs/tags/$VERSION" 2>/dev/null | grep -q "$VERSION"; then
  die "tag $VERSION already exists on origin."
fi

# ── collect release notes ────────────────────────────────────────────
TAG_MSG_FILE=$(mktemp -t release-notes.XXXXXX)
cleanup() { rm -f "$TAG_MSG_FILE" "$TAG_MSG_FILE.bak"; }
trap cleanup EXIT

if [[ -n "$NOTES_FILE" ]]; then
  [[ -f "$NOTES_FILE" ]] || die "notes file not found: $NOTES_FILE"
  cp "$NOTES_FILE" "$TAG_MSG_FILE"
else
  # Seed the editor with a template. Lines starting with # are stripped.
  cat > "$TAG_MSG_FILE" <<EOF
$VERSION — <one-line summary>

Highlights:
- (write your release notes here)

# Lines starting with # are stripped before tagging.
# Save and quit to continue, or quit without saving to abort.
EOF
  "${EDITOR:-vi}" "$TAG_MSG_FILE"
fi

# Strip comment lines and blank-line-only files.
sed -i.bak '/^#/d' "$TAG_MSG_FILE"
# Trim trailing blank lines.
sed -i.bak -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}' "$TAG_MSG_FILE"

if [[ ! -s "$TAG_MSG_FILE" ]] || ! grep -q '[^[:space:]]' "$TAG_MSG_FILE"; then
  die "release notes are empty, aborting."
fi

TITLE=$(head -1 "$TAG_MSG_FILE")

# ── show plan & confirm ──────────────────────────────────────────────
echo
bold "============================="
bold "About to release: $VERSION"
bold "Title:            $TITLE"
bold "Branch:           $CURRENT_BRANCH"
bold "Commit:           $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
bold "============================="
cat "$TAG_MSG_FILE"
bold "============================="
echo
read -r -p "Proceed with tag + push + GitHub release? [y/N] " ans
[[ "$ans" =~ ^[Yy]$ ]] || { yellow "Aborted."; exit 1; }

# ── do it ────────────────────────────────────────────────────────────
green "→ creating annotated tag $VERSION"
git tag -a "$VERSION" -F "$TAG_MSG_FILE"

green "→ pushing $CURRENT_BRANCH + tag to origin"
git push origin "$CURRENT_BRANCH" --follow-tags

green "→ creating GitHub release"
gh release create "$VERSION" \
  --title "$TITLE" \
  --notes-file "$TAG_MSG_FILE" \
  --latest

echo
green "Done."
RELEASE_URL=$(gh release view "$VERSION" --json url --jq .url 2>/dev/null || echo "")
[[ -n "$RELEASE_URL" ]] && echo "  $RELEASE_URL"
