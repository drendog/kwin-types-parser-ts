#!/bin/bash
set -e

if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

echo "Building TypeScript library package..."

rm -rf ./lib
mkdir -p ./lib

generate_file() {
    local template_file="$1"
    local output_file="$2"

    # Simple template substitution
    sed -e "s|{{packageName}}|$PACKAGE_NAME|g" \
        -e "s|{{version}}|$PACKAGE_VERSION|g" \
        -e "s|{{description}}|$PACKAGE_DESCRIPTION|g" \
        -e "s|{{author}}|$PACKAGE_AUTHOR|g" \
        -e "s|{{license}}|$PACKAGE_LICENSE|g" \
        "$template_file" > "$output_file"

    echo "Generated: $output_file"
}

generate_file "./src/output/templates/package/package.json.hbs" "./lib/package.json"
generate_file "./src/output/templates/package/tsconfig.json.hbs" "./lib/tsconfig.json"
generate_file "./src/output/templates/package/README.md.hbs" "./lib/README.md"
generate_file "./src/output/templates/package/LICENSE.hbs" "./lib/LICENSE"

echo "Generating TypeScript definitions..."
deno run --allow-read --allow-write --allow-net --allow-env main.ts "./lib/index.d.ts"

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate types"
    exit 1
fi

echo "Generated: lib/index.d.ts"

echo ""
echo "✅ Package built in lib/"
echo "📦 ${PACKAGE_NAME}@${PACKAGE_VERSION}"
