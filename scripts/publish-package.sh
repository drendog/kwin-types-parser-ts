#!/bin/bash
set -e

DRY_RUN=false
if [[ "$*" == *"--dry-run"* ]]; then
    DRY_RUN=true
fi

LIB_DIR="./lib"

echo "📦 Publishing TypeScript library package..."

if [ ! -d "$LIB_DIR" ]; then
    echo "❌ lib/ directory not found. Run './scripts/build-package.sh' first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js."
    exit 1
fi

if [ -f ".env" ]; then
    source .env
fi

PUBLISH_CMD="npm publish --access public --registry $REGISTRY_URL"
if [ "$DRY_RUN" = true ]; then
    PUBLISH_CMD="$PUBLISH_CMD --dry-run"
    echo "🧪 Dry run publishing..."
else
    echo "🚀 Publishing package..."
fi

echo "Running: $PUBLISH_CMD (in $LIB_DIR)"
echo ""

cd "$LIB_DIR"
$PUBLISH_CMD

if [ $? -eq 0 ]; then
    if [ "$DRY_RUN" = true ]; then
        echo ""
        echo "✅ Dry run completed!"
    else
        echo ""
        echo "✅ Package published!"
    fi
else
    echo ""
    echo "❌ Publishing failed!"
    exit 1
fi
