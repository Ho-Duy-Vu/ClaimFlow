'use client';

export interface BBoxField {
  key: string;
  bbox: [number, number, number, number]; // [y_min, x_min, y_max, x_max], normalized 0-1000
  isLowConfidence?: boolean;
}

interface Props {
  imageUrl: string;
  alt: string;
  fields: BBoxField[];
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
  onImageError?: () => void;
}

export function BBoxOverlay({ imageUrl, alt, fields, hoveredKey, onHover, onSelect, onImageError }: Props) {
  return (
    <div className="relative inline-block w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={alt}
        className="block w-full max-h-[480px] object-contain bg-gray-50"
        onError={onImageError}
      />
      <svg
        className="pointer-events-none absolute inset-0 w-full h-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden
      >
        {fields.map(({ key, bbox, isLowConfidence }) => {
          const [yMin, xMin, yMax, xMax] = bbox;
          const isHover = hoveredKey === key;
          const stroke = isHover
            ? '#2563eb'
            : isLowConfidence
              ? '#f97316'
              : '#3b82f6';
          const fill = isHover ? 'rgba(37,99,235,0.18)' : 'rgba(59,130,246,0.05)';
          return (
            <g key={key} className="pointer-events-auto cursor-pointer">
              <rect
                x={xMin}
                y={yMin}
                width={xMax - xMin}
                height={yMax - yMin}
                fill={fill}
                stroke={stroke}
                strokeWidth={isHover ? 3 : isLowConfidence ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke"
                onMouseEnter={() => onHover(key)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(key)}
              />
              {isHover && (
                <text
                  x={xMin + 6}
                  y={Math.max(yMin - 6, 14)}
                  fontSize="22"
                  fontWeight="700"
                  fill="#1e3a8a"
                  stroke="white"
                  strokeWidth="4"
                  paintOrder="stroke"
                  style={{ pointerEvents: 'none' }}
                >
                  {key.replace(/_/g, ' ')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
