#!/bin/sh
# Source datasets for mapgen. Run from this directory. ~10 MB total.
#   ORBIS (MIT, github.com/emeeks/orbis_v2): Roman-world sites + routes, ~200 CE.
#   Natural Earth (public domain): coastlines, lakes, rivers, mountain ranges.
set -e
curl -sL -o orbis_sites.csv https://raw.githubusercontent.com/emeeks/orbis_v2/master/sites.csv
curl -sL -o orbis_routes.geojson https://raw.githubusercontent.com/emeeks/orbis_v2/master/base_routes.geojson
for f in ne_50m_land ne_50m_lakes ne_50m_rivers_lake_centerlines ne_50m_geography_regions_polys; do
  curl -sL -o $f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
