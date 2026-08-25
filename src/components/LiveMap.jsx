import React, { useMemo } from 'react';

export default function LiveMap({ nodes, targets }) {
  const { minX, minY, width, height } = useMemo(() => {
    let allXs = [];
    let allYs = [];

    // Collect node coordinates
    Object.values(nodes || {}).forEach(([x, y]) => {
      allXs.push(x);
      allYs.push(y);
    });

    // Collect target coordinates including their confidence radii
    (targets || []).forEach(target => {
      allXs.push(target.x - target.confidence_radius);
      allXs.push(target.x + target.confidence_radius);
      allYs.push(target.y - target.confidence_radius);
      allYs.push(target.y + target.confidence_radius);
    });

    // Default viewBox if no data
    if (allXs.length === 0 || allYs.length === 0) {
      return { minX: -10, minY: -10, width: 20, height: 20 };
    }

    const minXVal = Math.min(...allXs);
    const maxXVal = Math.max(...allXs);
    const minYVal = Math.min(...allYs);
    const maxYVal = Math.max(...allYs);

    // Add padding (e.g., 2 meters)
    const padding = 2;
    const finalMinX = minXVal - padding;
    const finalMinY = minYVal - padding;
    const finalWidth = (maxXVal - minXVal) + (padding * 2);
    const finalHeight = (maxYVal - minYVal) + (padding * 2);

    // Ensure we don't have a 0 width/height
    return {
      minX: finalMinX,
      minY: finalMinY,
      width: Math.max(finalWidth, 10),
      height: Math.max(finalHeight, 10),
    };
  }, [nodes, targets]);

  return (
    <div className="bg-[#050505] border border-command-border rounded-sm h-full min-h-[400px] relative overflow-hidden flex flex-col">
      <div className="absolute top-4 left-4 z-10 bg-black/70 px-3 py-1 border border-gray-800 text-xs font-mono text-gray-400">
        GRID: LOCAL METRES
      </div>
      
      <svg
        className="w-full h-full flex-1"
        viewBox={`${minX} ${minY} ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Draw a subtle grid */}
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#222" strokeWidth="0.05" />
          </pattern>
        </defs>
        <rect x={minX} y={minY} width={width} height={height} fill="url(#grid)" />

        {/* Draw Targets */}
        {targets.map(target => {
          const isUrgent = target.age_seconds < 3;
          const strokeColor = isUrgent ? 'rgb(248, 113, 113)' : 'rgb(251, 191, 36)'; // red-400 or amber-400
          const fillColor = isUrgent ? 'rgba(248, 113, 113, 0.15)' : 'rgba(251, 191, 36, 0.15)';
          
          return (
            <g key={target.id}>
              {/* Confidence Radius */}
              <circle
                cx={target.x}
                cy={target.y}
                r={target.confidence_radius}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth="0.1"
                strokeDasharray={isUrgent ? "none" : "0.5,0.5"}
                className={isUrgent ? 'animate-pulse' : ''}
              />
              {/* Target Center Point */}
              <circle
                cx={target.x}
                cy={target.y}
                r="0.15"
                fill={strokeColor}
              />
              {/* Target Label */}
              <text
                x={target.x}
                y={target.y - target.confidence_radius - 0.2}
                fill={strokeColor}
                fontSize="0.4"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {target.id}
              </text>
            </g>
          );
        })}

        {/* Draw Nodes */}
        {Object.entries(nodes || {}).map(([id, [x, y]]) => (
          <g key={id}>
            <rect
              x={x - 0.2}
              y={y - 0.2}
              width="0.4"
              height="0.4"
              fill="#00ffcc"
              stroke="#00ffcc"
              strokeWidth="0.05"
            />
            <text
              x={x}
              y={y + 0.6}
              fill="#00ffcc"
              fontSize="0.4"
              fontFamily="monospace"
              textAnchor="middle"
            >
              NODE {id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
