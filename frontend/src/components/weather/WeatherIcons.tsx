'use client';

import React from 'react';
import { Cloud, CloudLightning, Sun, Waves, Wind } from 'lucide-react';

/**
 * Animated Rain Cloud: Cloud with diagonal falling raindrops
 */
export function AnimatedRainIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Cloud base */}
      <Cloud
        size={size * 0.9}
        className="text-[#bde1f9] fill-[#bde1f9]/40 drop-shadow-sm transition-transform hover:scale-105"
      />
      {/* Rain droplets */}
      <div className="absolute inset-x-0 -bottom-1 flex justify-center gap-1.5 overflow-hidden h-4 pointer-events-none">
        <span className="w-0.5 h-2 bg-[#2e96ff] rounded-full animate-rain-1" />
        <span className="w-0.5 h-2.5 bg-[#2e96ff] rounded-full animate-rain-2" />
        <span className="w-0.5 h-2 bg-[#73b9ff] rounded-full animate-rain-3" />
      </div>
    </div>
  );
}

/**
 * Animated Storm Cloud: Cloud with lightning flash and rainfall
 */
export function AnimatedStormIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <CloudLightning
        size={size * 0.9}
        className="text-[#73b9ff] fill-[#13426f]/30 drop-shadow-sm animate-pulse"
      />
      {/* Rain droplets */}
      <div className="absolute inset-x-0 -bottom-1 flex justify-center gap-1.5 overflow-hidden h-4 pointer-events-none">
        <span className="w-0.5 h-2 bg-[#2e96ff] rounded-full animate-rain-1" />
        <span className="w-0.5 h-2.5 bg-[#73b9ff] rounded-full animate-rain-2" />
      </div>
    </div>
  );
}

/**
 * Animated Cyclone / Typhoon Swirl
 */
export function AnimatedCycloneIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <Wind
        size={size * 0.9}
        className="text-[#2e96ff] animate-spin-medium"
      />
      <span className="absolute w-2 h-2 rounded-full bg-rose-500 animate-ping" />
      <span className="absolute w-1.5 h-1.5 rounded-full bg-rose-600" />
    </div>
  );
}

/**
 * Animated Water Wave (Flood / High Tide risk)
 */
export function AnimatedWaveIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }}>
      <Waves
        size={size * 0.9}
        className="text-[#2e96ff] animate-wave-flow drop-shadow-sm"
      />
    </div>
  );
}

/**
 * Animated Sun (Low risk / Clear skies / Drought)
 */
export function AnimatedSunIcon({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <Sun
        size={size * 0.9}
        className="text-amber-400 animate-spin-slow fill-amber-400/30"
      />
    </div>
  );
}

/**
 * Animated Radar Beacon: Dual glowing radar ping rings for real-time monitoring
 */
export function AnimatedRadarBeacon({ color = 'rose', size = 16 }: { color?: 'rose' | 'amber' | 'blue' | 'emerald'; size?: number }) {
  const colorMap = {
    rose: { bg: 'bg-rose-500', ping: 'bg-rose-400' },
    amber: { bg: 'bg-amber-500', ping: 'bg-amber-400' },
    blue: { bg: 'bg-[#2e96ff]', ping: 'bg-[#2e96ff]' },
    emerald: { bg: 'bg-emerald-500', ping: 'bg-emerald-400' },
  }[color];

  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <span className={`absolute w-full h-full rounded-full ${colorMap.ping} opacity-75 animate-beacon-ping`} />
      <span className={`relative rounded-full ${colorMap.bg}`} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

/**
 * Live Weather & Risk Badge for Dashboard Header
 */
export function LiveWeatherBadge({
  province,
  score,
  disasterType,
}: {
  province?: string | null;
  score?: number;
  disasterType?: string;
}) {
  const isHighRisk = (score ?? 0) >= 70;
  const isMediumRisk = (score ?? 0) >= 40 && (score ?? 0) < 70;

  // Determine weather visual state
  const isFlood = disasterType === 'flood' || isHighRisk;
  const isStorm = disasterType === 'storm';

  return (
    <div className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/20 rounded-[20px] px-4 py-2.5 flex items-center gap-3 transition-all shadow-xs">
      <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-white/15 border border-white/20 shadow-inner">
        {isStorm ? (
          <AnimatedCycloneIcon size={24} />
        ) : isFlood ? (
          <AnimatedRainIcon size={24} />
        ) : isMediumRisk ? (
          <AnimatedWaveIcon size={24} />
        ) : (
          <AnimatedSunIcon size={24} />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-white truncate">
            {province ? `Thời tiết: ${province}` : 'Vệ tinh khí tượng'}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/20 text-[#cde7fb]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            LIVE
          </span>
        </div>

        <p className="text-[11px] text-[#bde1f9] flex items-center gap-2 mt-0.5 font-medium">
          {isStorm ? (
            <span>🌀 Cảnh báo gió xoáy bão · 28°C</span>
          ) : isFlood ? (
            <span>🌧️ Mưa lớn diện rộng · 26°C</span>
          ) : (
            <span>☀️ Thời tiết ổn định · 31°C</span>
          )}
          {score != null && (
            <span className={`font-bold ${isHighRisk ? 'text-rose-300' : isMediumRisk ? 'text-amber-300' : 'text-emerald-300'}`}>
              • Rủi ro: {score}/100
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
