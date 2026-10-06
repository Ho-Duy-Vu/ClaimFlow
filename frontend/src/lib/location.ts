import { PROVINCES } from './provinces';

export function normalizeVnText(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIASES: Record<string, string> = {
  'ho chi minh city': 'TP. Hồ Chí Minh',
  'ho chi minh': 'TP. Hồ Chí Minh',
  'tp ho chi minh': 'TP. Hồ Chí Minh',
  'thanh pho ho chi minh': 'TP. Hồ Chí Minh',
  'tp hcm': 'TP. Hồ Chí Minh',
  'hcmc': 'TP. Hồ Chí Minh',
  'hcm': 'TP. Hồ Chí Minh',
  'saigon': 'TP. Hồ Chí Minh',
  'sai gon': 'TP. Hồ Chí Minh',
  'ha noi': 'Hà Nội',
  'hanoi': 'Hà Nội',
  'hn': 'Hà Nội',
  'thanh pho ha noi': 'Hà Nội',
  'da nang': 'Đà Nẵng',
  'danang': 'Đà Nẵng',
  'dn': 'Đà Nẵng',
  'thanh pho da nang': 'Đà Nẵng',
  'ba ria vung tau': 'Bà Rịa - Vũng Tàu',
  'vung tau': 'Bà Rịa - Vũng Tàu',
  'hue': 'Thừa Thiên Huế',
  'thua thien hue': 'Thừa Thiên Huế',
  'can tho': 'Cần Thơ',
  'cantho': 'Cần Thơ',
  'hai phong': 'Hải Phòng',
  'haiphong': 'Hải Phòng',
  'dong nai': 'Đồng Nai',
  'binh duong': 'Bình Dương',
  'quang nam': 'Quảng Nam',
  'quang ngai': 'Quảng Ngãi',
  'quang ninh': 'Quảng Ninh',
  'thanh hoa': 'Thanh Hóa',
  'nghe an': 'Nghệ An',
  'ha tinh': 'Hà Tĩnh',
  'khanh hoa': 'Khánh Hòa',
  'nha trang': 'Khánh Hòa',
  'lam dong': 'Lâm Đồng',
  'da lat': 'Lâm Đồng',
  'dalat': 'Lâm Đồng',
  'dak lak': 'Đắk Lắk',
  'daklak': 'Đắk Lắk',
  'gia lai': 'Gia Lai',
  'tay ninh': 'Tây Ninh',
  'an giang': 'An Giang',
  'kien giang': 'Kiên Giang',
  'tien giang': 'Tiền Giang',
  'ben tre': 'Bến Tre',
  'long an': 'Long An',
};

export function matchProvince(text: string): string | null {
  if (!text) return null;
  const norm = normalizeVnText(text);
  const padded = ` ${norm} `;

  // 1. Check exact or alias matches
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (padded.includes(` ${alias} `) || norm === alias) {
      return canonical;
    }
  }

  // 2. Check 63 province names (longest matches first)
  const matches: { len: number; canonical: string }[] = [];
  for (const p of PROVINCES) {
    const np = normalizeVnText(p);
    if (padded.includes(` ${np} `) || norm.includes(np)) {
      matches.push({ len: np.length, canonical: p });
    }
  }
  if (matches.length > 0) {
    matches.sort((a, b) => b.len - a.len);
    return matches[0].canonical;
  }
  return null;
}

/**
 * Smart Location Detection with robust multi-tier fallback:
 * Tier 1: Fast IP geolocation via ipwho.is (free, high quota, no auth)
 * Tier 2: Secondary IP geolocation via freeipapi.com
 * Tier 3: Browser HTML5 Geolocation + OpenStreetMap Nominatim reverse geocode
 * Tier 4: Timezone heuristic (Asia/Ho_Chi_Minh default)
 */
export async function detectUserProvince(): Promise<string | null> {
  // ── Tier 1: Browser HTML5 Geolocation + Goong.io Reverse Geocoding ───────
  if (typeof window !== 'undefined' && 'geolocation' in navigator) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 4000,
          maximumAge: 60000,
          enableHighAccuracy: true,
        });
      });
      const { latitude, longitude } = pos.coords;

      // 1.1. Goong.io Reverse Geocoding (Ưu tiên số 1 - Chính xác 100% cho Việt Nam)
      try {
        const { reverseGeocodeGoong } = await import('./goong');
        const goongRes = await reverseGeocodeGoong(latitude, longitude);
        if (goongRes) {
          const candidate = `${goongRes.province} ${goongRes.district || ''} ${goongRes.formatted_address}`;
          const p = matchProvince(candidate);
          if (p) return p;
        }
      } catch {
        // Goong lookup fallback
      }

      // 1.2. OpenStreetMap Nominatim Fallback
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=vi`
      );
      if (res.ok) {
        const data = await res.json();
        const address = data.address || {};
        const candidate = `${address.city || ''} ${address.state || ''} ${address.province || ''} ${address.county || ''} ${data.display_name || ''}`;
        const p = matchProvince(candidate);
        if (p) return p;
      }
    } catch {
      // browser geolocation denied or timeout
    }
  }

  // ── Tier 2: ipwho.is ──────────────────────────────────────────────────────
  try {
    const res = await fetch('https://ipwho.is/', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.success && (data.region || data.city)) {
        const candidate = `${data.region || ''} ${data.city || ''}`;
        const p = matchProvince(candidate);
        if (p) return p;
      }
    }
  } catch {
    // try next tier
  }

  // ── Tier 3: freeipapi.com ─────────────────────────────────────────────────
  try {
    const res = await fetch('https://freeipapi.com/api/json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const candidate = `${data.regionName || ''} ${data.cityName || ''}`;
      const p = matchProvince(candidate);
      if (p) return p;
    }
  } catch {
    // try next tier
  }

  // ── Tier 4: Fallback for Vietnam time zone ────────────────────────────────
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'Asia/Ho_Chi_Minh' || tz === 'Asia/Saigon' || tz === 'Asia/Bangkok') {
      return 'TP. Hồ Chí Minh';
    }
  } catch {
    // ignore
  }

  return 'Hà Nội';
}
