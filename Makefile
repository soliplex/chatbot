SHELL := bash
.SHELLFLAGS := -euo pipefail -c
.ONESHELL:

.PHONY: help release

help:
	@echo "Targets:"
	@echo "  release  Bump package.json, commit, create an annotated tag and push"

# Interactive release: bumps package.json, commits "chore(release): vX.Y.Z",
# creates an annotated tag (title + optional intro) and pushes main and the tag.
# The push triggers .github/workflows/release.yml, which publishes the release.
release:
	@if [ "$$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
		echo "Error: releases are made from main." >&2; exit 1
	fi
	if [ -n "$$(git status --porcelain)" ]; then
		echo "Error: working tree is not clean." >&2; exit 1
	fi
	git fetch --quiet --tags origin main
	if [ "$$(git rev-parse HEAD)" != "$$(git rev-parse origin/main)" ]; then
		echo "Error: local main is not in sync with origin/main." >&2; exit 1
	fi

	current="$$(node -p "require('./package.json').version")"
	latest_tag="$$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1)"
	# Propose the next minor from whichever is newer: package.json or the latest tag
	base="$$(printf '%s\n%s\n' "$$current" "$${latest_tag#v}" | sort -V | tail -n1)"
	IFS=. read -r major minor _ <<< "$$base"
	proposed="$$major.$$((minor + 1)).0"

	echo "Current package.json version: $$current"
	echo "Latest tag: $${latest_tag:-none}"
	read -rp "Version to release [$$proposed]: " version
	version="$${version:-$$proposed}"
	version="$${version#v}"
	if ! [[ "$$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$$ ]]; then
		echo "Error: '$$version' is not a valid x.y.z version." >&2; exit 1
	fi
	tag="v$$version"
	if git rev-parse -q --verify "refs/tags/$$tag" >/dev/null \
		|| git ls-remote --exit-code --tags origin "refs/tags/$$tag" >/dev/null; then
		echo "Error: tag $$tag already exists." >&2; exit 1
	fi

	read -rp "Release title [$$tag]: " title
	title="$${title:-$$tag}"
	read -rp "Intro paragraph (optional, leave empty for none): " intro

	echo
	echo "  Version: $$version"
	echo "  Tag:     $$tag"
	echo "  Title:   $$title"
	echo "  Intro:   $${intro:-(none)}"
	echo
	echo "This will commit the version bump, tag it, and push main and $$tag to origin."
	read -rp "Proceed? [y/N] " confirm
	if [[ ! "$$confirm" =~ ^[Yy]$$ ]]; then
		echo "Aborted."; exit 1
	fi

	if [ "$$version" != "$$current" ]; then
		npm version "$$version" --no-git-tag-version >/dev/null
		git add package.json package-lock.json
		git commit -m "chore(release): $$tag"
	fi
	if [ -n "$$intro" ]; then
		git tag -a "$$tag" -m "$$title" -m "$$intro"
	else
		git tag -a "$$tag" -m "$$title"
	fi
	git push origin main "$$tag"
	echo "Pushed $$tag. The Release workflow will publish it on GitHub."
