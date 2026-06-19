'use client';

import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import type { Layer, LeafletMouseEvent, Path, PathOptions } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoRisk } from '@/types';

interface Props {
  riskData: GeoRisk[];
  geoJson: GeoJSON.FeatureCollection;
  onProvinceClick: (province: GeoRisk | null) => void;
}

function riskColor(score: number): string {
  if (score >= 80) return '#dc2626';
  if (score >= 60) return '#ea580c';
  if (score >= 40) return '#ca8a04';
  return '#16a34a';
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Word-overlap score using strict word equality (no prefix matching) to avoid
// false positives like "Haiphong" matching "Hà Nội" via shared "ha"/"hai" prefix.
function overlapScore(a: string, b: string): number {
  const stopWords = new Set(['tinh', 'thanh', 'pho', 'city', 'province', 'tp']);
  const words = (s: string) => s.split(' ').filter((w) => w.length > 1 && !stopWords.has(w));
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return 0;
  const shorter = wa.length <= wb.length ? wa : wb;
  const longer = wa.length <= wb.length ? wb : wa;
  const longerSet = new Set(longer);
  const hits = shorter.filter((w) => longerSet.has(w));
  return hits.length / shorter.length;
}

function buildIndex(riskData: GeoRisk[]): Map<string, GeoRisk> {
  const idx = new Map<string, GeoRisk>();
  for (const r of riskData) {
    idx.set(normalize(r.province_name), r);
  }
  return idx;
}

function lookupRisk(featureName: string, idx: Map<string, GeoRisk>): GeoRisk | undefined {
  if (!featureName) return undefined;
  const key = normalize(featureName);

  // 1. Exact normalized match (catches 59/63 provinces)
  if (idx.has(key)) return idx.get(key);

  // 2. Joined no-space match — handles "Haiphong" → "Hải Phòng"
  const keyJoined = key.replace(/\s+/g, '');
  for (const [dbKey, risk] of Array.from(idx)) {
    if (dbKey.replace(/\s+/g, '') === keyJoined) return risk;
  }

  // 3. Word-overlap fallback — handles "Hồ Chí Minh city" → "TP. Hồ Chí Minh"
  //    and "Huế" → "Thừa Thiên Huế". Threshold 0.6 to reject "Southeast" etc.
  let best: GeoRisk | undefined;
  let bestScore = 0;
  for (const [dbKey, risk] of Array.from(idx)) {
    const score = overlapScore(key, dbKey);
    if (score > bestScore) {
      bestScore = score;
      best = risk;
    }
  }
  if (bestScore >= 0.6) return best;

  return undefined;
}

export default function LeafletMap({ riskData, geoJson, onProvinceClick }: Props) {
  const riskIndex = buildIndex(riskData);

  const style = (feature?: GeoJSON.Feature): PathOptions => {
    const name: string =
      feature?.properties?.name ??
      feature?.properties?.Name ??
      feature?.properties?.NAME ??
      feature?.properties?.['woe-name'] ??
      '';
    const risk = lookupRisk(name, riskIndex);
    return {
      fillColor: risk ? riskColor(risk.overall_risk_score) : '#cbd5e1',
      fillOpacity: 0.75,
      color: '#ffffff',
      weight: 1,
    };
  };

  const onEachFeature = (feature: GeoJSON.Feature, layer: Layer) => {
    const name: string =
      feature?.properties?.name ??
      feature?.properties?.Name ??
      feature?.properties?.NAME ??
      feature?.properties?.['woe-name'] ??
      '';
    const risk = lookupRisk(name, riskIndex);

    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        (e.target as Path).setStyle({ fillOpacity: 0.95, weight: 2, color: '#1e40af' });
      },
      mouseout: (e: LeafletMouseEvent) => {
        (e.target as Path).setStyle({ fillOpacity: 0.75, weight: 1, color: '#ffffff' });
      },
      click: () => onProvinceClick(risk ?? null),
    });

    const label = risk
      ? `${risk.province_name} — ${risk.overall_risk_score}/100`
      : name;
    layer.bindTooltip(label, { permanent: false, direction: 'auto', sticky: true });
  };

  return (
    <MapContainer
      center={[16.047, 108.206]}
      zoom={6}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        key={riskData.length}
        data={geoJson}
        style={style}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  );
}
