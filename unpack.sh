#!/bin/bash
find . -type f -name "*.zip" -print0 | while IFS= read -r -d $'\0' zipfile; do
    if [ $(unzip -Z1 "$zipfile" | grep 'songs.xml' | wc -l) -eq 0 ]; then
        continue
    fi
    basename=$(basename -s .zip "$zipfile")
    mkdir -p "$basename"
    unzip -n -j "$zipfile" -d "$basename"
    if [ ! -f "$basename/info.xml" ]; then
        echo "<info><name>$basename</name></info>" > $basename/info.xml
    fi;
done
