"""
Build frontend/public/vietnam-provinces.geojson by downloading the Highcharts
Vietnam map and converting its UTM-48N projected coordinates to WGS84 lat/lng
that Leaflet can render directly.

The Highcharts file uses a pre-transformed UTM48N coordinate system. The
inverse transform is:
    utm_x = (pre_x - jsonmarginX) / (scale * jsonres) + xoffset
    utm_y = (pre_y - jsonmarginY) / (scale * jsonres) + yoffset
then pyproj converts UTM48N → WGS84.

Run:
    cd backend
    python scripts/build_vn_geojson.py
"""

import json
import os
import sys
from urllib.request import urlopen

import pyproj

SOURCE_URL = "https://code.highcharts.com/mapdata/countries/vn/vn-all.geo.json"
OUTPUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "public", "vietnam-provinces.geojson"
)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"Downloading {SOURCE_URL}...")
    with urlopen(SOURCE_URL, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    t = data["hc-transform"]["default"]
    factor = t["scale"] * t["jsonres"]
    transformer = pyproj.Transformer.from_crs(32648, 4326, always_xy=True)

    def to_lnglat(pt: list[float]) -> list[float]:
        utm_x = (pt[0] - t["jsonmarginX"]) / factor + t["xoffset"]
        utm_y = (pt[1] - t["jsonmarginY"]) / factor + t["yoffset"]
        lng, lat = transformer.transform(utm_x, utm_y)
        return [round(lng, 5), round(lat, 5)]

    features = []
    for f in data["features"]:
        if f["properties"].get("name") == "Southeast":
            continue  # region label in source data, not a real province
        p = f["properties"]
        new_f = {
            "type": "Feature",
            "properties": {
                "name": p.get("name"),
                "name_local": p.get("woe-name"),
                "iso_3166_2": p.get("iso_3166_2"),
                "hc-key": p.get("hc-key"),
            },
        }
        g = f["geometry"]
        if g["type"] == "Polygon":
            new_f["geometry"] = {
                "type": "Polygon",
                "coordinates": [[to_lnglat(pt) for pt in ring] for ring in g["coordinates"]],
            }
        elif g["type"] == "MultiPolygon":
            new_f["geometry"] = {
                "type": "MultiPolygon",
                "coordinates": [
                    [[to_lnglat(pt) for pt in ring] for ring in poly]
                    for poly in g["coordinates"]
                ],
            }
        else:
            new_f["geometry"] = g
        features.append(new_f)

    out = {
        "type": "FeatureCollection",
        "title": "Vietnam provinces (WGS84)",
        "note": "Converted from Highcharts vn-all.geo.json (UTM48N -> EPSG:4326) for Leaflet.",
        "source": SOURCE_URL,
        "features": features,
    }

    out_path = os.path.abspath(OUTPUT)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path}")
    print(f"  Features: {len(features)}")
    print(f"  Size: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
