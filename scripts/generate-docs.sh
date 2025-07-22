#!/bin/bash
set -e
DOXYFILE_GENERATED=Doxyfile.working


# Clean up any existing directories and files from previous runs
if [ -d "kwin" ]; then
  rm -rf kwin
fi

if [ -f "Doxyfile" ]; then
  rm Doxyfile
fi

if [ -f DOXYFILE_GENERATED ]; then
  rm DOXYFILE_GENERATED
fi

if [ -d "docs" ]; then
  rm -rf docs
fi

wget https://invent.kde.org/nicolasfella/kwin-scripting-api-generator/-/raw/master/Doxyfile

git clone https://invent.kde.org/plasma/kwin.git

KWIN_SRC_DIR=$(pwd)/kwin

sed s*KWIN_SRC_DIR*${KWIN_SRC_DIR}*g Doxyfile > ${DOXYFILE_GENERATED}


doxygen ${DOXYFILE_GENERATED}

# Remove existing html directory if it exists
if [ -d "./html" ]; then
  rm -rf ./html
fi

# Move the new html directory
mv docs/html/ ./

rm Doxyfile
rm ${DOXYFILE_GENERATED}

rm -rf kwin
rm -rf docs

echo "Documentation generated and cleanup is complete."
