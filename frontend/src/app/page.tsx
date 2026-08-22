"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import YouTube from "react-youtube";
import Link from "next/link";
import type { Tile, PathPoint, Site, Boundary } from "@/lib/types";

const RoverCompanion = dynamic(() => import("@/components/rover-companion"), {
  ssr: false,
});

const MARS_IMAGES = [
  { src: "/images/mars-poster.jpg", label: "The Red Planet" },
  { src: "/images/mars-crops.jpg", label: "Terraforming" },
  { src: "/images/mars-dome.jpg", label: "Habitat Systems" },
];

function MarsCarousel({ expanded }: { expanded: boolean }) {
  return (
    <div className="flex items-center justify-center gap-6 transition-all duration-1000">
      {MARS_IMAGES.map((img, i) => (
        <div
          key={img.src}
          className="relative overflow-hidden rounded-sm transition-all duration-[1200ms] ease-out"
          style={{
            width: expanded ? "min(380px, 30vw)" : "min(160px, 14vw)",
            height: expanded ? "min(480px, 38vw)" : "min(200px, 18vw)",
            transform: expanded ? "scale(1)" : `scale(0.95) translateY(${i === 1 ? "-8px" : "0px"})`,
          }}
        >
          <img
            src={img.src}
            alt={img.label}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1500ms] ease-out"
            style={{ transform: expanded ? "scale(1)" : "scale(1.15)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
          {/* SVG corner accents */}
          <svg className="absolute top-0 left-0 w-6 h-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="1">
            <path d="M0 8 L0 0 L8 0" className="transition-all duration-1000" style={{ strokeDasharray: expanded ? "24" : "12", strokeDashoffset: expanded ? "0" : "6" }} />
          </svg>
          <svg className="absolute top-0 right-0 w-6 h-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="1">
            <path d="M24 8 L24 0 L16 0" className="transition-all duration-1000" style={{ strokeDasharray: expanded ? "24" : "12", strokeDashoffset: expanded ? "0" : "6" }} />
          </svg>
          <svg className="absolute bottom-0 left-0 w-6 h-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="1">
            <path d="M0 16 L0 24 L8 24" className="transition-all duration-1000" style={{ strokeDasharray: expanded ? "24" : "12", strokeDashoffset: expanded ? "0" : "6" }} />
          </svg>
          <svg className="absolute bottom-0 right-0 w-6 h-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="1">
            <path d="M24 16 L24 24 L16 24" className="transition-all duration-1000" style={{ strokeDasharray: expanded ? "24" : "12", strokeDashoffset: expanded ? "0" : "6" }} />
          </svg>
          {/* Label */}
          <div
            className="absolute bottom-3 left-3 right-3 transition-opacity duration-700"
            style={{ opacity: expanded ? 1 : 0 }}
          >
            <span className="text-[9px] tracking-[0.15em] uppercase" style={{ fontFamily: "var(--font-mono)", color: "var(--cream-dim)" }}>
              {img.label}
            </span>
          </div>
          {/* Scanning line SVG animation */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              x1="0" x2="100"
              y1={expanded ? "100" : "50"}
              y2={expanded ? "100" : "50"}
              stroke="var(--green)"
              strokeWidth="0.3"
              opacity={expanded ? "0" : "0.4"}
              className="transition-all duration-1000"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

const FEEDS = [
  { src: "/videos/mars-1.mp4", label: "CAM 01 · TERRAIN" },
  { src: "/videos/mars-2.mp4", label: "CAM 02 · DEPTH" },
  { src: "/videos/mars-3.mp4", label: "CAM 03 · SURFACE" },
];

const serif = "var(--font-serif)";
const mono = "var(--font-mono)";
const sans = "var(--font-sans)";
const cream = "var(--cream)";
const creamDim = "var(--cream-dim)";

function CircularMarquee({ progress }: { progress: number }) {
  const srcs = [
    "https://i.pinimg.com/736x/e0/be/a0/e0bea09fd3261b3c7c8287c29c8a54f0.jpg",
    "https://i.pinimg.com/1200x/cf/48/52/cf4852ba5990fe101d8b66cde8eb321a.jpg",
    "https://i.pinimg.com/736x/2a/cb/9d/2acb9d825a2a967731e50c6081d666b6.jpg",
    "https://i.pinimg.com/736x/1c/a7/23/1ca723555ae4bc19cee869a84e085867.jpg",
    "https://i.pinimg.com/736x/0c/d1/20/0cd120357fe9c7a99e39e14aa4dd296a.jpg",
    "/images/eyes-on-img.jpg",
    "/images/hero-bg.jpg",
    "https://i.pinimg.com/736x/e0/be/a0/e0bea09fd3261b3c7c8287c29c8a54f0.jpg", // Duplicate some to fill out the orbit if needed, or stick to 8 unique
  ];

  const [dims, setDims] = useState({ rx: 500, ry: 250 });
  
  useEffect(() => {
    const handleResize = () => {
      setDims({
        rx: Math.max(window.innerWidth * 0.4, 400),
        ry: Math.max(window.innerHeight * 0.35, 200)
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startRadiusX = dims.rx;
  const startRadiusY = dims.ry;
  
  // As progress goes from 0 to 0.5, radius shrinks to 0 (converging)
  const convergeProgress = Math.min(1, progress * 2);
  const radiusX = startRadiusX * (1 - convergeProgress);
  const radiusY = startRadiusY * (1 - convergeProgress);
  
  // Revolve multiple times based on progress
  const angleOffset = progress * 360 * 3; 

  return (
    <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none flex items-center justify-center">
      {srcs.map((src, i) => {
        const baseAngle = (360 / srcs.length) * i;
        const currentAngle = (baseAngle + angleOffset) * (Math.PI / 180);
        
        const x = Math.cos(currentAngle) * radiusX;
        const y = Math.sin(currentAngle) * radiusY;

        return (
          <div
            key={i}
            className="absolute w-36 h-48 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-black/5"
            style={{
              transform: `translate(${x}px, ${y}px) scale(${1 - convergeProgress})`,
              opacity: 1 - convergeProgress,
              willChange: "transform, opacity",
            }}
          >
            <img src={src} alt="Marquee" className="w-full h-full object-cover rounded-xl" />
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [hasEntered, setHasEntered] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [heroVisible, setHeroVisible] = useState(false);
  const [carouselExpanded, setCarouselExpanded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroProgress, setHeroProgress] = useState(0);
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [cinematicPlayer, setCinematicPlayer] = useState<any>(null);
  const [heroYtPlaying, setHeroYtPlaying] = useState(false);
  const [eyesOnProgress, setEyesOnProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [roverScrollProgress, setRoverScrollProgress] = useState(0);
  const roverWrapperRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLDivElement>(null);
  const roverSectionRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);

      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, -rect.top / (rect.height - window.innerHeight || 1)));
        setHeroProgress(progress);
      }

      if (expandRef.current) {
        const rect = expandRef.current.getBoundingClientRect();
        const maxScroll = rect.height - window.innerHeight;
        const p = maxScroll > 0 ? Math.min(1, Math.max(0, -rect.top / maxScroll)) : 0;
        setEyesOnProgress(p);
      }
      if (videoRef.current) {
        const rect = videoRef.current.getBoundingClientRect();
        const maxScroll = rect.height - window.innerHeight;
        const p = maxScroll > 0 ? Math.min(1, Math.max(0, -rect.top / maxScroll)) : 0;
        setVideoProgress(p);
      }
      if (roverSectionRef.current) {
        const rect = roverSectionRef.current.getBoundingClientRect();
        const maxScroll = rect.height - window.innerHeight;
        const p = maxScroll > 0 ? Math.min(1, Math.max(0, -rect.top / maxScroll)) : 0;
        setRoverScrollProgress(p);
        
        // When the bottom of the section goes above the bottom of the viewport,
        // it means we are scrolling past the section. We track this offset to unstick the rover.
        if (rect.bottom < window.innerHeight) {
          if (roverWrapperRef.current) {
            roverWrapperRef.current.style.transform = `translateY(-${window.innerHeight - rect.bottom}px)`;
          }
        } else {
          if (roverWrapperRef.current) {
            roverWrapperRef.current.style.transform = `translateY(0px)`;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!expandRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => setCarouselExpanded(e.isIntersecting),
      { threshold: 0.2 }
    );
    obs.observe(expandRef.current);
    return () => obs.disconnect();
  }, []);

  const scrollProgress = typeof window !== "undefined" ? Math.min(1, Math.max(0, scrollY / (window.innerHeight || 800))) : 0;

  // Cinematic Video global phases
  const shrinkPhase = Math.min(1, videoProgress / 0.2); 
  const returnPhase = videoProgress < 0.7 ? 0 : Math.min(1, (videoProgress - 0.7) / 0.3);
  const videoTranslateX = shrinkPhase * 25 * (1 - returnPhase); 
  const videoScale = (1 - shrinkPhase * 0.5) + (returnPhase * shrinkPhase * 0.5); 

  const handleEnter = () => {
    setHasEntered(true);
    if (audioRef.current) {
      audioRef.current.currentTime = 14;
      audioRef.current.play().catch(e => console.error("Audio playback failed", e));
    }
    if (ytPlayer) {
      ytPlayer.mute();
      ytPlayer.playVideo();
    }
    if (cinematicPlayer) {
      cinematicPlayer.mute();
      cinematicPlayer.playVideo();
    }
  };

  return (
    <div className={`bg-black min-h-screen text-white relative selection:bg-white/20 transition-opacity duration-1000 ${hasEntered ? "opacity-100 overflow-visible" : "opacity-100 overflow-hidden h-screen"}`}>
      
      {/* ═══ Preloader / Enter Screen ═══ */}
      <div 
        className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center transition-all duration-[1500ms] ease-in-out ${hasEntered ? "opacity-0 pointer-events-none scale-105" : "opacity-100 scale-100"}`}
      >
        {/* Subtle background glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at center, rgba(232, 228, 217, 0.05) 0%, transparent 70%)" }} />
        
        <div className="text-center mb-16 relative z-10">
          <p className="text-[10px] tracking-[0.4em] uppercase mb-6 opacity-0 animate-[fadeIn_2s_ease-out_0.5s_forwards]" style={{ fontFamily: mono, color: creamDim }}>
            System Initialization
          </p>
          <h1 className="text-[clamp(3rem,8vw,6rem)] leading-none font-light tracking-tight opacity-0 animate-[fadeIn_2s_ease-out_1s_forwards]" style={{ fontFamily: serif, color: cream }}>
            TerraSight
          </h1>
        </div>
        
        <button 
          onClick={handleEnter}
          className="group relative px-12 py-4 overflow-hidden rounded-full border border-white/20 hover:border-white/50 transition-all duration-500 bg-white/5 hover:bg-white/10 backdrop-blur-xl opacity-0 animate-[fadeIn_2s_ease-out_2s_forwards] shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] scale-100 hover:scale-105 active:scale-95"
        >
          {/* Liquid glass shine effect */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
          
          <span className="relative z-10 text-[13px] tracking-[0.2em] font-medium uppercase transition-colors duration-500 text-white/80 group-hover:text-white" style={{ fontFamily: sans }}>
            Enter Mission
          </span>
        </button>
      </div>

      <audio ref={audioRef} src="/bgm.mp3" loop />

      {/* ═══ GLOBAL FIXED VIDEO ═══ */}
      {/* This ensures the iframe is always in the viewport so it autoplays instantly on page load.
          We use opacity 0.01 when out of section so YouTube thinks it's visible but the user can't see it. */}
      <div 
        className="fixed inset-0 pointer-events-none flex items-center justify-center origin-center transition-opacity duration-300"
        style={{
          zIndex: videoProgress > 0 && videoProgress < 1 ? 10 : -10,
          opacity: videoProgress > 0 && videoProgress < 1 ? 1 : 0.01,
          transform: `translate(${videoTranslateX}vw, 0vh) scale(${videoScale})`,
          willChange: "transform, opacity",
          overflow: "hidden",
          boxShadow: (shrinkPhase > 0.1 && returnPhase < 0.9) ? "-20px 0 100px rgba(0,0,0,0.8)" : "none"
        }}
      >
        <YouTube
          videoId="UjEngEpiJKo"
          opts={{
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 1,
              mute: 1,
              controls: 0,
              loop: 1,
              playlist: 'UjEngEpiJKo',
              showinfo: 0,
              rel: 0,
              modestbranding: 1,
              playsinline: 1,
              cc_load_policy: 3,
              iv_load_policy: 3,
              disablekb: 1
            }
          }}
          onReady={(e) => {
            setCinematicPlayer(e.target);
            e.target.mute();
            e.target.playVideo();
          }}
          className="absolute top-1/2 left-1/2 w-[100vw] h-[56.25vw] min-h-[100vh] min-w-[177.77vh] -translate-x-1/2 -translate-y-1/2 scale-[1.6]"
          iframeClassName="w-full h-full pointer-events-none"
        />
        <div className="absolute inset-0 z-10 pointer-events-auto" />
      </div>

      {/* ════════════════════════════════════════════
          HERO
          ════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative h-[400vh] flex flex-col items-center justify-start bg-black border-b border-white/[0.04]">
        <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
          
          <CircularMarquee progress={heroProgress} />

          {/* Top bar */}
          <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-10 py-7 z-20 pointer-events-none">
            <span
              className="text-sm tracking-[0.2em] uppercase opacity-50 transition-opacity"
              style={{ fontFamily: mono, color: cream, opacity: Math.max(0, 0.5 - heroProgress * 2) }}
            >
              TerraSight
            </span>
          </nav>

          {/* Hero Typography */}
          <div
            className="absolute z-10 text-center max-w-5xl px-8 transition-transform duration-[2000ms] ease-out pointer-events-none"
            style={{
              opacity: heroVisible ? Math.max(0, 1 - heroProgress * 2.5) : 0, // Fades out in first 40% of scroll
              transform: heroVisible ? "translateY(0)" : "translateY(40px)",
            }}
          >
            <h1 className="leading-[0.9] mb-10 drop-shadow-2xl text-center" style={{ fontFamily: serif, color: "#ffffff" }}>
              <span className="block text-[clamp(4.5rem,12vw,10rem)] font-normal tracking-wide">
                TERRAIN
              </span>
              <span className="block text-[clamp(4.5rem,12vw,10rem)] font-normal tracking-wide">
                BEYOND SIGHT
              </span>
            </h1>
          </div>

          {/* Central YouTube Video */}
          <div 
            className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none origin-center overflow-hidden"
            style={{
              // Video becomes visible after 30% of scroll, scales up to 1 by 90%
              // We strictly enforce opacity 0 until YouTube confirms it is actively playing (bypassing buffering/pause flashes)
              opacity: (heroProgress > 0.2 && heroYtPlaying) ? Math.min(1, (heroProgress - 0.2) * 5) : 0,
              transform: `scale(${Math.max(0.01, Math.min(1, (heroProgress - 0.3) / 0.6))})`,
              willChange: "transform, opacity"
            }}
          >
            <YouTube 
              videoId="ViNcBQ8cDA0"
              opts={{
                width: '100%',
                height: '100%',
                playerVars: {
                  start: 32,
                  autoplay: 1, 
                  mute: 1,
                  controls: 0,
                  disablekb: 1,
                  modestbranding: 1,
                  rel: 0,
                  showinfo: 0,
                  playsinline: 1
                }
              }}
              onReady={(e) => {
                setYtPlayer(e.target);
                e.target.mute();
                e.target.playVideo();
              }}
              onStateChange={(e) => {
                if (e.data === 1) { // 1 = PLAYING
                  setHeroYtPlaying(true);
                } else if (e.data === 0) { // 0 = ENDED
                  // Manual seamless loop to avoid the "||" flash at the end
                  e.target.seekTo(32, true);
                  e.target.playVideo();
                } else {
                  // If buffering or paused, keep it visible if it was already playing,
                  // or you could hide it again. We'll leave it visible to avoid flickering.
                }
              }}
              // Scale the iframe 1.5x to push all YouTube UI (logo, title) off the edges of the screen
              className="absolute top-1/2 left-1/2 w-[100vw] h-[56.25vw] min-h-[100vh] min-w-[177.77vh] -translate-x-1/2 -translate-y-1/2 scale-[1.5]"
              iframeClassName="w-full h-full pointer-events-none"
            />
            {/* Overlay shield for clicks */}
            <div className="absolute inset-0 z-10 pointer-events-auto" />
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent z-30 pointer-events-none" />
        </div>
      </section>

      {/* ════════════════════════════════════════════
          EYES ON SECTION — text animation
          ════════════════════════════════════════════ */}
      <section ref={expandRef} className="relative h-[250vh]">
        {/* Sticky container stays in view while scrolling through the 250vh section */}
        {/* Sticky container stays in view while scrolling through the 250vh section */}
        <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center overflow-hidden">
          
          <div className="absolute top-10 text-[10px] tracking-[0.3em] uppercase opacity-25 z-20" style={{ fontFamily: mono, color: cream }}>
            Surface Intelligence
          </div>

          <div className="relative w-full h-full flex items-center justify-center">
            
            {/* The Image — starts as small landscape, grows to full screen */}
            <div 
              className="absolute flex items-center justify-center z-0"
              style={{
                width: `${40 + eyesOnProgress * 60}vw`,  // starts at 40vw, ends at 100vw
                height: `${25 + eyesOnProgress * 75}vh`, // starts at 25vh, ends at 100vh
                borderRadius: `${(1 - eyesOnProgress) * 2}rem`,
                overflow: "hidden",
                willChange: "width, height, border-radius, box-shadow",
                boxShadow: `0 20px 50px rgba(0,0,0,${0.5 * (1 - eyesOnProgress)})`
              }}
            >
              <img 
                src="/images/eyes-on-img.jpg" 
                alt="All Eyes On" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40" /> {/* Overlay so text is readable */}
            </div>

            {/* The Huge Text */}
            <h2 
              className="relative z-10 font-light text-center whitespace-nowrap drop-shadow-2xl" 
              style={{ 
                fontFamily: serif, 
                color: "#ffffff",
                // Render text massive to prevent pixelation during scale
                fontSize: "max(120px, 30vw)",
                // Starts enormous (scale ~3.5), shrinks to normal size (scale ~0.15)
                transform: `scale(${0.15 + Math.pow(1 - eyesOnProgress, 2) * 3.5})`,
                willChange: "transform"
              }}
            >
              <span className="font-normal tracking-wide">ALL EYES ON</span>
            </h2>
            
          </div>
          
          {/* Decorative SVG scan lines at bottom of sticky container */}
          <svg className="absolute left-0 right-0 bottom-0 w-full h-20 pointer-events-none z-20" preserveAspectRatio="none" viewBox="0 0 1200 80">
            <line x1="0" y1="40" x2="1200" y2="40" stroke="var(--cream)" strokeWidth="0.5" opacity="0.04" />
            <line x1="0" y1="60" x2="1200" y2="60" stroke="var(--cream)" strokeWidth="0.3" opacity="0.03" />
          </svg>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          CINEMATIC VIDEO SCROLL
          ════════════════════════════════════════════ */}
      <section ref={videoRef} className="relative h-[1800vh] bg-black border-t border-white/[0.04]">
        <div className="sticky top-0 h-screen overflow-hidden flex items-center justify-center">
          
          {(() => {
            // Phase 2: Text scrolls horizontally (20% → 70%)
            const textPhase = videoProgress < 0.2 ? 0 : Math.min(1, (videoProgress - 0.2) / 0.5); 
            
            // Text opacity: fully visible during phase 2, fades in phase 3
            const textOpacity = textPhase > 0 ? 0.9 * (1 - returnPhase) : 0;

            return (
              <>
                {/* Background Typography */}
                <div 
                  className="absolute inset-0 flex items-center overflow-hidden z-0 pointer-events-none"
                  style={{ opacity: textOpacity, transition: "opacity 0.1s ease" }}
                >
                  <h2 
                    className="whitespace-nowrap font-light drop-shadow-2xl"
                    style={{
                      fontFamily: serif,
                      color: "#ffffff",
                      fontSize: "max(120px, 15vw)",
                      transform: `translateX(${100 - textPhase * 1400}vw)`,
                      willChange: "transform"
                    }}
                  >
                    <span className="font-normal tracking-wide">Do not go gentle into that good night</span>
                    <img src="https://i.pinimg.com/736x/e0/be/a0/e0bea09fd3261b3c7c8287c29c8a54f0.jpg" alt="" className="h-[0.75em] w-[1.2em] object-cover inline-block align-middle mx-6 opacity-100" style={{ borderRadius: "0.2em" }} />
                    <span className="font-normal tracking-wide">Old age should burn and rave at close of day</span>
                    <img src="https://i.pinimg.com/1200x/cf/48/52/cf4852ba5990fe101d8b66cde8eb321a.jpg" alt="" className="h-[0.75em] w-[1.2em] object-cover inline-block align-middle mx-6 opacity-100" style={{ borderRadius: "0.2em" }} />
                    <span className="font-normal tracking-wide">Rage</span>
                    <img src="https://i.pinimg.com/736x/2a/cb/9d/2acb9d825a2a967731e50c6081d666b6.jpg" alt="" className="h-[0.75em] w-[1.2em] object-cover inline-block align-middle mx-6 opacity-100" style={{ borderRadius: "0.2em" }} />
                    <span className="font-normal tracking-wide">rage against the dying of the light</span>
                    <img src="https://i.pinimg.com/736x/1c/a7/23/1ca723555ae4bc19cee869a84e085867.jpg" alt="" className="h-[0.75em] w-[1.2em] object-cover inline-block align-middle mx-6 opacity-100" style={{ borderRadius: "0.2em" }} />
                    <img src="https://i.pinimg.com/736x/0c/d1/20/0cd120357fe9c7a99e39e14aa4dd296a.jpg" alt="" className="h-[0.75em] w-[1.2em] object-cover inline-block align-middle mx-6 opacity-100" style={{ borderRadius: "0.2em" }} />
                  </h2>
                </div>
              </>
            );
          })()}
          
        </div>
      </section>



      {/* ════════════════════════════════════════════
          ROVER FULL SCREEN SCROLL
          ════════════════════════════════════════════ */}
      <section ref={roverSectionRef} className="relative h-[300vh] bg-black border-t border-white/[0.04]">
        <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden bg-transparent pointer-events-none">
          {/* Subtle text overlay when massive */}
          <div 
            className="absolute z-10 pointer-events-none text-center transition-all duration-300"
            style={{
               opacity: roverScrollProgress > 0.6 ? Math.min(1, (roverScrollProgress - 0.6) * 4) : 0,
               transform: `translateY(${roverScrollProgress > 0.6 ? 0 : 20}px)`
            }}
          >
            <div className="text-[10px] tracking-[0.3em] uppercase mb-4" style={{ fontFamily: mono, color: cream }}>
              Autonomous Perception
            </div>
            <h2 className="text-[clamp(2.5rem,6vw,5rem)] font-light" style={{ fontFamily: serif, color: cream }}>
              Built for <em className="font-normal">Extremes</em>
            </h2>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          MISSION CONTROL BUTTON
          ════════════════════════════════════════════ */}
      <section className="relative py-40 px-10 flex flex-col items-center justify-center bg-black border-t border-white/[0.04]">
        <div className="text-center mb-10">
          <h2 className="text-[clamp(1.5rem,4vw,3rem)] font-light mb-4" style={{ fontFamily: serif, color: cream }}>
            Ready to explore?
          </h2>
          <p className="text-[14px] opacity-40 max-w-md mx-auto" style={{ fontFamily: serif, color: cream }}>
            Access the live telemetry, terrain grid, and mission control systems to monitor rover progress.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Link
            href="/mission-control"
            className="group relative px-8 py-4 rounded-full border border-white/20 hover:border-white/50 bg-white/5 hover:bg-white/10 transition-all duration-500 overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-[1500ms] ease-out pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
              <span className="text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ fontFamily: mono, color: cream }}>
                Enter Mission Control
              </span>
              <span className="text-[14px] transition-transform duration-300 group-hover:translate-x-1" style={{ color: cream }}>
                →
              </span>
            </div>
          </Link>

          <Link
            href="/terrain"
            className="group relative px-8 py-4 rounded-full border border-emerald-500/30 hover:border-emerald-400/60 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all duration-500 overflow-hidden"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-[1500ms] ease-out pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
              <span className="text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ fontFamily: mono, color: "#34D399" }}>
                Terrain Overview
              </span>
              <span className="text-[14px] transition-transform duration-300 group-hover:translate-x-1" style={{ color: "#34D399" }}>
                →
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════════ */}
      <footer className="relative z-50 py-20 px-10 border-t border-white/[0.04] bg-black">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <span className="text-[13px] font-light" style={{ fontFamily: serif, color: creamDim }}>
            TerraSight
          </span>
          <span className="text-[10px] tracking-[0.15em] uppercase" style={{ fontFamily: mono, color: "rgba(232,228,217,0.15)" }}>
            Onboard Edge-AI Perception
          </span>
        </div>
      </footer>

      {/* ═══ The Singular Floating Rover ═══ */}
      <div 
        ref={roverWrapperRef}
        className="fixed inset-0 z-[40] pointer-events-none flex items-center justify-center will-change-transform"
      >
        <RoverCompanion 
          size="100%" 
          zoom={0.45 + Math.pow(roverScrollProgress, 2) * 15.55} 
          scrollProgress={roverScrollProgress} 
        />
      </div>
    </div>
  );
}
