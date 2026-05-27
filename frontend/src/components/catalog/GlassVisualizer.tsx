import type { Product } from '@/types/api';

interface GlassVisualizerProps {
  product: Product;
  className?: string;
}

/**
 * Parse color from product description
 * Returns CSS color string and human-readable label
 */
export function parseGlassColor(description: string): { color: string; label: string; tailwindColor: string } {
  const desc = description.toUpperCase();
  
  // Priority order: specific combinations first, then single colors
  if (desc.includes('SOTE') || desc.includes('YP')) {
    return { color: '#1a1a2e', label: 'Sotet', tailwindColor: 'bg-slate-800' };
  }
  if (desc.includes('GD') || desc.includes('MØRK GRØNN') || desc.includes('MORK GRONN')) {
    return { color: '#1a472a', label: 'Mørk grønn', tailwindColor: 'bg-green-900' };
  }
  if (desc.includes('GNAG') || desc.includes('GN AG') || desc.includes('GN+ANT')) {
    return { color: '#4ade80', label: 'Grønn m/antenne', tailwindColor: 'bg-green-400' };
  }
  if (desc.includes('GN') && desc.includes('SOLAR')) {
    return { color: '#86efac', label: 'Grønn solar', tailwindColor: 'bg-green-300' };
  }
  if (desc.includes('GN')) {
    return { color: '#22c55e', label: 'Grønn', tailwindColor: 'bg-green-500' };
  }
  if (desc.includes('GYELM') || desc.includes('GY ELM') || desc.includes('GY+EL')) {
    return { color: '#94a3b8', label: 'Grå m/elektrisk', tailwindColor: 'bg-slate-400' };
  }
  if (desc.includes('GY') && desc.includes('SOLAR')) {
    return { color: '#cbd5e1', label: 'Grå solar', tailwindColor: 'bg-slate-300' };
  }
  if (desc.includes('GY')) {
    return { color: '#64748b', label: 'Grå', tailwindColor: 'bg-slate-500' };
  }
  if (desc.includes('GB') && desc.includes('BL')) {
    return { color: '#3b82f6', label: 'Grå/blå', tailwindColor: 'bg-blue-500' };
  }
  if (desc.includes('GB')) {
    return { color: '#64748b', label: 'Grå/blå', tailwindColor: 'bg-slate-500' };
  }
  if (desc.includes('BL') && desc.includes('BLÅ')) {
    return { color: '#60a5fa', label: 'Blå', tailwindColor: 'bg-blue-400' };
  }
  if (desc.includes('BL')) {
    return { color: '#3b82f6', label: 'Blå', tailwindColor: 'bg-blue-500' };
  }
  if (desc.includes('BZ') || desc.includes('BRONZE')) {
    return { color: '#a0522d', label: 'Bronze', tailwindColor: 'bg-amber-700' };
  }
  if (desc.includes('CL') || desc.includes('KLAR')) {
    return { color: '#e0f2fe', label: 'Klar', tailwindColor: 'bg-sky-100' };
  }
  
  return { color: '#94a3b8', label: 'Standard', tailwindColor: 'bg-slate-400' };
}

/**
 * Parse side position from description
 */
export function parseSidePosition(description: string, typeCode?: string): { side: string; label: string } {
  const desc = description.toUpperCase();
  const tc = (typeCode || '').toUpperCase();
  
  // Driver side (venstre i Norge)
  if (desc.includes('VS') || desc.includes('VENSTRE') || desc.includes('LH') || desc.includes('LEFT') ||
      tc.startsWith('DFF') || tc.startsWith('DFB') || tc.startsWith('SFB')) {
    return { side: 'left', label: 'Venstre side' };
  }
  
  // Passenger side (høyre i Norge)
  if (desc.includes('HS') || desc.includes('HØYRE') || desc.includes('HÖGRE') || desc.includes('RH') || desc.includes('RIGHT') ||
      tc.startsWith('DPF') || tc.startsWith('DPB') || tc.startsWith('SPB')) {
    return { side: 'right', label: 'Høyre side' };
  }
  
  return { side: 'center', label: '' };
}

/**
 * Parse position (front/rear) from description and typeCode
 */
export function parsePosition(typeCode?: string, description?: string): { position: string; label: string } {
  const tc = (typeCode || '').toUpperCase();
  const desc = (description || '').toUpperCase();
  
  if (tc === 'F' || desc.includes('FRONT') || desc.includes('FRONTRUTE') || desc.includes('WS')) {
    return { position: 'front', label: 'Fremme' };
  }
  if (tc === 'B' || desc.includes('BAK') || desc.includes('BAKRUTE') || desc.includes('BACKLITE') || desc.includes('BL')) {
    return { position: 'rear', label: 'Bak' };
  }
  if (tc.includes('FF') || desc.includes('FREMME') || desc.includes('FREMRE')) {
    return { position: 'front', label: 'Fremme' };
  }
  if (tc.includes('FB') || tc.includes('PB') || desc.includes('BAKRE')) {
    return { position: 'rear', label: 'Bak' };
  }
  if (tc.includes('V') || desc.includes('VENTIL')) {
    return { position: 'vent', label: 'Ventil' };
  }
  
  return { position: 'unknown', label: '' };
}

/**
 * SVG Car silhouette with highlighted glass position
 */
export function GlassVisualizer({ product, className = '' }: GlassVisualizerProps) {
  const colorInfo = parseGlassColor(product.description || '');
  const sideInfo = parseSidePosition(product.description || '', product.typeCode || undefined);
  const typeCode = product.typeCode || product.category || '';
  
  // Determine which glass to highlight based on typeCode
  const isFront = typeCode === 'F' || typeCode.includes('FF');
  const isRear = typeCode === 'B' || typeCode.includes('FB') || typeCode.includes('PB');
  const isDoorFront = typeCode.includes('FF') || typeCode.includes('PF');
  const isDoorRear = typeCode.includes('FB') || typeCode.includes('PB');
  const isSide = typeCode.includes('SF') || typeCode.includes('SP');
  const isVent = typeCode.includes('FV') || typeCode.includes('V');
  const isLeft = sideInfo.side === 'left';
  const isRight = sideInfo.side === 'right';
  
  // Glass highlight color
  const glassFill = colorInfo.color;
  const glassOpacity = '0.85';
  
  // Car body color (subtle)
  const bodyStroke = '#64748b';
  const bodyFill = '#f8fafc';
  
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 200 120" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Car body outline - top view */}
        <rect x="30" y="20" width="140" height="80" rx="25" stroke={bodyStroke} strokeWidth="2" fill={bodyFill} />
        
        {/* Windshield */}
        <path 
          d="M55 25 L80 22 L120 22 L145 25" 
          stroke={isFront ? glassFill : '#cbd5e1'} 
          strokeWidth={isFront ? "3" : "1.5"}
          fill={isFront ? glassFill : 'none'}
          fillOpacity={isFront ? glassOpacity : '0'}
        />
        
        {/* Rear window */}
        <path 
          d="M55 95 L80 98 L120 98 L145 95" 
          stroke={isRear ? glassFill : '#cbd5e1'} 
          strokeWidth={isRear ? "3" : "1.5"}
          fill={isRear ? glassFill : 'none'}
          fillOpacity={isRear ? glassOpacity : '0'}
        />
        
        {/* Front door left */}
        <rect 
          x="35" y="40" width="28" height="20" rx="3"
          stroke={isDoorFront && isLeft ? glassFill : '#cbd5e1'} 
          strokeWidth={isDoorFront && isLeft ? "3" : "1.5"}
          fill={isDoorFront && isLeft ? glassFill : 'none'}
          fillOpacity={isDoorFront && isLeft ? glassOpacity : '0'}
        />
        
        {/* Front door right */}
        <rect 
          x="137" y="40" width="28" height="20" rx="3"
          stroke={isDoorFront && isRight ? glassFill : '#cbd5e1'} 
          strokeWidth={isDoorFront && isRight ? "3" : "1.5"}
          fill={isDoorFront && isRight ? glassFill : 'none'}
          fillOpacity={isDoorFront && isRight ? glassOpacity : '0'}
        />
        
        {/* Rear door left */}
        <rect 
          x="35" y="62" width="28" height="20" rx="3"
          stroke={isDoorRear && isLeft ? glassFill : '#cbd5e1'} 
          strokeWidth={isDoorRear && isLeft ? "3" : "1.5"}
          fill={isDoorRear && isLeft ? glassFill : 'none'}
          fillOpacity={isDoorRear && isLeft ? glassOpacity : '0'}
        />
        
        {/* Rear door right */}
        <rect 
          x="137" y="62" width="28" height="20" rx="3"
          stroke={isDoorRear && isRight ? glassFill : '#cbd5e1'} 
          strokeWidth={isDoorRear && isRight ? "3" : "1.5"}
          fill={isDoorRear && isRight ? glassFill : 'none'}
          fillOpacity={isDoorRear && isRight ? glassOpacity : '0'}
        />
        
        {/* Side glass left */}
        <rect 
          x="32" y="40" width="6" height="42" rx="2"
          stroke={isSide && isLeft ? glassFill : '#cbd5e1'} 
          strokeWidth={isSide && isLeft ? "3" : "1.5"}
          fill={isSide && isLeft ? glassFill : 'none'}
          fillOpacity={isSide && isLeft ? glassOpacity : '0'}
        />
        
        {/* Side glass right */}
        <rect 
          x="162" y="40" width="6" height="42" rx="2"
          stroke={isSide && isRight ? glassFill : '#cbd5e1'} 
          strokeWidth={isSide && isRight ? "3" : "1.5"}
          fill={isSide && isRight ? glassFill : 'none'}
          fillOpacity={isSide && isRight ? glassOpacity : '0'}
        />
        
        {/* Vent left */}
        <rect 
          x="68" y="40" width="12" height="8" rx="2"
          stroke={isVent && isLeft ? glassFill : '#cbd5e1'} 
          strokeWidth={isVent && isLeft ? "3" : "1.5"}
          fill={isVent && isLeft ? glassFill : 'none'}
          fillOpacity={isVent && isLeft ? glassOpacity : '0'}
        />
        
        {/* Vent right */}
        <rect 
          x="120" y="40" width="12" height="8" rx="2"
          stroke={isVent && isRight ? glassFill : '#cbd5e1'} 
          strokeWidth={isVent && isRight ? "3" : "1.5"}
          fill={isVent && isRight ? glassFill : 'none'}
          fillOpacity={isVent && isRight ? glassOpacity : '0'}
        />
        
        {/* Center line */}
        <line x1="100" y1="20" x2="100" y2="100" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
        
        {/* Direction arrow (front) */}
        <polygon points="95,8 100,2 105,8" fill="#94a3b8" />
        <text x="100" y="16" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="bold">FRONT</text>
        
        {/* Side labels */}
        <text x="20" y="62" textAnchor="middle" fontSize="8" fill={isLeft ? '#3b82f6' : '#94a3b8'} fontWeight={isLeft ? 'bold' : 'normal'} transform="rotate(-90 20 62)">VS</text>
        <text x="180" y="62" textAnchor="middle" fontSize="8" fill={isRight ? '#3b82f6' : '#94a3b8'} fontWeight={isRight ? 'bold' : 'normal'} transform="rotate(90 180 62)">HS</text>
      </svg>
      
      {/* Legend overlay */}
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between px-2 py-1 bg-white/80 backdrop-blur-sm rounded-md">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-3 h-3 rounded-full ${colorInfo.tailwindColor}`} />
          <span className="text-[10px] font-medium text-gray-700">{colorInfo.label}</span>
        </div>
        {sideInfo.label && (
          <span className="text-[10px] text-gray-500">{sideInfo.label}</span>
        )}
      </div>
    </div>
  );
}
