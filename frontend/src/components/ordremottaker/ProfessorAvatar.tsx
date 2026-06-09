/**
 * Professor Autoglass Avatar
 * AI-generated professor image with text fallback
 */

interface ProfessorAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-16 w-16 text-base',
  xl: 'h-24 w-24 text-lg',
};

export default function ProfessorAvatar({ size = 'md', className = '' }: ProfessorAvatarProps) {
  const sizeClass = SIZE_MAP[size];

  return (
    <div className={`relative ${sizeClass} ${className}`}>
      <img
        src="/hero-autoglass.png"
        alt="Professor Autoglass"
        className="h-full w-full rounded-full object-cover object-[50%_15%] border-2 border-autoglass-blue shadow-md"
        onError={(e) => {
          const img = e.currentTarget;
          img.style.display = 'none';
          const parent = img.parentElement;
          if (parent) {
            parent.innerHTML = `<div class="h-full w-full rounded-full bg-autoglass-blue text-white flex items-center justify-center font-bold border-2 border-white shadow-md">PA</div>`;
          }
        }}
      />
    </div>
  );
}
