# Elevation data attribution

Terrain Tiles was accessed on 2026-09-15 from
https://registry.opendata.aws/terrain-tiles/ (Tilezen/Mapzen Terrain Tiles).
The per-tile URLs, content hashes, S3 versions, ETags and contributing source
headers are retained in `tiles.json`. All 29 source headers name only SRTM,
GMTED and ETOPO1. No EU-DEM or Austrian high-resolution source is claimed.

SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey.
Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration.
DOC/NOAA/NESDIS/NCEI > National Centers for Environmental Information,
NESDIS, NOAA, U.S. Department of Commerce.
The incorporated U.S. Government data is not subject to copyright protection
within the United States.

The derived diagnostic reprojects Web Mercator tiles into the game's spherical
Lambert azimuthal equal-area coordinates, bilinearly resamples the decoded
meter heights to 2km nodes, and presents nonnegative elevations at 10× vertical
exaggeration with a 0.5 render-km base and existing coastal attenuation. This is
modified visualization data, not survey/navigation data; no source agency
endorses the modifications.

Source notices and terms:
https://github.com/tilezen/joerd/blob/master/docs/attribution.md
https://github.com/tilezen/joerd/blob/master/docs/data-sources.md
https://github.com/tilezen/joerd/blob/master/docs/formats.md
