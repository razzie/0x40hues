#!/bin/bash
find . -type f -name "*.zip" -print0 | while IFS= read -r -d $'\0' zipfile; do
    xmls=$(unzip -l "$zipfile" | grep 'images.xml\|songs.xml' | wc -l)
    if [ $xmls -eq 0 ]; then
        continue
    fi
    rootitems=$(unzip -l "$zipfile" | grep -E '^[^/]+$' | wc -l)
    if [ $rootitems -eq 1 ]; then
        unzip "$zipfile"
    else
        basename=$(basename -s .zip "$zipfile")
        mkdir -p "$basename"
        unzip "$zipfile" -d "$basename"
    fi;
done
