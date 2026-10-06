'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, ZoomControl, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Layer, LeafletMouseEvent, Path, PathOptions } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoRisk, Partner } from '@/types';

export type DisasterFilterType = 'all' | 'storm' | 'flood' | 'landslide' | 'inundation' | 'drought';
export type BaseMapLayerType = 'light' | 'streets' | 'satellite';
export type PartnerFilterType = 'all' | 'garage' | 'hospital' | 'rescue' | 'none';

interface Props {
  riskData: GeoRisk[];
  geoJson: GeoJSON.FeatureCollection;
  selectedProvince: GeoRisk | null;
  activeDisaster?: DisasterFilterType;
  baseMap?: BaseMapLayerType;
  partners?: Partner[];
  activePartnerType?: PartnerFilterType;
  userLocation?: { lat: number; lng: number } | null;
  resetTrigger?: number;
  showWeatherOverlay?: boolean;
  onProvinceClick: (province: GeoRisk | null) => void;
  onPartnerClick?: (partner: Partner) => void;
}

const DISASTER_HOTSPOTS = [
  { name: 'Hà Tĩnh', lat: 18.35, lng: 105.90, type: 'storm' as const, alert: 'Tâm bão số 4 · Gió giật cấp 12' },
  { name: 'Quảng Bình', lat: 17.48, lng: 106.60, type: 'flood' as const, alert: 'Mực nước sông Gianh vượt Báo động 3' },
  { name: 'Thừa Thiên Huế', lat: 16.46, lng: 107.59, type: 'flood' as const, alert: 'Mưa lớn lũ quét thượng nguồn' },
  { name: 'Quảng Nam', lat: 15.59, lng: 108.00, type: 'storm' as const, alert: 'Triều cường sóng biển dâng cao 3.5m' },
  { name: 'Nghệ An', lat: 19.30, lng: 104.90, type: 'landslide' as const, alert: 'Nguy cơ sạt lở đồi dốc cục bộ' },
];

function createDisasterHotspotIcon(type: 'storm' | 'flood' | 'landslide') {
  const isStorm = type === 'storm';
  const icon = isStorm ? '🌀' : type === 'flood' ? '🌊' : '⚠️';
  const ringColor = isStorm ? 'rgba(239, 68, 68, 0.8)' : 'rgba(46, 150, 255, 0.8)';
  const bg = isStorm ? '#dc2626' : '#2563eb';
  return L.divIcon({
    className: 'custom-disaster-marker',
    html: `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <span style="position: absolute; inset: 0; border-radius: 50%; border: 2px solid ${ringColor};" class="animate-beacon-ping"></span>
        <div style="width: 30px; height: 30px; border-radius: 50%; background-color: ${bg}; color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);" class="${isStorm ? 'animate-spin-medium' : ''}">
          ${icon}
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -18],
  });
}

function createPartnerIcon(type: 'garage' | 'hospital' | 'rescue') {
  const bg = type === 'hospital' ? '#ef4444' : type === 'garage' ? '#2563eb' : '#f59e0b';
  const iconText = type === 'hospital' ? '🏥' : type === 'garage' ? '🔧' : '🚨';
  return L.divIcon({
    className: 'custom-partner-marker',
    html: `<div style="background-color: ${bg}; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; box-shadow: 0 3px 8px rgba(0,0,0,0.35); border: 2.5px solid white;">${iconText}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
}

function createUserLocationIcon() {
  return L.divIcon({
    className: 'custom-user-marker',
    html: `<div style="background-color: #3b82f6; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 7px rgba(59, 130, 246, 0.4); border: 3px solid white;"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function riskColor(score: number): string {
  if (score >= 80) return '#dc2626'; // Đỏ đậm - Rất cao
  if (score >= 60) return '#ea580c'; // Cam - Cao
  if (score >= 40) return '#d97706'; // Vàng cam - Trung bình
  return '#16a34a';                  // Xanh lá - Thấp
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

  // 1. Exact normalized match
  if (idx.has(key)) return idx.get(key);

  // 2. Joined no-space match (e.g. Haiphong -> Hai Phong)
  const keyJoined = key.replace(/\s+/g, '');
  for (const [dbKey, risk] of Array.from(idx)) {
    if (dbKey.replace(/\s+/g, '') === keyJoined) return risk;
  }

  // 3. Word-overlap fallback
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

function getScore(risk: GeoRisk | undefined, disasterType: DisasterFilterType): number {
  if (!risk) return 0;
  if (disasterType === 'all') return risk.overall_risk_score;
  const item = risk.disaster_risks.find(d => d.type === disasterType);
  return item ? item.risk_score : 0;
}

function MapController({
  selectedProvince,
  geoJson,
  resetTrigger,
}: {
  selectedProvince: GeoRisk | null;
  geoJson: GeoJSON.FeatureCollection;
  resetTrigger?: number;
}) {
  const map = useMap();

  // Invalidate map size on mount and container size changes so tiles render completely
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);

    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  // Reset to full Vietnam view when triggered
  useEffect(() => {
    if (resetTrigger && resetTrigger > 0) {
      map.fitBounds([
        [8.18, 102.14],
        [23.39, 109.46],
      ], { padding: [30, 30] });
    }
  }, [resetTrigger, map]);

  // Zoom and pan to selected province
  useEffect(() => {
    if (!selectedProvince) return;
    const targetNorm = normalize(selectedProvince.province_name);
    const targetFeature = geoJson.features.find(f => {
      const pName = normalize(f.properties?.name || '');
      return pName === targetNorm || pName.includes(targetNorm) || targetNorm.includes(pName);
    });

    if (targetFeature) {
      try {
        const bounds = L.geoJSON(targetFeature).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { maxZoom: 8, padding: [50, 50] });
        }
      } catch {
        // ignore bounds calculation error
      }
    }
  }, [selectedProvince, geoJson, map]);

  return null;
}

export default function LeafletMap({
  riskData,
  geoJson,
  selectedProvince,
  activeDisaster = 'all',
  baseMap = 'streets',
  partners = [],
  activePartnerType = 'all',
  userLocation,
  resetTrigger = 0,
  showWeatherOverlay = false,
  onProvinceClick,
  onPartnerClick,
}: Props) {
  const riskIndex = buildIndex(riskData);

  const style = (feature: any): PathOptions => {
    const name = feature.properties?.name || '';
    const risk = riskIndex.get(normalize(name));
    const score = getScore(risk, activeDisaster);
    const isSelected = selectedProvince && risk && (
      normalize(selectedProvince.province_name) === normalize(risk.province_name)
    );

    return {
      fillColor: riskColor(score),
      weight: isSelected ? 3 : 1.2,
      opacity: 1,
      color: isSelected ? '#1e3a8a' : '#ffffff',
      dashArray: isSelected ? '4 2' : undefined,
      fillOpacity: isSelected ? 0.92 : 0.72,
    };
  };

  const onEachFeature = (feature: any, layer: Layer) => {
    const name = feature.properties?.name || '';
    const risk = riskIndex.get(normalize(name));
    const score = getScore(risk, activeDisaster);

    layer.on({
      mouseover: (e: LeafletMouseEvent) => {
        (e.target as Path).setStyle({ fillOpacity: 0.95, weight: 2.5, color: '#1e3a8a' });
      },
      mouseout: (e: LeafletMouseEvent) => {
        const isSelected = selectedProvince && risk && (
          normalize(selectedProvince.province_name) === normalize(risk.province_name)
        );
        (e.target as Path).setStyle({
          fillOpacity: isSelected ? 0.92 : 0.72,
          weight: isSelected ? 3 : 1.2,
          color: isSelected ? '#1e3a8a' : '#ffffff',
        });
      },
      click: () => onProvinceClick(risk ?? null),
    });

    const disasterLabel = activeDisaster === 'all'
      ? 'Chỉ số rủi ro tổng hợp'
      : `Rủi ro ${activeDisaster}`;

    const tooltipContent = `
      <div style="font-family: inherit; font-size: 12px; line-height: 1.4; color: #1e293b;">
        <div style="font-weight: 700; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 4px;">
          ${name}
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="color: #64748b;">${disasterLabel}:</span>
          <span style="font-weight: 800; color: ${riskColor(score)};">${score}/100</span>
        </div>
        ${risk?.risk_factors && risk.risk_factors.length > 0 ? `
          <div style="margin-top: 4px; font-size: 11px; color: #475569;">
            ${risk.risk_factors.slice(0, 2).map((f) => `• ${f}`).join('<br/>')}
          </div>
        ` : ''}
      </div>
    `;

    layer.bindTooltip(tooltipContent, {
      sticky: true,
      direction: 'top',
      offset: [0, -10],
      className: 'leaflet-clean-tooltip',
    });
  };

  return (
    <div className="relative w-full h-full">
      {/* Dynamic Rain Overlay Canvas Effect */}
      {showWeatherOverlay && (
        <div className="rain-overlay absolute inset-0 z-[400] pointer-events-none opacity-60" />
      )}

      <MapContainer
        center={[16.0, 107.5]}
        zoom={6}
        className="h-full w-full"
        zoomControl={false}
      >
        {baseMap === 'streets' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            maxZoom={19}
            subdomains="abcd"
          />
        )}
        {baseMap === 'light' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            maxZoom={19}
            subdomains="abcd"
          />
        )}
        {baseMap === 'satellite' && (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
          />
        )}

        <ZoomControl position="bottomright" />

        <MapController
          selectedProvince={selectedProvince}
          geoJson={geoJson}
          resetTrigger={resetTrigger}
        />

        <GeoJSON
          key={`${riskData.length}-${activeDisaster}-${baseMap}-${selectedProvince?.province_name ?? 'none'}`}
          data={geoJson}
          style={style}
          onEachFeature={onEachFeature}
        />

        {/* Live Weather & Cyclone / Flood Hotspot Markers */}
        {showWeatherOverlay &&
          DISASTER_HOTSPOTS.map((spot, i) => (
            <Marker
              key={`hotspot-${i}`}
              position={[spot.lat, spot.lng]}
              icon={createDisasterHotspotIcon(spot.type)}
            >
              <Popup>
                <div className="p-1 text-xs space-y-1.5 max-w-[230px]">
                  <div className="flex items-center justify-between gap-1.5 font-bold text-slate-900 border-b pb-1">
                    <span className="flex items-center gap-1">
                      {spot.type === 'storm' ? '🌀 Tâm bão' : '🌊 Vùng lũ lụt'}
                    </span>
                    <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded-full font-extrabold animate-pulse">
                      CẢNH BÁO
                    </span>
                  </div>
                  <p className="font-bold text-[#13426f] text-sm">{spot.name}</p>
                  <p className="text-[11px] text-slate-600 font-medium">{spot.alert}</p>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 text-[10px] text-emerald-800 font-semibold flex items-center gap-1">
                    <span>✓ Kích hoạt bồi thường tự động 24h</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Vị trí người dùng nếu có */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={createUserLocationIcon()}
          >
            <Popup>
              <div className="text-xs font-semibold text-blue-900 p-1">
                📍 Vị trí hiện tại của bạn
              </div>
            </Popup>
          </Marker>
        )}

        {/* Mạng lưới đối tác bảo lãnh & cứu hộ */}
        {activePartnerType !== 'none' &&
          partners.map((p) => {
            if (activePartnerType !== 'all' && p.partner_type !== activePartnerType) return null;
            return (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={createPartnerIcon(p.partner_type)}
                eventHandlers={{
                  click: () => onPartnerClick?.(p),
                }}
              >
                <Popup>
                  <div className="p-1 max-w-[260px] font-sans text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2 border-b pb-1">
                      <span className="font-bold text-gray-900 leading-snug">{p.name}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 uppercase shrink-0">
                        {p.partner_type === 'hospital' ? 'Bệnh viện' : p.partner_type === 'garage' ? 'Gara' : 'Cứu hộ'}
                      </span>
                    </div>
                    <div className="text-gray-600 text-[11px] leading-relaxed">{p.address}</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        ✓ Bảo lãnh trực tiếp
                      </span>
                      <span className="text-amber-600 font-bold">★ {p.rating}</span>
                    </div>
                    <div className="pt-1 flex items-center justify-between gap-1.5">
                      <a
                        href={`tel:${p.hotline || p.phone}`}
                        className="flex-1 bg-amber-400 hover:bg-amber-300 font-extrabold py-1.5 px-2 rounded-lg text-center text-[11px] flex items-center justify-center gap-1 shadow-xs border border-amber-500 transition-colors"
                        style={{ color: '#000000' }}
                      >
                        📞 <span style={{ color: '#000000' }}>Gọi {p.hotline || p.phone}</span>
                      </a>
                      <a
                        href={
                          userLocation
                            ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${p.lat},${p.lng}&travelmode=driving`
                            : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="bg-sky-100 hover:bg-sky-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] text-center flex items-center gap-1 shadow-xs transition-colors shrink-0 border border-sky-300"
                        style={{ color: '#000000' }}
                        title="Mở chỉ đường Google Maps lái xe trực tiếp"
                      >
                        🧭 <span style={{ color: '#000000' }}>Chỉ đường</span>
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
}
