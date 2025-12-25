#!/bin/bash

# Dependency Check Script for DevFlow
# Checks for outdated packages, security vulnerabilities, and other dependency issues

set -e

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                    Dependency Health Check                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

FAILED=0

# Check for outdated packages
echo "📦 Checking for outdated packages..."
OUTDATED=$(npm outdated --json 2>/dev/null || true)

if [ -n "$OUTDATED" ] && [ "$OUTDATED" != "{}" ]; then
  echo "⚠️  Found outdated packages:"
  echo "$OUTDATED" | jq -r 'to_entries[] | "  - \(.key): current \(.value.current), latest \(.value.latest)"' 2>/dev/null || echo "$OUTDATED"
  echo ""
  FAILED=1
else
  echo "✅ All packages are up to date"
fi
echo ""

# Check for security vulnerabilities
echo "🛡️  Checking for security vulnerabilities..."
AUDIT_RESULT=$(npm audit --json 2>/dev/null || true)

if [ -n "$AUDIT_RESULT" ]; then
  VULNERABILITIES=$(echo "$AUDIT_RESULT" | jq -r '.metadata.vulnerabilities | select(. != null) | [.total, .low, .moderate, .high, .critical] | @tsv' 2>/dev/null || echo "0")

  if [ -n "$VULNERABILITIES" ]; then
    TOTAL=$(echo "$AUDIT_RESULT" | jq -r '.metadata.vulnerabilities.total // 0' 2>/dev/null || echo "0")

    if [ "$TOTAL" -gt 0 ]; then
      echo "⚠️  Found $TOTAL security vulnerability/vulnerabilities:"
      echo "$AUDIT_RESULT" | jq -r '.vulnerabilities | to_entries[] | "  - \(.key): \(.value.severity) - \(.value.title)"' 2>/dev/null || echo "  Run 'npm audit' for details"
      echo ""
      echo "💡 Run 'npm audit fix' to automatically fix vulnerabilities"
      FAILED=1
    else
      echo "✅ No security vulnerabilities found"
    fi
  fi
else
  echo "✅ No security vulnerabilities found"
fi
echo ""

# Check for missing dependencies
echo "🔍 Checking for missing dependencies..."
if ! npm ls --silent --depth=0 >/dev/null 2>&1; then
  echo "⚠️  Found missing dependencies:"
  npm ls --silent --depth=0 2>&1 | grep "UNMET DEPENDENCY" || true
  echo ""
  echo "💡 Run 'npm install' to install missing dependencies"
  FAILED=1
else
  echo "✅ All dependencies are installed"
fi
echo ""

# Check for duplicate dependencies
echo "🔄 Checking for duplicate dependencies..."
DUPLICATES=$(npm ls --json 2>/dev/null | jq -r '.problems[] | select(test("duplicated"))' 2>/dev/null || true)

if [ -n "$DUPLICATES" ]; then
  echo "⚠️  Found duplicate dependencies:"
  echo "$DUPLICATES" | sed 's/^/  /'
  echo ""
  echo "💡 Consider using npm dedupe: npm dedupe"
  # Don't fail on duplicates as they're not critical
else
  echo "✅ No duplicate dependencies found"
fi
echo ""

# Check lockfile for git+ssh URLs
echo "🔒 Checking lockfile for git+ssh URLs..."
if grep -q 'git+ssh://' package-lock.json 2>/dev/null; then
  echo "⚠️  package-lock.json contains git+ssh:// URLs"
  echo "💡 Run 'npm run fix:lockfile' to fix"
  FAILED=1
else
  echo "✅ Lockfile is properly formatted"
fi
echo ""

# Summary
echo "╔═══════════════════════════════════════════════════════════════════════╗"
if [ $FAILED -eq 0 ]; then
  echo "║                    ✅ All checks passed!                            ║"
else
  echo "║                    ❌ Some checks failed                            ║"
  echo "║                                                                       ║"
  echo "║  Please address the issues above before committing.                  ║"
fi
echo "╚═══════════════════════════════════════════════════════════════════════╝"

exit $FAILED
