#!/usr/bin/env bash
# Fetch CC0 assets (ambientCG materials, Poly Haven HDRIs) into assets/raw.
# Every file fetched is recorded in assets/manifest.json by fetch_manifest at the end.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/assets/raw"
HDR="$ROOT/assets/hdri"
mkdir -p "$RAW" "$HDR"

MATS=(
  Concrete048 PaintedPlaster017 Terrazzo013 WoodFloor051 DiamondPlate009
  Metal027 Metal064 Paper006 Bricks060 Fabric086 Tiles040 Concrete049
)

for m in "${MATS[@]}"; do
  if [ -d "$RAW/$m" ]; then echo "skip $m"; continue; fi
  echo "== $m"
  curl -sSL -m 180 -o "$RAW/$m.zip" "https://ambientcg.com/get?file=${m}_1K-JPG.zip" || { echo "FAIL $m"; continue; }
  mkdir -p "$RAW/$m" && unzip -oq "$RAW/$m.zip" -d "$RAW/$m" && rm -f "$RAW/$m.zip"
done

HDRIS=(boiler_room concrete_tunnel abandoned_tiled_room dikhololo_night metro_noord)
for h in "${HDRIS[@]}"; do
  if [ -f "$HDR/${h}_1k.hdr" ]; then echo "skip $h"; continue; fi
  echo "== hdri $h"
  curl -sSL -m 180 -o "$HDR/${h}_1k.hdr" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/${h}_1k.hdr" || echo "FAIL $h"
done

echo "DONE"
du -sh "$RAW" "$HDR"
