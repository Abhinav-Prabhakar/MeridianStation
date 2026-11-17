#!/usr/bin/env bash
# Build the app and drop the result into docs/, which is what GitHub Pages
# serves from `main`. There is no CI: this runs on your machine.
#
#   npm run deploy
#
# Large assets (tex/, hdri/, bake/) already live in docs/ and are never copied,
# so a deploy only writes index.html plus a fresh assets/ folder.
set -euo pipefail
cd "$(dirname "$0")/.."

origin=$(git remote get-url origin)
slug=$(printf '%s' "$origin" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
repo_name=$(printf '%s' "$slug" | cut -d/ -f2)
owner=$(printf '%s' "$slug" | cut -d/ -f1 | tr '[:upper:]' '[:lower:]')

echo "→ building  (base /$repo_name/)"
GITHUB_REPOSITORY="$slug" npm run build

rm -rf docs/assets
cp -R dist/assets docs/assets
cp dist/index.html docs/index.html
: > docs/.nojekyll

echo "→ committing docs/"
git add -A
if git diff --cached --quiet; then
  echo "   nothing changed"
else
  git commit -qm "deploy: docs/ site bundle"
  git push origin main
fi

echo "→ https://$owner.github.io/$repo_name/"
