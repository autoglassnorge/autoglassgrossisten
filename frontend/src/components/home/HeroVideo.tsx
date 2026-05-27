import { useEffect, useRef, useState, useMemo } from 'react';

interface Particle {
  id: number;
  left: string;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => setVideoReady(true);
    const onError = () => setVideoError(true);
    const onEnded = () => setVideoEnded(true);

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);

    video.load();

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, []);

  // Pause video when scrolled out of viewport (saves battery/data)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [videoReady]);

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: `${5 + (i * 5.2) % 90}%`,
      size: 1.5 + Math.random() * 2.5,
      delay: Math.random() * 12,
      duration: 10 + Math.random() * 10,
      opacity: 0.2 + Math.random() * 0.4,
    }));
  }, []);

  const dustParticles = useMemo<Particle[]>(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i + 100,
      left: `${3 + (i * 7.8) % 94}%`,
      size: 0.8 + Math.random() * 1.2,
      delay: Math.random() * 8,
      duration: 6 + Math.random() * 6,
      opacity: 0.15 + Math.random() * 0.25,
    }));
  }, []);

  const showFallback = !videoReady || videoError || videoEnded;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Video layer — only rendered if we think a file exists */}
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
          videoReady && !videoError && !videoEnded ? 'opacity-100' : 'opacity-0'
        }`}
        autoPlay
        muted
        playsInline
        preload="auto"
        poster=""
      >
        <source src="/videos/hero-loop.webm" type="video/webm" />
        <source src="/videos/hero-loop.mp4" type="video/mp4" />
      </video>

      {/* CSS pseudo-video fallback */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          showFallback ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      >
        {/* Base dark carbon background */}
        <div className="absolute inset-0 bg-carbon-950" />

        {/* Animated radial spotlight */}
        <div
          className="absolute inset-0 animate-gradient-shift"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(0,180,216,0.15), transparent 55%)',
          }}
        />
        <div
          className="absolute inset-0 animate-gradient-shift"
          style={{
            background:
              'radial-gradient(ellipse at 30% 60%, rgba(0,150,180,0.08), transparent 50%)',
            animationDelay: '5s',
          }}
        />

        {/* Floating particles (glass-cyan) */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full animate-float-up"
            style={{
              left: p.left,
              bottom: '-20px',
              width: p.size,
              height: p.size,
              backgroundColor: `rgba(0, 180, 216, ${p.opacity})`,
              boxShadow: `0 0 ${p.size * 3}px rgba(0, 180, 216, ${p.opacity * 0.5})`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}

        {/* Tiny dust particles (faster, more subtle) */}
        {dustParticles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full animate-float-up-fast"
            style={{
              left: p.left,
              bottom: '-10px',
              width: p.size,
              height: p.size,
              backgroundColor: `rgba(202, 240, 248, ${p.opacity})`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}

        {/* Horizontal drift layers (subtle depth) */}
        <div
          className="absolute inset-0 animate-drift opacity-[0.03]"
          style={{
            background:
              'repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(0,180,216,0.3) 80px, rgba(0,180,216,0.3) 81px)',
          }}
        />
        <div
          className="absolute inset-0 animate-drift opacity-[0.02]"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 120px, rgba(0,180,216,0.2) 120px, rgba(0,180,216,0.2) 121px)',
            animationDelay: '3s',
            animationDuration: '25s',
          }}
        />

        {/* Scan line */}
        <div className="absolute inset-x-0 top-0 overflow-hidden pointer-events-none">
          <div
            className="h-px w-full animate-scan"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(0,180,216,0.5), transparent)',
              boxShadow: '0 0 12px rgba(0,180,216,0.3)',
            }}
          />
        </div>
      </div>

      {/* Dark overlay for text readability — always active */}
      <div className="absolute inset-0 bg-carbon-950/55" />

      {/* Vignette edges */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(7,9,12,0.6) 100%)',
        }}
      />

      {/* Reduced motion: hide animations, show static gradient */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .animate-float-up,
          .animate-float-up-fast,
          .animate-float-up-slow,
          .animate-drift,
          .animate-scan,
          .animate-gradient-shift,
          .animate-twinkle {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
