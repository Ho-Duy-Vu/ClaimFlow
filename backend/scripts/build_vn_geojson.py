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
import unicodedata
from urllib.request import Request, urlopen

import pyproj

SOURCE_URL = "https://code.highcharts.com/mapdata/countries/vn/vn-all.geo.json"
OUTPUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "public", "vietnam-provinces.geojson"
)

PROVINCES = [
    'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu',
    'Bắc Ninh', 'Bến Tre', 'Bình Định', 'Bình Dương', 'Bình Phước',
    'Bình Thuận', 'Cà Mau', 'Cần Thơ', 'Cao Bằng', 'Đà Nẵng',
    'Đắk Lắk', 'Đắk Nông', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp',
    'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội', 'Hà Tĩnh',
    'Hải Dương', 'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên',
    'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu', 'Lâm Đồng',
    'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định', 'Nghệ An',
    'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên', 'Quảng Bình',
    'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng',
    'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa',
    'Thừa Thiên Huế', 'Tiền Giang', 'TP. Hồ Chí Minh', 'Trà Vinh', 'Tuyên Quang',
    'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái',
]

def norm(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn').replace('đ','d').replace('.','').replace('-',' ').replace(' ', '')

NORM_MAP = {norm(p): p for p in PROVINCES}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"Downloading {SOURCE_URL}...")
    req = Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as resp:
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
        p = f["properties"]
        name = p.get("name", "")
        hc_key = p.get("hc-key", "")

        # Highcharts maps Dong Nai with name 'Southeast', woe-label 'Dong Nai'
        if name == "Southeast" or p.get("hc-a2") == "DN" or hc_key == "vn-331":
            c_name = "Đồng Nai"
            iso = "VN-39"
        elif name in ("Huế", "Hue") or "hue" in name.lower() or hc_key == "vn-tt":
            c_name = "Thừa Thiên Huế"
            iso = "VN-26"
        elif "chi minh" in name.lower() or hc_key == "vn-hc":
            c_name = "TP. Hồ Chí Minh"
            iso = "VN-SG"
        elif norm(name) in NORM_MAP:
            c_name = NORM_MAP[norm(name)]
            iso = p.get("iso_3166_2")
        elif norm(p.get("woe-name", "")) in NORM_MAP:
            c_name = NORM_MAP[norm(p.get("woe-name", ""))]
            iso = p.get("iso_3166_2")
        else:
            c_name = name
            iso = p.get("iso_3166_2")

        new_f = {
            "type": "Feature",
            "properties": {
                "name": c_name,
                "name_local": c_name,
                "iso_3166_2": iso,
                "hc-key": hc_key,
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
        "title": "Vietnam provinces (WGS84) - Full 63 Provinces",
        "note": "Converted from Highcharts vn-all.geo.json with all 63 provinces mapped to standard names.",
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
