/**
 * Goong.io Geospatial Services Integration
 * Dedicated Map & Geocoding Engine for Vietnam
 */

export const GOONG_API_KEY =
  process.env.NEXT_PUBLIC_GOONG_API_KEY || 'QVfRxwruIq46fTV6Xmv1Ooor0lQGbPrGSETzUjad';

export const GOONG_MAPTILES_KEY =
  process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY || 'bshEC5nS7SLByx04a033FkLCQXUO0Zza10oVw3HC';

export interface GoongGeocodeResult {
  formatted_address: string;
  province: string;
  district?: string;
  commune?: string;
}

export interface GoongDistanceResult {
  distanceText: string;
  distanceValue: number; // in meters
  durationText: string;
  durationValue: number; // in seconds
}

export interface GoongPrediction {
  description: string;
  place_id: string;
}

/**
 * Reverse Geocode coordinates to Vietnamese administrative address
 */
export async function reverseGeocodeGoong(
  lat: number,
  lng: number
): Promise<GoongGeocodeResult | null> {
  if (!GOONG_API_KEY) return null;
  try {
    const url = `https://rsapi.goong.io/Geocode?latlng=${lat},${lng}&api_key=${GOONG_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const top = data.results[0];
      const compound = top.compound || {};
      return {
        formatted_address: top.formatted_address || '',
        province: compound.province || '',
        district: compound.district || '',
        commune: compound.commune || '',
      };
    }
  } catch (err) {
    console.warn('[Goong] reverseGeocode error:', err);
  }
  return null;
}

/**
 * Autocomplete address suggestions in Vietnam
 */
export async function autocompleteGoong(input: string): Promise<GoongPrediction[]> {
  if (!GOONG_API_KEY || !input.trim()) return [];
  try {
    const url = `https://rsapi.goong.io/Place/AutoComplete?input=${encodeURIComponent(
      input.trim()
    )}&api_key=${GOONG_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status === 'OK' && data.predictions) {
      return data.predictions.map((p: any) => ({
        description: p.description,
        place_id: p.place_id,
      }));
    }
  } catch (err) {
    console.warn('[Goong] autocomplete error:', err);
  }
  return [];
}

/**
 * Calculate driving distance and duration via road network
 */
export async function getDistanceMatrixGoong(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  vehicle: 'car' | 'bike' = 'car'
): Promise<GoongDistanceResult | null> {
  if (!GOONG_API_KEY) return null;
  try {
    const originsParam = `${origin.lat},${origin.lng}`;
    const destinationsParam = `${destination.lat},${destination.lng}`;
    const url = `https://rsapi.goong.io/DistanceMatrix?origins=${originsParam}&destinations=${destinationsParam}&vehicle=${vehicle}&api_key=${GOONG_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const element = data.rows?.[0]?.elements?.[0];
    if (element && element.status === 'OK') {
      return {
        distanceText: element.distance.text,
        distanceValue: element.distance.value,
        durationText: element.duration.text,
        durationValue: element.duration.value,
      };
    }
  } catch (err) {
    console.warn('[Goong] distanceMatrix error:', err);
  }
  return null;
}

export interface GoongRouteResult {
  distanceText: string;
  distanceValue: number;
  durationText: string;
  durationValue: number;
  coordinates: [number, number][]; // [lng, lat]
}

/**
 * Decodes an encoded polyline string from Goong Direction API into [lng, lat] coordinates for GeoJSON
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lng * 1e-5, lat * 1e-5]); // [lng, lat]
  }
  return points;
}

/**
 * Get turn-by-turn driving route coordinates via Goong Direction API
 */
export async function getDirectionRouteGoong(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  vehicle: 'car' | 'bike' | 'taxi' | 'truck' = 'car'
): Promise<GoongRouteResult | null> {
  if (!GOONG_API_KEY) return null;
  try {
    const originParam = `${origin.lat},${origin.lng}`;
    const destinationParam = `${destination.lat},${destination.lng}`;
    const url = `https://rsapi.goong.io/Direction?origin=${originParam}&destination=${destinationParam}&vehicle=${vehicle}&api_key=${GOONG_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 'OK' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const leg = route.legs?.[0];
      const points = route.overview_polyline?.points
        ? decodePolyline(route.overview_polyline.points)
        : [
            [origin.lng, origin.lat],
            [destination.lng, destination.lat],
          ];

      return {
        distanceText: leg?.distance?.text || 'Đang cập nhật',
        distanceValue: leg?.distance?.value || 0,
        durationText: leg?.duration?.text || 'Đang cập nhật',
        durationValue: leg?.duration?.value || 0,
        coordinates: points as [number, number][],
      };
    }
  } catch (err) {
    console.warn('[Goong] direction error:', err);
  }
  // Fallback to straight line if API has temporary rate limit
  return {
    distanceText: 'Ước lượng',
    distanceValue: 0,
    durationText: 'Ước tính 15-20 phút',
    durationValue: 900,
    coordinates: [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ],
  };
}

