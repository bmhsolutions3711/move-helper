#!/bin/bash
# Move Helper — Version Management
# Usage:
#   ./rollback.sh list          — show all tagged versions
#   ./rollback.sh show v1.0     — show what changed in a version
#   ./rollback.sh deploy v1.0   — rollback to a version (creates backup branch first)
#   ./rollback.sh tag v1.1      — tag current state as a new version

set -e

case "$1" in
  list)
    echo "Tagged versions:"
    git tag -l --sort=-version:refname | while read tag; do
      date=$(git log -1 --format="%ai" "$tag" 2>/dev/null | cut -d' ' -f1)
      msg=$(git log -1 --format="%s" "$tag" 2>/dev/null)
      echo "  $tag  ($date)  $msg"
    done
    ;;
  show)
    [ -z "$2" ] && echo "Usage: ./rollback.sh show <tag>" && exit 1
    git log -1 --format="Tag: %D%nDate: %ai%nMessage: %s%n" "$2"
    git diff "$2"..HEAD --stat
    ;;
  deploy)
    [ -z "$2" ] && echo "Usage: ./rollback.sh deploy <tag>" && exit 1
    echo "Creating backup branch before rollback..."
    backup="backup-$(date +%Y%m%d-%H%M%S)"
    git branch "$backup"
    echo "  Backup branch: $backup"
    echo "Rolling back to $2..."
    git checkout "$2" -- .
    git commit -m "Rollback to $2"
    echo "Done. Push with: git push origin main"
    ;;
  tag)
    [ -z "$2" ] && echo "Usage: ./rollback.sh tag <version>" && exit 1
    git tag "$2"
    echo "Tagged current state as $2"
    echo "Push with: git push origin $2"
    ;;
  *)
    echo "Move Helper — Version Management"
    echo ""
    echo "Commands:"
    echo "  ./rollback.sh list          — show all tagged versions"
    echo "  ./rollback.sh show <tag>    — show what changed in a version"
    echo "  ./rollback.sh deploy <tag>  — rollback to a version"
    echo "  ./rollback.sh tag <version> — tag current state"
    ;;
esac
