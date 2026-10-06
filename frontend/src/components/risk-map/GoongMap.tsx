'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import type { GeoRisk, Partner } from '@/types';
import { GOONG_MAPTILES_KEY } from '@/lib/goong';
import type { DisasterFilterType, PartnerFilterType } from './LeafletMap';

interface Props {
  riskData: GeoRisk[];
  geoJson: GeoJSON.FeatureCollection;
  selectedProvince: GeoRisk | null;
  activeDisaster?: DisasterFilterType;
  partners?: Partner[];
  activePartnerType?: PartnerFilterType;
  userLocation?: { lat: number; lng: number } | null;
  resetTrigger?: number;
  showWeatherOverlay?: boolean;
  routeCoordinates?: [number, number][] | null;
  routeInfo?: { distance: string; duration: string; destinationName: string } | null;
  sidePanelOpen?: boolean;
  onClearRoute?: () => void;
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

function normalize(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function getScore(risk: GeoRisk | undefined, disasterType: DisasterFilterType): number {
  if (!risk) return 0;
  if (disasterType === 'all') return risk.overall_risk_score;
  const item = risk.disaster_risks.find((d) => d.type === disasterType);
  return item ? item.risk_score : 0;
}

export default function GoongMap({
  riskData,
  geoJson,
  selectedProvince,
  activeDisaster = 'all',
  partners = [],
  activePartnerType = 'all',
  userLocation,
  resetTrigger = 0,
  showWeatherOverlay = false,
  routeCoordinates = null,
  routeInfo = null,
  sidePanelOpen = true,
  onClearRoute,
  onProvinceClick,
  onPartnerClick,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);

  // Index riskData by normalized name
  const riskIndex = useMemo(() => {
    const idx = new Map<string, GeoRisk>();
    for (const r of riskData) {
      idx.set(normalize(r.province_name), r);
    }
    return idx;
  }, [riskData]);

  // Enriched GeoJSON with risk_score property
  const enrichedGeoJson = useMemo(() => {
    if (!geoJson) return null;
    const features = geoJson.features.map((f) => {
      const name = f.properties?.name || '';
      const risk = riskIndex.get(normalize(name));
      const score = getScore(risk, activeDisaster);
      return {
        ...f,
        properties: {
          ...f.properties,
          risk_score: score,
          province_name: risk?.province_name || name,
        },
      };
    });
    return { ...geoJson, features } as GeoJSON.FeatureCollection;
  }, [geoJson, riskIndex, activeDisaster]);

  // 1. Initialize Goong JS Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let isMounted = true;

    async function initGoongMap() {
      try {
        const goongjsModule = await import('@goongmaps/goong-js');
        const goongjs = goongjsModule.default || goongjsModule;

        // Import CSS
        await import('@goongmaps/goong-js/dist/goong-js.css');

        if (!isMounted || !mapContainerRef.current) return;

        goongjs.accessToken = GOONG_MAPTILES_KEY;

        const map = new goongjs.Map({
          container: mapContainerRef.current,
          style: `https://tiles.goong.io/assets/goong_map_web.json?api_key=${GOONG_MAPTILES_KEY}`,
          center: [106.5, 16.2], // [lng, lat]
          zoom: 5.6,
          attributionControl: false,
        });

        // Add standard navigation control
        map.addControl(new goongjs.NavigationControl(), 'bottom-right');

        map.on('load', () => {
          if (!isMounted) return;
          mapRef.current = map;
          setIsMapReady(true);

          // Add GeoJSON source
          if (enrichedGeoJson) {
            map.addSource('provinces', {
              type: 'geojson',
              data: enrichedGeoJson,
            });

            // Choropleth Fill Layer
            map.addLayer({
              id: 'provinces-fill',
              type: 'fill',
              source: 'provinces',
              paint: {
                'fill-color': [
                  'step',
                  ['get', 'risk_score'],
                  '#16a34a', // score < 40: Green
                  40,
                  '#f59e0b', // 40-59: Yellow
                  60,
                  '#f97316', // 60-79: Orange
                  80,
                  '#dc2626', // >= 80: Red
                ],
                'fill-opacity': 0.72,
              },
            });

            // Boundary Outline Layer
            map.addLayer({
              id: 'provinces-line',
              type: 'line',
              source: 'provinces',
              paint: {
                'line-color': '#ffffff',
                'line-width': 1.2,
                'line-opacity': 0.9,
              },
            });

            // Selected Highlight Layer
            map.addLayer({
              id: 'provinces-highlight',
              type: 'line',
              source: 'provinces',
              paint: {
                'line-color': '#13426f',
                'line-width': 3,
                'line-dasharray': [3, 2],
              },
              filter: ['==', 'province_name', selectedProvince?.province_name || ''],
            });

            // Interactivity: Click on province
            map.on('click', 'provinces-fill', (e: any) => {
              if (e.features && e.features.length > 0) {
                const props = e.features[0].properties;
                const pName = props.province_name || props.name;
                const matched = riskIndex.get(normalize(pName));
                onProvinceClick(matched || null);
              }
            });

            // Cursor styling on hover
            map.on('mouseenter', 'provinces-fill', () => {
              map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'provinces-fill', () => {
              map.getCanvas().style.cursor = '';
            });
          }
        });
      } catch (err) {
        console.error('[GoongMap] Failed to initialize map:', err);
      }
    }

    initGoongMap();

    return () => {
      isMounted = false;
      setIsMapReady(false);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Update GeoJSON data when activeDisaster or riskData changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('provinces');
    if (source && enrichedGeoJson) {
      source.setData(enrichedGeoJson);
    }
  }, [enrichedGeoJson]);

  // 3. Update highlight and zoom when selectedProvince changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('provinces-highlight')) {
      map.setFilter('provinces-highlight', [
        '==',
        'province_name',
        selectedProvince?.province_name || '',
      ]);
    }

    if (selectedProvince && geoJson) {
      const targetNorm = normalize(selectedProvince.province_name);
      const targetFeature = geoJson.features.find((f) => {
        const pName = normalize(f.properties?.name || '');
        return pName === targetNorm || pName.includes(targetNorm) || targetNorm.includes(pName);
      });

      if (targetFeature && targetFeature.geometry) {
        // Calculate bbox of geometry coordinates
        try {
          const coords = (targetFeature.geometry as any).coordinates;
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;

          const traverse = (arr: any) => {
            if (typeof arr[0] === 'number') {
              const [x, y] = arr;
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            } else {
              for (const sub of arr) traverse(sub);
            }
          };

          traverse(coords);

          if (minX !== Infinity && maxX !== -Infinity) {
            map.fitBounds(
              [
                [minX, minY],
                [maxX, maxY],
              ],
              { padding: 50, maxZoom: 8.5 }
            );
          }
        } catch {
          // ignore bounds calculation error
        }
      }
    }
  }, [selectedProvince, geoJson]);

  // 4. Handle Reset trigger: ONLY zoom to full Vietnam when user explicitly cancels/resets
  const prevResetTriggerRef = useRef(resetTrigger);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (resetTrigger === 0 || resetTrigger === prevResetTriggerRef.current) return;
    prevResetTriggerRef.current = resetTrigger;

    map.fitBounds(
      [
        [102.14, 8.18],
        [109.46, 23.39],
      ],
      { padding: { top: 40, bottom: 40, left: 40, right: sidePanelOpen ? 420 : 40 }, duration: 800 }
    );
  }, [resetTrigger, sidePanelOpen]);

  // 4.1. Handle Route Polylines from Goong Direction API
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = 'goong-route-source';
    const casingId = 'goong-route-casing';
    const lineId = 'goong-route-line';

    if (!routeCoordinates || routeCoordinates.length === 0) {
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getLayer(casingId)) map.removeLayer(casingId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const geojsonRoute = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routeCoordinates,
      },
    };

    const existingSource = map.getSource(sourceId);
    if (existingSource) {
      existingSource.setData(geojsonRoute);
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojsonRoute,
      });

      map.addLayer({
        id: casingId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#0f172a',
          'line-width': 8,
          'line-opacity': 0.7,
        },
      });

      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#2e96ff',
          'line-width': 5,
          'line-opacity': 0.95,
        },
      });
    }

    // Auto-fit camera to route bounds
    try {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const [lng, lat] of routeCoordinates) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
      if (minLng !== Infinity && maxLng !== -Infinity) {
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: { top: 90, bottom: 60, left: 60, right: 60 }, maxZoom: 14 }
        );
      }
    } catch {
      // ignore bounds error
    }
  }, [routeCoordinates]);

  // 5. Render Markers (Hotspots, Partners, User Location)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    // Clear existing markers
    for (const m of markersRef.current) {
      m.remove();
    }
    markersRef.current = [];

    import('@goongmaps/goong-js').then((goongjsModule) => {
      const goongjs = goongjsModule.default || goongjsModule;

      // 5.1. Partner Markers (Clean GIS Droplet Pins with proper coordinate tracking)
      if (activePartnerType !== 'none') {
        partners.forEach((p) => {
          if (activePartnerType !== 'all' && p.partner_type !== activePartnerType) return;
          if (!p.lat || !p.lng) return;

          let bg = '#2563eb';
          let iconColor = '#2563eb';
          let innerSvg = '';

          if (p.partner_type === 'hospital') {
            bg = '#ef4444'; // Red Hospital
            iconColor = '#ef4444';
            innerSvg = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="${iconColor}">
                <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z"/>
              </svg>
            `;
          } else if (p.partner_type === 'garage') {
            bg = '#2563eb'; // Blue Garage
            iconColor = '#2563eb';
            innerSvg = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            `;
          } else {
            bg = '#f59e0b'; // Amber Rescue
            iconColor = '#d97706';
            innerSvg = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="${iconColor}">
                <path d="M13 2L4 14h7v8l9-12h-7V2z"/>
              </svg>
            `;
          }

          // Outer element MUST NOT have inline position:relative or transform, as GoongJS/Mapbox controls them
          const el = document.createElement('div');
          el.className = 'custom-partner-marker cursor-pointer';

          el.innerHTML = `
            <div class="partner-pin-inner" style="position: relative; display: flex; flex-direction: column; align-items: center; transition: transform 0.16s ease-out; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35));">
              <div class="partner-tooltip" style="position: absolute; bottom: calc(100% + 4px); background: rgba(15, 23, 42, 0.95); color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px; white-space: nowrap; pointer-events: none; opacity: 0; transform: translateY(4px); transition: all 0.15s ease-out; box-shadow: 0 4px 10px rgba(0,0,0,0.3); z-index: 10000; border: 1px solid rgba(255,255,255,0.15);">
                ${p.name}
              </div>
              <div style="position: relative; width: 24px; height: 30px;">
                <svg width="24" height="30" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 30 12 30C12 30 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="${bg}" stroke="#ffffff" stroke-width="1.8"/>
                  <circle cx="12" cy="11" r="7" fill="#ffffff"/>
                </svg>
                <div style="position: absolute; top: 5px; left: 0; width: 24px; height: 12px; display: flex; justify-content: center; align-items: center;">
                  ${innerSvg}
                </div>
              </div>
            </div>
          `;

          const pinInner = el.querySelector('.partner-pin-inner') as HTMLElement | null;
          const tooltip = el.querySelector('.partner-tooltip') as HTMLElement | null;

          if (pinInner) {
            el.addEventListener('mouseenter', () => {
              pinInner.style.transform = 'scale(1.25) translateY(-3px)';
              el.style.zIndex = '9999';
              if (tooltip) {
                tooltip.style.opacity = '1';
                tooltip.style.transform = 'translateY(0)';
              }
            });

            el.addEventListener('mouseleave', () => {
              pinInner.style.transform = 'scale(1) translateY(0)';
              el.style.zIndex = '1';
              if (tooltip) {
                tooltip.style.opacity = '0';
                tooltip.style.transform = 'translateY(4px)';
              }
            });
          }

          el.addEventListener('click', () => {
            onPartnerClick?.(p);
          });

          const marker = new goongjs.Marker({ element: el, offset: [0, -15] })
            .setLngLat([p.lng, p.lat])
            .addTo(map);

          markersRef.current.push(marker);
        });
      }

      // 5.2. User Location Marker
      if (userLocation) {
        const el = document.createElement('div');
        el.className = 'custom-user-marker';
        el.innerHTML = `
          <div style="background-color: #3b82f6; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 7px rgba(59, 130, 246, 0.4); border: 3px solid white;"></div>
        `;

        const popup = new goongjs.Popup({ offset: 20 }).setHTML(`
          <div style="font-size: 11px; font-weight: bold; color: #1e3a8a; padding: 2px;">
            📍 Vị trí hiện tại của bạn
          </div>
        `);

        const marker = new goongjs.Marker({ element: el })
          .setLngLat([userLocation.lng, userLocation.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      }
    });
  }, [isMapReady, showWeatherOverlay, partners, activePartnerType, userLocation]);

  // 6. Handle container resize (e.g. collapsing/expanding side inspector panel)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.resize();
      const t1 = setTimeout(() => mapRef.current?.resize(), 100);
      const t2 = setTimeout(() => mapRef.current?.resize(), 300);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [sidePanelOpen]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Custom Styles for Goong / Mapbox Popups and Close Button */}
      <style jsx global>{`
        .mapboxgl-popup-close-button,
        .goongjs-popup-close-button {
          font-size: 16px !important;
          color: #0f172a !important;
          background: #f1f5f9 !important;
          border-radius: 9999px !important;
          width: 26px !important;
          height: 26px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          top: 6px !important;
          right: 6px !important;
          border: 1.5px solid #cbd5e1 !important;
          cursor: pointer !important;
          line-height: 1 !important;
          font-weight: 900 !important;
          transition: all 0.15s ease !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important;
        }
        .mapboxgl-popup-close-button:hover,
        .goongjs-popup-close-button:hover {
          background: #e2e8f0 !important;
          color: #dc2626 !important;
          border-color: #94a3b8 !important;
          transform: scale(1.05) !important;
        }
        .mapboxgl-popup-content,
        .goongjs-popup-content {
          border-radius: 16px !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
          padding: 12px 14px !important;
          border: 1px solid #e2e8f0 !important;
        }
      `}</style>

      {/* Rain Canvas Overlay */}
      {showWeatherOverlay && (
        <div
          className="rain-overlay pointer-events-none absolute inset-0 z-[10]"
          aria-hidden="true"
        />
      )}

      {/* Active Route HUD Overlay */}
      {routeInfo && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl border border-blue-200 flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
            🚗
          </div>
          <div>
            <div className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
              <span>Lộ trình Goong Navigation</span>
              <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.2 rounded-full">REALTIME</span>
            </div>
            <div className="text-xs font-black text-slate-800">
              {routeInfo.distance} · {routeInfo.duration}
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-1 max-w-[200px] sm:max-w-xs">
              Đích: {routeInfo.destinationName}
            </div>
          </div>
          {onClearRoute && (
            <button
              onClick={onClearRoute}
              className="ml-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 font-bold text-xs border border-slate-300 hover:border-red-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="Đóng dẫn đường & xóa lộ trình"
            >
              <span>✕</span>
              <span>Đóng</span>
            </button>
          )}
        </div>
      )}

      {/* Goong WebGL Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}
