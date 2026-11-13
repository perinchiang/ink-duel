#!/bin/bash
# usage: tools/ppsheet.sh out.png enemyPose pose1 pose2 ...
out=$1; ep=$2; shift 2
files=()
for p in "$@"; do
  f="shots/pp-$(echo "$p" | tr ':,' '__').png"
  node tools/shot.mjs "index.html?pose=$ep&ppose=$p" "$f" --w=800 --h=450 --wait=900 2>&1 | grep pageerror
  files+=("$f")
done
node tools/sheet.mjs "$out" "${files[@]}" --cols=4 --w=400
