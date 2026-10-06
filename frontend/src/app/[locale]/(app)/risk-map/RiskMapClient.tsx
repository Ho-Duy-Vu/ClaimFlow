'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle, ArrowRight, CheckCircle, ChevronDown, ChevronRight, Compass,
  Info, Layers, Loader2, MapPin, Navigation, Search, Shield, ShieldAlert,
  Sparkles, TrendingUp, WifiOff, X, Eye, PhoneCall, Wrench, Building2, Siren, QrCode,
  HeartPulse, Star,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { detectUserProvince, normalizeVnText } from '@/lib/location';
import { AnimatedRainIcon, AnimatedRadarBeacon, AnimatedWaveIcon, AnimatedCycloneIcon } from '@/components/weather/WeatherIcons';
import type { GeoRisk, Partner, SOSTicket } from '@/types';
import api from '@/lib/api';
import type { DisasterFilterType, BaseMapLayerType, PartnerFilterType } from '@/components/risk-map/LeafletMap';
import { getDirectionRouteGoong, getDistanceMatrixGoong } from '@/lib/goong';

async function fetchGeoJson(): Promise<GeoJSON.FeatureCollection> {
  const r = await fetch('/vietnam-provinces.geojson');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as GeoJSON.FeatureCollection;
}

const GoongMap = dynamic(() => import('@/components/risk-map/GoongMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  ),
});

function RiskBadge({ score }: { score: number }) {
  const t = useTranslations('geo');
  if (score >= 80)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-red-600 px-2.5 py-1 rounded-full shadow-xs">
        <AlertTriangle size={12} /> {t('veryHighRisk')}
      </span>
    );
  if (score >= 60)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-orange-500 px-2.5 py-1 rounded-full shadow-xs">
        <AlertTriangle size={12} /> {t('highRisk')}
      </span>
    );
  if (score >= 40)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-amber-500 px-2.5 py-1 rounded-full shadow-xs">
        <Info size={12} /> {t('mediumRisk')}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-green-600 px-2.5 py-1 rounded-full shadow-xs">
      <CheckCircle size={12} /> {t('lowRisk')}
    </span>
  );
}

type LoadStatus = 'loading' | 'error' | 'ready';

export function RiskMapClient() {
  const t = useTranslations('geo');
  const locale = useLocale();

  const [riskData, setRiskData] = useState<GeoRisk[]>([]);
  const [geoJson, setGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [selected, setSelected] = useState<GeoRisk | null>(null);

  // Partner Network & SOS Emergency States
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilterType>('all');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userAddress, setUserAddress] = useState<string>('');
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [sosTicket, setSosTicket] = useState<SOSTicket | null>(null);
  const [emergencyType, setEmergencyType] = useState<'accident' | 'breakdown' | 'medical'>('accident');
  const [sosDesc, setSosDesc] = useState('');

  // Selected Partner detail drawer/modal & Routing
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [partnerDistanceInfo, setPartnerDistanceInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [activeRouteCoords, setActiveRouteCoords] = useState<[number, number][] | null>(null);
  const [activeRouteInfo, setActiveRouteInfo] = useState<{
    distance: string;
    duration: string;
    destinationName: string;
  } | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  // Side Inspector Panel open/collapsed state (allows true full screen map)
  const [sidePanelOpen, setSidePanelOpen] = useState(true);

  // Filters & Controls
  const [activeDisaster, setActiveDisaster] = useState<DisasterFilterType>('all');
  const [baseMap, setBaseMap] = useState<BaseMapLayerType>('streets');
  const [searchQuery, setSearchQuery] = useState('');
  const [resetTrigger, setResetTrigger] = useState(0);
  const [weatherOverlay, setWeatherOverlay] = useState(true);

  const handleClosePartnerModal = () => {
    setSelectedPartner(null);
    setActiveRouteCoords(null);
    setActiveRouteInfo(null);
    setResetTrigger((prev) => prev + 1);
  };

  const handleRouteToPartner = async (partner: Partner) => {
    if (!partner.lat || !partner.lng) {
      toast.error('Đối tác chưa có tọa độ vị trí.');
      return;
    }
    const origin = userCoords || (selected?.region === 'central' ? { lat: 16.05, lng: 108.20 } : { lat: 21.0285, lng: 105.8542 });
    const dest = { lat: partner.lat, lng: partner.lng };

    setRoutingLoading(true);
    try {
      const res = await getDirectionRouteGoong(origin, dest, 'car');
      if (res && res.coordinates.length > 0) {
        setActiveRouteCoords(res.coordinates);
        setActiveRouteInfo({
          distance: res.distanceText,
          duration: res.durationText,
          destinationName: partner.name,
        });
        toast.success(`Đã dựng lộ trình Goong: ${res.distanceText} (~${res.durationText})`);
      } else {
        toast.error('Không tìm thấy lộ trình phù hợp.');
      }
    } catch (err) {
      console.warn('routing error', err);
      toast.error('Không thể tải lộ trình lái xe.');
    } finally {
      setRoutingLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPartner || !selectedPartner.lat || !selectedPartner.lng) {
      setPartnerDistanceInfo(null);
      return;
    }
    const origin = userCoords || (selected?.region === 'central' ? { lat: 16.05, lng: 108.20 } : { lat: 21.0285, lng: 105.8542 });
    getDistanceMatrixGoong(origin, { lat: selectedPartner.lat, lng: selectedPartner.lng }).then((res) => {
      if (res) {
        setPartnerDistanceInfo({ distance: res.distanceText, duration: res.durationText });
      }
    });
  }, [selectedPartner, userCoords, selected]);

  useEffect(() => {
    api.get('/geo-risk/partners')
      .then((r) => {
        const partnerList = r.data || [];
        setPartners(partnerList);
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const targetPartnerId = params.get('partner_id');
          if (targetPartnerId) {
            const found = partnerList.find((p: any) => p.id === targetPartnerId);
            if (found) {
              setSelectedPartner(found);
              setTimeout(() => {
                handleRouteToPartner(found);
              }, 600);
            }
          }
        }
      })
      .catch((err) => console.warn('Could not load partners', err));
  }, []);

  const handleOpenSos = () => {
    setSosModalOpen(true);
    setSosTicket(null);
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
          // Reverse geocode via Goong.io GeoAPI
          import('@/lib/goong').then(({ reverseGeocodeGoong }) => {
            reverseGeocodeGoong(coords.lat, coords.lng).then((res) => {
              if (res?.formatted_address) {
                setUserAddress(res.formatted_address);
              }
            });
          });
        },
        (err) => {
          console.warn('Geolocation denied/failed', err);
        },
        { timeout: 8000 }
      );
    }
  };

  const handleDispatchSos = async () => {
    setSosSubmitting(true);
    try {
      const payload = {
        lat: userCoords?.lat || (selected?.region === 'central' ? 16.05 : 21.0285),
        lng: userCoords?.lng || (selected?.region === 'central' ? 108.20 : 105.8542),
        emergency_type: emergencyType,
        province: selected?.province_name || '',
        description: sosDesc || 'Yêu cầu cứu hộ khẩn cấp hiện trường',
      };
      const res = await api.post('/geo-risk/sos', payload);
      setSosTicket(res.data);
      toast.success('Đã phát lệnh điều phối cứu hộ thành công!');
    } catch {
      toast.error('Gửi lệnh cứu hộ thất bại. Vui lòng liên hệ hotline trực tiếp.');
    } finally {
      setSosSubmitting(false);
    }
  };


  const [riskStatus, setRiskStatus] = useState<LoadStatus>('loading');
  const [geoStatus, setGeoStatus] = useState<LoadStatus>('loading');
  const [riskError, setRiskError] = useState('');
  const [geoError, setGeoError] = useState('');

  const toast = useToast();
  const [locating, setLocating] = useState(false);

  const handleLocateUser = async () => {
    setLocating(true);
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.warn('GPS location error', err),
        { timeout: 6000, enableHighAccuracy: true }
      );
    }
    try {
      const p = await detectUserProvince();
      if (p) {
        const normP = normalizeVnText(p);
        const found = riskData.find(
          (r) =>
            r.province_name.toLowerCase() === p.toLowerCase() ||
            normalizeVnText(r.province_name) === normP
        );
        if (found) {
          setSelected(found);
          toast.success(`Đã định vị bạn tại: ${found.province_name}`);
          api.patch('/auth/location', { province: found.province_name }).catch(() => { });
        } else {
          toast.info(`Phát hiện bạn ở ${p}.`);
        }
      } else {
        toast.info('Không thể định vị tự động. Vui lòng chọn tỉnh từ ô tìm kiếm.');
      }
    } catch {
      toast.error('Định vị thất bại');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    api
      .get('/geo-risk/map')
      .then((r) => {
        setRiskData(r.data);
        setRiskStatus('ready');
      })
      .catch((err) => {
        const status = err?.response?.status;
        setRiskError(status ? `API error ${status}` : t('backendError'));
        setRiskStatus('error');
      });
  }, [t]);

  useEffect(() => {
    fetchGeoJson()
      .then((data) => {
        setGeoJson(data);
        setGeoStatus('ready');
      })
      .catch((err: Error) => {
        setGeoError(`${t('mapError')}: ${err.message}`);
        setGeoStatus('error');
      });
  }, [t]);

  const isLoading = riskStatus === 'loading' || geoStatus === 'loading';
  const hasError = riskStatus === 'error' || geoStatus === 'error';

  // Province search filtering
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return riskData
      .filter((r) => r.province_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [riskData, searchQuery]);

  // Top 5 highest risk provinces
  const topRiskProvinces = useMemo(() => {
    return [...riskData]
      .sort((a, b) => b.overall_risk_score - a.overall_risk_score)
      .slice(0, 5);
  }, [riskData]);

  // Risk distribution statistics
  const stats = useMemo(() => {
    const veryHigh = riskData.filter((r) => r.overall_risk_score >= 80).length;
    const high = riskData.filter((r) => r.overall_risk_score >= 60 && r.overall_risk_score < 80).length;
    const medium = riskData.filter((r) => r.overall_risk_score >= 40 && r.overall_risk_score < 60).length;
    const low = riskData.filter((r) => r.overall_risk_score < 40).length;
    return { veryHigh, high, medium, low, total: riskData.length };
  }, [riskData]);

  const handleSelectProvince = (p: GeoRisk) => {
    setSelected(p);
    setSearchQuery('');
  };

  const handleResetMap = () => {
    setSelected(null);
    setResetTrigger((prev) => prev + 1);
  };

  const disasterOptions: Array<{ id: DisasterFilterType; label: string; icon: string; desc: string }> = [
    { id: 'all', label: t('overallRisk'), icon: '🌈', desc: 'Đánh giá tổng hợp đa rủi ro thiên tai' },
    { id: 'storm', label: t('disasterTypes.storm'), icon: '🌀', desc: 'Vùng bão & áp thấp ven biển' },
    { id: 'flood', label: t('disasterTypes.flood'), icon: '🌊', desc: 'Lũ lụt, lũ quét lưu vực sông' },
    { id: 'landslide', label: t('disasterTypes.landslide'), icon: '⛰️', desc: 'Sạt lở đất đá miền núi dốc' },
    { id: 'inundation', label: t('disasterTypes.inundation'), icon: '🌧️', desc: 'Ngập úng đô thị & triều cường' },
    { id: 'drought', label: t('disasterTypes.drought'), icon: '☀️', desc: 'Khô hạn & xâm nhập mặn' },
  ];

  const currentDisaster = useMemo(
    () => disasterOptions.find((d) => d.id === activeDisaster) || disasterOptions[0],
    [activeDisaster, disasterOptions]
  );

  const provincePartners = useMemo(() => {
    if (!selected) return partners.slice(0, 8);
    const norm = normalizeVnText(selected.province_name);
    return partners.filter((p) => {
      const pNorm = normalizeVnText(p.province);
      return pNorm.includes(norm) || norm.includes(pNorm);
    });
  }, [selected, partners]);

  return (
    <div className="flex flex-col h-full w-full gap-2 overflow-hidden flex-1 min-h-0">
      {/* ── TOP CONTROL TOOLBAR (Relief Floating Bar) ─────────────────────────── */}
      <div className="bg-white/95 backdrop-blur-md rounded-[24px] shadow-[0_4px_14px_rgba(0,0,0,0.04)] border border-[#d0d5dd] p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left: Brand + Smart Disaster Selector */}
        <div className="flex items-center gap-2.5">
          {/* Brand Icon & Title */}
          <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-[#d0d5dd]">
            <div className="w-8 h-8 rounded-full bg-[#2e96ff] text-white flex items-center justify-center font-bold shadow-[0_3px_0_0_rgba(154,207,246,0.5)]">
              <MapPin size={15} className="stroke-[2.5]" />
            </div>
            <span className="text-sm font-bold text-[#13426f] tracking-tight whitespace-nowrap hidden sm:inline">
              Bản đồ rủi ro & Cứu hộ
            </span>
          </div>

          {/* Quick Disaster Filter Pills (Horizontal Bar) */}
          <div className="flex items-center gap-1 bg-[#f9f7f0] p-1 rounded-full border border-[#d0d5dd] overflow-x-auto max-w-[65vw] xl:max-w-none no-scrollbar">
            {disasterOptions.map((opt) => {
              const isActive = activeDisaster === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveDisaster(opt.id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#2e96ff] text-white font-bold shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                      : 'text-[#616c8a] hover:text-[#13426f] hover:bg-white'
                  }`}
                  title={opt.desc}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Search, Locate, Reset & Layer Switcher */}
        <div className="flex items-center gap-2 relative">
          {/* Autocomplete Search */}
          {/* Autocomplete Search */}
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#616c8a]" />
            <Input
              type="text"
              placeholder={t('searchProvincePh')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs bg-[#f9f7f0]/70 border-[#d0d5dd] rounded-full focus:bg-white focus:ring-1 focus:ring-[#2e96ff]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#616c8a] hover:text-[#13426f] p-0.5 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[20px] shadow-xl border border-[#d0d5dd] z-[1200] py-2 max-h-56 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.province_code}
                    onClick={() => handleSelectProvince(p)}
                    className="w-full px-3.5 py-2 text-left text-xs hover:bg-[#bde1f9]/20 flex items-center justify-between group transition-colors cursor-pointer"
                  >
                    <span className="font-bold text-[#13426f] group-hover:text-[#2e96ff]">
                      {p.province_name}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#f9f7f0] group-hover:bg-[#bde1f9] text-[#13426f]">
                      {p.overall_risk_score}/100
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Locate Button */}
          <Button
            size="sm"
            onClick={handleLocateUser}
            disabled={locating}
            className="h-9 px-3.5 text-xs font-bold gap-1.5 shrink-0 bg-[#bde1f9]/40 border border-[#2e96ff]/30 text-[#13426f] hover:bg-[#bde1f9] rounded-full shadow-none cursor-pointer"
            title="Định vị vị trí của tôi (GPS / IP)"
          >
            {locating ? <Loader2 size={13} className="animate-spin text-[#2e96ff]" /> : <Navigation size={13} className="text-[#2e96ff]" />}
            <span className="hidden sm:inline">Vị trí của tôi</span>
          </Button>

          {/* Reset Map Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetMap}
            className="h-9 px-3.5 text-xs font-semibold gap-1.5 shrink-0 rounded-full border-[#d0d5dd] text-[#616c8a] hover:bg-[#f9f7f0] cursor-pointer"
            title={t('resetView')}
          >
            <Compass size={13} />
            <span className="hidden sm:inline">{t('resetView')}</span>
          </Button>

          {/* Partner Network Toggle */}
          <div className="flex items-center bg-[#f9f7f0] p-1 rounded-full border border-[#d0d5dd] shrink-0">
            <button
              onClick={() => setPartnerFilter((prev) => (prev === 'none' ? 'all' : 'none'))}
              className={`px-3 py-1 text-[11px] font-bold rounded-full transition-colors cursor-pointer flex items-center gap-1.5 ${partnerFilter !== 'none'
                  ? 'bg-[#13426f] text-white shadow-xs'
                  : 'text-[#616c8a] hover:text-[#13426f]'
                }`}
              title="Bật / tắt lớp đối tác bảo lãnh & cứu hộ trên bản đồ"
            >
              <Building2 size={13} />
              <span>Đối tác bảo lãnh</span>
              {partnerFilter !== 'none' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
            </button>
          </div>


          {/* SOS Emergency Dispatch Button with Sonar Pulse */}
          <Button
            size="sm"
            onClick={handleOpenSos}
            className="relative h-9 px-4 text-xs font-bold gap-1.5 shrink-0 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-[0_5px_0_0_rgba(239,68,68,0.4)] active:translate-y-0.5 cursor-pointer"
          >
            <span className="absolute -inset-1 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
            <Siren size={14} className="animate-bounce" />
            <span>🚨 SOS Hiện trường</span>
          </Button>
        </div>
      </div>

      {/* ── MAIN MAP & DETAILS AREA ───────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-2.5 sm:gap-3 flex-1 min-h-0 h-full overflow-hidden relative">
        {/* Map Container */}
        <div className="flex-1 bg-white rounded-[24px] shadow-[0_4px_14px_rgba(0,0,0,0.04)] border border-[#d0d5dd] overflow-hidden relative h-full min-h-0">
          {/* Active Layer Pill (Top-Left) */}
          {activeDisaster !== 'all' && (
            <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-2 pointer-events-none">
              <div className="bg-blue-600 text-white px-3 py-1.5 rounded-full shadow-sm text-xs font-bold flex items-center gap-1.5 pointer-events-auto">
                <span>{t('viewingLayer')}:</span>
                <span>{t(`disasterTypes.${activeDisaster}`)}</span>
              </div>
            </div>
          )}

          {/* Floating Expand Side Panel Button when collapsed */}
          {!sidePanelOpen && (
            <button
              onClick={() => setSidePanelOpen(true)}
              className="absolute top-3 right-3 z-[1000] bg-white/95 hover:bg-white text-[#13426f] px-3.5 py-1.5 rounded-full shadow-md border border-[#d0d5dd] text-xs font-bold flex items-center gap-1.5 transition-all hover:scale-105 cursor-pointer"
              title="Mở bảng phân tích rủi ro & cơ sở bảo lãnh"
            >
              <Layers size={13} className="text-[#2e96ff]" />
              <span>Mở bảng tin (63 tỉnh)</span>
            </button>
          )}


          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-[999] backdrop-blur-xs">
              <div className="flex flex-col items-center gap-2 text-slate-600">
                <Loader2 className="animate-spin text-blue-600" size={36} />
                <span className="text-xs font-semibold">{t('loadingMap')}</span>
              </div>
            </div>
          )}

          {!isLoading && hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-[999] p-6">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 max-w-sm text-center shadow-lg">
                <WifiOff className="mx-auto mb-3 text-red-500" size={32} />
                <p className="text-red-700 font-bold text-sm mb-1.5">{t('mapError')}</p>
                {riskError && <p className="text-red-500 text-xs mb-1">{riskError}</p>}
                {geoError && <p className="text-red-500 text-xs">{geoError}</p>}
              </div>
            </div>
          )}

          {riskStatus === 'ready' && geoStatus === 'ready' && geoJson && (
            <GoongMap
              riskData={riskData}
              geoJson={geoJson}
              selectedProvince={selected}
              activeDisaster={activeDisaster}
              partners={partners}
              activePartnerType={partnerFilter}
              userLocation={userCoords}
              resetTrigger={resetTrigger}
              showWeatherOverlay={weatherOverlay}
              routeCoordinates={activeRouteCoords}
              routeInfo={activeRouteInfo}
              sidePanelOpen={sidePanelOpen}
              onClearRoute={() => {
                setActiveRouteCoords(null);
                setActiveRouteInfo(null);
                setResetTrigger((prev) => prev + 1);
              }}
              onProvinceClick={(p) => {
                setSelected(p);
                if (!sidePanelOpen) setSidePanelOpen(true);
              }}
              onPartnerClick={(p: Partner) => {
                setSelectedPartner(p);
              }}
            />
          )}
        </div>

        {/* ── SIDE INSPECTOR PANEL (Relief Card) ─────────────────────────── */}
        {sidePanelOpen && (
          <div className="w-full lg:w-[410px] xl:w-[440px] shrink-0 h-full bg-white rounded-[24px] border border-[#d0d5dd] shadow-[0_4px_14px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-200">
            {/* Panel Sticky Header */}
            <div className="p-4 border-b border-[#d0d5dd] flex items-center justify-between bg-[#f9f7f0]/60">
              {selected ? (
                <div className="flex items-center justify-between w-full">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[#616c8a] mb-0.5 font-medium">
                      <MapPin size={13} className="text-[#2e96ff]" />
                      <span className="font-bold text-[#2e96ff]">
                        {selected.region === 'north'
                          ? t('northRegion')
                          : selected.region === 'central'
                            ? t('centralRegion')
                            : t('southRegion')}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-[#13426f] tracking-tight">
                      {selected.province_name}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RiskBadge score={selected.overall_risk_score} />
                    <button
                      onClick={() => {
                        setSelected(null);
                        setResetTrigger((prev) => prev + 1);
                      }}
                      className="p-1.5 text-[#616c8a] hover:text-[#13426f] hover:bg-[#bde1f9]/40 rounded-full transition-colors cursor-pointer"
                      title="Đóng chi tiết và trở về Tổng quan toàn quốc"
                    >
                      <X size={16} />
                    </button>
                    <button
                      onClick={() => setSidePanelOpen(false)}
                      className="p-1.5 text-[#616c8a] hover:text-[#13426f] hover:bg-[#bde1f9]/40 rounded-full transition-colors hidden lg:flex cursor-pointer"
                      title="Thu gọn bảng để phóng to bản đồ"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#bde1f9] text-[#13426f] flex items-center justify-center font-bold">
                      <TrendingUp size={16} className="stroke-[2.5]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#13426f]">
                        {t('nationalOverview')}
                      </h3>
                      <p className="text-[11px] font-medium text-[#616c8a]">63 tỉnh thành Việt Nam</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSidePanelOpen(false)}
                    className="p-1.5 text-[#616c8a] hover:text-[#13426f] hover:bg-[#bde1f9]/40 rounded-full transition-colors hidden lg:flex cursor-pointer"
                    title="Thu gọn bảng để phóng to bản đồ"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>

          {/* Panel Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pr-3">
            {selected ? (
              /* Detail View for Selected Province */
              <div className="space-y-4 animate-in fade-in-50 duration-200">
                {/* Score Gauge Card with Weather Animation & Liquid Wave Track */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-[20px] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selected.overall_risk_score >= 70 ? (
                        <AnimatedCycloneIcon size={22} />
                      ) : selected.overall_risk_score >= 40 ? (
                        <AnimatedRainIcon size={22} />
                      ) : (
                        <AnimatedWaveIcon size={22} />
                      )}
                      <span className="text-slate-700 font-bold uppercase tracking-wider text-xs">
                        {t('riskScore')}
                      </span>
                    </div>
                    <span className="text-lg font-extrabold text-slate-900 font-mono flex items-baseline">
                      {selected.overall_risk_score}<span className="text-xs text-slate-400 font-normal">/100</span>
                    </span>
                  </div>

                  {/* Gradient Progress Track with Liquid Wave Shimmer */}
                  <div className="h-3 bg-slate-200/80 rounded-full overflow-hidden relative shadow-inner">
                    <div
                      className="h-full rounded-full transition-all duration-700 relative overflow-hidden"
                      style={{
                        width: `${selected.overall_risk_score}%`,
                        backgroundColor:
                          selected.overall_risk_score >= 80
                            ? '#dc2626'
                            : selected.overall_risk_score >= 60
                              ? '#ea580c'
                              : selected.overall_risk_score >= 40
                                ? '#d97706'
                                : '#16a34a',
                      }}
                    >
                      {/* Animated wave shimmer inside progress bar */}
                      <div className="absolute inset-0 bg-white/30 animate-wave-flow" />
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {selected.overall_risk_score >= 80
                      ? '⚠️ Vùng rủi ro thiên tai đặc biệt nghiêm trọng. Cần ưu tiên trang bị bảo hiểm toàn diện.'
                      : selected.overall_risk_score >= 60
                        ? '⚡ Vùng thường xuyên chịu ảnh hưởng của bão và ngập lụt.'
                        : selected.overall_risk_score >= 40
                          ? '🌤️ Mức độ rủi ro trung bình, cần lưu ý vào mùa mưa lũ.'
                          : '🛡️ Khu vực tương đối an toàn, rủi ro thiên tai ở mức thấp.'}
                  </p>
                </div>

                {/* Risk Factors tags */}
                {selected.risk_factors && selected.risk_factors.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      {t('riskFactors')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.risk_factors.map((rf) => (
                        <span
                          key={rf}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {rf === 'typhoon_path' ? '🌀 Tâm bão' :
                            rf === 'flood_prone' ? '🌊 Vùng trũng lũ' :
                              rf === 'mountainous' ? '⛰️ Miền núi dốc' :
                                rf === 'delta_area' ? '🌾 Đồng bằng ngập' : rf}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Disaster Breakdown */}
                {selected.disaster_risks.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      {t('disastersLabel')}
                    </p>
                    <div className="space-y-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
                      {selected.disaster_risks.map((d) => (
                        <div key={d.type} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 font-semibold flex items-center gap-1.5">
                              <span>
                                {d.type === 'storm' ? '🌀' :
                                  d.type === 'flood' ? '🌊' :
                                    d.type === 'landslide' ? '⛰️' :
                                      d.type === 'inundation' ? '🌧️' : '☀️'}
                              </span>
                              {t(`disasterTypes.${d.type}` as Parameters<typeof t>[0])}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-slate-800">
                              {d.risk_score}/100
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${d.risk_score}%`,
                                backgroundColor:
                                  d.risk_score >= 80 ? '#dc2626' :
                                    d.risk_score >= 60 ? '#ea580c' :
                                      d.risk_score >= 40 ? '#d97706' : '#16a34a',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Insurance Recommendations (Deep Harbor Nautical Block) */}
                {selected.recommendations.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-[#13426f] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-[#2e96ff]" /> {t('recommendations')}
                    </p>
                    <div className="space-y-2.5">
                      {selected.recommendations.slice(0, 3).map((rec, i) => (
                        <div key={i} className="bg-[#13426f] text-white rounded-[18px] p-3.5 shadow-[0_4px_0_0_rgba(0,0,0,0.08)]">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-white">{rec.insurance_type}</p>
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#bde1f9] text-[#13426f] font-bold shrink-0">
                              {t('priority')}: {rec.priority_score}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#cde7fb] mt-1 leading-relaxed font-normal">{rec.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Partner Network in Province */}
                {provincePartners.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-[#13426f] uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Building2 size={13} className="text-[#2e96ff]" />
                        Cơ sở bảo lãnh & cứu hộ ({provincePartners.length})
                      </span>
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {provincePartners.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedPartner(p)}
                          className="bg-[#f9f7f0]/60 hover:bg-[#bde1f9]/20 p-3 rounded-[16px] border border-[#d0d5dd] text-xs space-y-1 transition-all cursor-pointer group"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="font-bold text-[#13426f] group-hover:text-[#2e96ff] leading-snug">
                              {p.partner_type === 'hospital' ? '🏥' : p.partner_type === 'garage' ? '🔧' : '🚨'} {p.name}
                            </span>
                            <span className="text-[10px] text-amber-600 font-bold shrink-0">★ {p.rating}</span>
                          </div>
                          <p className="text-[11px] text-[#616c8a] line-clamp-1">{p.address}</p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-300">
                              Bảo lãnh trực tiếp
                            </span>
                            <span className="text-[11px] text-[#2e96ff] font-bold group-hover:underline flex items-center gap-1">
                              Xem & Chỉ đường 🧭
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct Purchase CTA Button (Relief Pop Button) */}
                <Link
                  href={`/${locale}/policies`}
                  className="w-full py-3 px-6 bg-[#2e96ff] hover:bg-[#2585e5] text-white rounded-full text-xs font-bold flex items-center justify-center gap-2 shadow-[0_7px_0_0_rgba(154,207,246,0.5)] active:translate-y-1 active:shadow-[0_3px_0_0_rgba(154,207,246,0.5)] transition-all cursor-pointer mt-2"
                >
                  <Shield size={15} className="stroke-[2.5]" />
                  <span>{t('registerInsurance')}</span>
                  <ArrowRight size={15} className="stroke-[2.5]" />
                </Link>
              </div>
            ) : (
              /* National Overview when no province is clicked */
              <div className="space-y-4 animate-in fade-in-50 duration-200">
                {/* 4 Stats Cards */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-red-50/80 border border-red-100 rounded-xl p-2.5">
                    <div className="text-xl font-black text-red-600 font-mono">{stats.veryHigh}</div>
                    <div className="text-[10px] text-red-700 font-bold uppercase mt-0.5">{t('veryHighRisk')}</div>
                  </div>
                  <div className="bg-orange-50/80 border border-orange-100 rounded-xl p-2.5">
                    <div className="text-xl font-black text-orange-600 font-mono">{stats.high}</div>
                    <div className="text-[10px] text-orange-700 font-bold uppercase mt-0.5">{t('highRisk')}</div>
                  </div>
                  <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-2.5">
                    <div className="text-xl font-black text-amber-600 font-mono">{stats.medium}</div>
                    <div className="text-[10px] text-amber-700 font-bold uppercase mt-0.5">{t('mediumRisk')}</div>
                  </div>
                  <div className="bg-green-50/80 border border-green-100 rounded-xl p-2.5">
                    <div className="text-xl font-black text-green-600 font-mono">{stats.low}</div>
                    <div className="text-[10px] text-green-700 font-bold uppercase mt-0.5">{t('lowRisk')}</div>
                  </div>
                </div>

                {/* Top 5 High Risk Provinces */}
                <div>
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ShieldAlert size={13} className="text-red-500" />
                    {t('topRiskProvinces')}
                  </p>
                  <div className="space-y-2">
                    {topRiskProvinces.map((p, idx) => (
                      <button
                        key={p.province_code}
                        onClick={() => handleSelectProvince(p)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-all text-left group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 font-black text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 block">
                              {p.province_name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {p.region === 'north' ? 'Miền Bắc' : p.region === 'central' ? 'Miền Trung' : 'Miền Nam'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-red-600 font-mono">{p.overall_risk_score}đ</span>
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Helpful Instruction Box */}
                <div className="bg-blue-50/70 border border-blue-100/80 rounded-xl p-3 text-center">
                  <Info size={18} className="mx-auto text-blue-600 mb-1" />
                  <p className="text-[11px] text-blue-900 leading-relaxed font-medium">
                    {t('selectProvincePrompt')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* ── PARTNER DETAIL MODAL / FLOATING CARD (Redesigned Modern Header & Form) ── */}
      {selectedPartner && (
        <div
          className="fixed inset-0 z-[10000] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={handleClosePartnerModal}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Clean, modern, bright with subtle tint & badge */}
            <div className={`p-5 pb-4 border-b border-slate-100 relative ${
              selectedPartner.partner_type === 'hospital'
                ? 'bg-gradient-to-br from-rose-50/80 via-white to-slate-50'
                : selectedPartner.partner_type === 'garage'
                ? 'bg-gradient-to-br from-blue-50/80 via-white to-slate-50'
                : 'bg-gradient-to-br from-amber-50/80 via-white to-slate-50'
            }`}>
              {/* Top Row: Type Pill + Close Button */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full border ${
                  selectedPartner.partner_type === 'hospital'
                    ? 'bg-rose-100/70 text-rose-700 border-rose-200'
                    : selectedPartner.partner_type === 'garage'
                    ? 'bg-blue-100/70 text-blue-700 border-blue-200'
                    : 'bg-amber-100/70 text-amber-800 border-amber-200'
                }`}>
                  {selectedPartner.partner_type === 'hospital' && <HeartPulse size={13} className="text-rose-600" />}
                  {selectedPartner.partner_type === 'garage' && <Wrench size={13} className="text-blue-600" />}
                  {selectedPartner.partner_type === 'rescue' && <Siren size={13} className="text-amber-600" />}
                  <span>
                    {selectedPartner.partner_type === 'hospital'
                      ? 'Bệnh viện Bảo lãnh viện phí'
                      : selectedPartner.partner_type === 'garage'
                      ? 'Garage Sửa chữa liên kết'
                      : 'Đội cứu hộ khẩn cấp 24/7'}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={handleClosePartnerModal}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Đóng chi tiết đối tác và zoom toàn cảnh"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Title & Icon */}
              <div className="flex items-start gap-3.5">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border ${
                  selectedPartner.partner_type === 'hospital'
                    ? 'bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-300'
                    : selectedPartner.partner_type === 'garage'
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-blue-300'
                    : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-300'
                }`}>
                  {selectedPartner.partner_type === 'hospital' && <HeartPulse size={24} />}
                  {selectedPartner.partner_type === 'garage' && <Wrench size={24} />}
                  {selectedPartner.partner_type === 'rescue' && <Siren size={24} />}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-base text-slate-900 leading-snug">
                    {selectedPartner.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-emerald-600 text-xs font-bold inline-flex items-center gap-1">
                      <CheckCircle size={12} /> Đối tác bảo lãnh chính thức
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-amber-600 text-xs font-bold inline-flex items-center gap-0.5">
                      <Star size={12} className="fill-amber-400 text-amber-500" />
                      {selectedPartner.rating || 4.9}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3.5 text-xs">
              {/* Address card */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 space-y-2">
                <div className="flex items-start gap-2.5 text-slate-700">
                  <MapPin size={16} className="text-[#2e96ff] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{selectedPartner.address}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{selectedPartner.province}</div>
                  </div>
                </div>
              </div>

              {/* Real Distance via Goong API */}
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wider flex items-center gap-1">
                    <span>⚡ Goong.io Route & Distance</span>
                  </div>
                  <div className="text-xs font-extrabold text-slate-900 mt-0.5">
                    {partnerDistanceInfo ? `${partnerDistanceInfo.distance} · ~${partnerDistanceInfo.duration} di chuyển` : 'Đang tính toán cự ly thực tế qua Goong...'}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Navigation size={15} />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {/* 1. In-App Goong Directions */}
                <Button
                  onClick={() => {
                    handleRouteToPartner(selectedPartner);
                    setSelectedPartner(null);
                  }}
                  disabled={routingLoading}
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {routingLoading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Navigation size={15} />
                  )}
                  <span>Chỉ đường trực tiếp trên Bản đồ Goong</span>
                </Button>

                {/* 2. Direct Call Hotline */}
                <a
                  href={`tel:${selectedPartner.hotline || selectedPartner.phone}`}
                  className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <PhoneCall size={14} />
                  <span>Gọi Hotline tiếp nhận: {selectedPartner.hotline || selectedPartner.phone}</span>
                </a>

                {/* 3. Footer: External Map link + Close button */}
                <div className="flex items-center justify-between pt-1">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPartner.lat},${selectedPartner.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline flex items-center gap-1 font-medium"
                  >
                    <span>Mở Google Maps</span>
                    <ArrowRight size={11} />
                  </a>

                  <button
                    type="button"
                    onClick={handleClosePartnerModal}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-300/80 text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:translate-y-0.5"
                  >
                    <X size={14} />
                    <span>Hủy bỏ / Đóng</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SOS EMERGENCY MODAL ────────────────────────────────────────── */}
      {sosModalOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-600 to-rose-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Siren size={20} className="animate-bounce" />
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight">ĐIỀU PHỐI CỨU HỘ HIỆN TRƯỜNG & BẢO LÃNH</h3>
                  <p className="text-[11px] text-red-100">Kết nối mạng lưới cứu hộ Tasco & Đối tác bảo lãnh 24/7</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSosModalOpen(false);
                  setResetTrigger((prev) => prev + 1);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {!sosTicket ? (
                <>
                  {/* Step 1: Emergency type selector */}
                  <div>
                    <label className="font-bold text-slate-700 mb-1.5 block">1. Chọn loại sự cố khẩn cấp *</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEmergencyType('accident')}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${emergencyType === 'accident'
                            ? 'bg-red-50 border-red-500 text-red-800 font-bold ring-2 ring-red-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                      >
                        <div className="text-xl mb-1">🚗💥</div>
                        <div className="text-xs">Tai nạn xe</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmergencyType('breakdown')}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${emergencyType === 'breakdown'
                            ? 'bg-amber-50 border-amber-500 text-amber-800 font-bold ring-2 ring-amber-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                      >
                        <div className="text-xl mb-1">🔧🌧️</div>
                        <div className="text-xs">Hỏng xe / Thủy kích</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmergencyType('medical')}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${emergencyType === 'medical'
                            ? 'bg-blue-50 border-blue-500 text-blue-800 font-bold ring-2 ring-blue-500/20'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                      >
                        <div className="text-xl mb-1">🏥🚑</div>
                        <div className="text-xs">Cấp cứu y tế</div>
                      </button>
                    </div>
                  </div>

                  {/* Step 2: Location indicator */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <MapPin size={13} className="text-red-500" /> Vị trí hiện trường sự cố:
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        {userAddress ? 'Goong GPS chuẩn xác' : userCoords ? 'GPS chuẩn xác' : 'Theo địa phương'}
                      </span>
                    </div>
                    <p className="text-slate-700 text-[11px] leading-relaxed">
                      {userAddress ? (
                        <span className="font-semibold text-blue-900">📍 {userAddress}</span>
                      ) : userCoords ? (
                        `Tọa độ: ${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}`
                      ) : selected ? (
                        `Khu vực: ${selected.province_name}`
                      ) : (
                        'Vị trí hiện tại người dùng'
                      )}
                    </p>
                    {userAddress && (
                      <div className="mt-1.5 pt-1 border-t border-slate-200/60 flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                        <span>✓ Xác thực địa danh tự động qua Goong.io GeoAPI</span>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Brief note */}
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">2. Mô tả ngắn tình trạng (tùy chọn)</label>
                    <Input
                      type="text"
                      placeholder="VD: Xe chết máy ngập nước tại ngã tư, cần xe cẩu hỗ trợ..."
                      value={sosDesc}
                      onChange={(e) => setSosDesc(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  {/* Submit CTA */}
                  <Button
                    onClick={handleDispatchSos}
                    disabled={sosSubmitting}
                    className="w-full h-10 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs gap-2 rounded-xl shadow-lg shadow-red-600/30 cursor-pointer"
                  >
                    {sosSubmitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Đang điều phối đối tác cứu hộ...</span>
                      </>
                    ) : (
                      <>
                        <Siren size={15} />
                        <span>PHÁT LỆNH CỨU HỘ & XUẤT MÃ BẢO LÃNH NGAY</span>
                      </>
                    )}
                  </Button>
                </>
              ) : (
                /* SOS Dispatch Result & Guarantee QR */
                <div className="space-y-3.5 animate-in fade-in-50">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-xs">
                        <CheckCircle size={14} className="text-emerald-600" />
                        ĐÃ PHÁT LỆNH ĐIỀU PHỐI THÀNH CÔNG!
                      </div>
                      <p className="text-[11px] text-emerald-700 mt-0.5 font-mono">
                        Mã phiếu: <span className="font-bold">{sosTicket.ticket_code}</span>
                      </p>
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      DISPATCHED
                    </span>
                  </div>

                  {/* QR Guarantee Card */}
                  <div className="bg-slate-900 text-white rounded-xl p-3.5 border border-slate-800 flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg text-slate-900 flex items-center justify-center shrink-0">
                      <QrCode size={46} />
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                        Mã bảo lãnh khẩn cấp trực tiếp
                      </div>
                      <div className="text-xs font-semibold mt-0.5">
                        Hạn mức tạm ứng: <span className="font-mono text-emerald-400">30.000.000 đ</span>
                      </div>
                      <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">
                        {sosTicket.cashless_guarantee.note}
                      </p>
                    </div>
                  </div>

                  {/* Top 3 Dispatched Partners */}
                  <div>
                    <div className="font-bold text-slate-800 mb-1.5 flex items-center justify-between text-xs">
                      <span>Đội cứu hộ & Cơ sở liên kết được điều phối:</span>
                      <span className="text-[10px] text-blue-700 font-medium">Bán kính gần nhất</span>
                    </div>
                    <div className="space-y-2">
                      {sosTicket.dispatched_partners.map((p, idx) => (
                        <div
                          key={p.id}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                              <span className="line-clamp-1">{p.name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">{p.address}</div>
                            {p.distance_km !== undefined && (
                              <div className="text-[10px] font-mono text-blue-700 font-bold">
                                Cách bạn ~{p.distance_km} km
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={`tel:${p.hotline || p.phone}`}
                              className="bg-amber-400 hover:bg-amber-300 font-extrabold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-xs border border-amber-500 transition-colors"
                              style={{ color: '#000000' }}
                            >
                              <PhoneCall size={12} className="text-black" />
                              <span style={{ color: '#000000' }}>Gọi {p.hotline || p.phone}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                handleRouteToPartner(p);
                                setSosModalOpen(false);
                              }}
                              className="bg-[#2e96ff] hover:bg-[#2585e5] text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                              title="Dựng lộ trình chỉ đường cứu hộ trên Goong Map"
                            >
                              🧭 <span>Chỉ đường Goong</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setSosModalOpen(false);
                      setResetTrigger((prev) => prev + 1);
                    }}
                    className="w-full text-xs h-10 font-bold rounded-full border-2 border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 transition-all cursor-pointer"
                  >
                    ✕ Đóng cửa sổ cứu hộ
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

