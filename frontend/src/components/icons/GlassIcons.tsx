/**
 * Custom SVG icons for auto glass categories.
 * Industry-specific, not generic Lucide icons.
 */

interface IconProps {
  className?: string;
}

export function WindshieldIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 36C6 36 10 14 24 10C38 14 42 36 42 36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M6 36H42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10 28H38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M14 20H34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}

export function RearWindowIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 12C8 12 12 34 24 38C36 34 40 12 40 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 12H40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12 20H36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

export function SideWindowIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="8" width="28" height="32" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 18H38" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <path d="M10 28H38" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M18 38V42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M30 38V42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AdasCameraIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M24 8V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 34V40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 24H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M34 24H40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12.7 12.7L16.9 16.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M31.1 31.1L35.3 35.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function TransporterIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="14" width="32" height="20" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M36 22H42C43.1 22 44 22.9 44 24V30C44 31.1 43.1 32 42 32H36" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="14" cy="38" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="34" cy="38" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M10 22H20" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <path d="M10 26H20" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

export function CalibrationIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2" />
      <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2" />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <path d="M24 4V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 40V44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 24H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 24H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
