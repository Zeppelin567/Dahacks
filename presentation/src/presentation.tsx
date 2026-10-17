import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bookmark,
  CheckCircle2,
  Compass,
  Eye,
  Flame,
  Layers,
  Leaf,
  MessageCircle,
  Route,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TreePine,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { type DemoData, FULL_DATASET_PHOTOS, type Manifest, MEDIA, type PhotoSample } from "./data";
import { ProductDemo } from "./demo";
import { PathfindingDecisionDiagram } from "./pathfinding-diagram";
import StreetScanner from "./street-scanner";
import { TechStack } from "./tech-stack";
import { CityWireframe, NatureWireframe } from "./wireframes";
import "./presentation.css";
import "./scroll-showcase.css";

/* ── Reddit SVG Logo ── */
function RedditLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="10" fill="#FF4500" />
      <path
        d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.08 2.14.45a1 1 0 101.07-1.05 1 1 0 00-.96.68l-2.37-.5a.27.27 0 00-.3.21L10.86 7.7a7.17 7.17 0 00-3.9 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 00-.05.44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 00-.05-.44A1.46 1.46 0 0016.67 10zM7.82 11.17a1 1 0 111 1 1 1 0 01-1-1zm5.6 2.63a3.58 3.58 0 01-2.29.66 3.58 3.58 0 01-2.29-.66.3.3 0 01.42-.42 3 3 0 001.87.54 3 3 0 001.87-.54.3.3 0 01.42.42zm-.18-1.65a1 1 0 111-1 1 1 0 01-1 1z"
        fill="#fff"
      />
    </svg>
  );
}

/* ── Reddit Comment Component ── */
function RedditComment({
  subreddit,
  username,
  time,
  body,
  upvotes,
  commentCount,
}: {
  subreddit: string;
  username: string;
  time: string;
  body: string;
  upvotes: string;
  commentCount: string;
}) {
  return (
    <div className="bs-reddit-card">
      <div className="bs-reddit-card-inner">
        <div className="bs-reddit-votes">
          <span className="bs-reddit-vote-btn is-up">▲</span>
          <span className="bs-reddit-vote-count">{upvotes}</span>
          <span className="bs-reddit-vote-btn">▼</span>
        </div>
        <div className="bs-reddit-content">
          <div className="bs-reddit-header">
            <RedditLogo size={18} />
            <span className="bs-reddit-sub">r/{subreddit}</span>
            <span className="bs-reddit-dot">•</span>
            <span className="bs-reddit-user">Posted by u/{username}</span>
            <span className="bs-reddit-dot">•</span>
            <span className="bs-reddit-time">{time}</span>
          </div>
          <div className="bs-reddit-body">{body}</div>
          <div className="bs-reddit-actions">
            <span className="bs-reddit-action">
              <MessageCircle size={14} /> {commentCount} Comments
            </span>
            <span className="bs-reddit-action">
              <Share2 size={14} /> Share
            </span>
            <span className="bs-reddit-action">
              <Bookmark size={14} /> Save
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Photo Orbit ── */
function PhotoOrbit({ photos, paused }: { photos: PhotoSample[]; paused: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const stopped = useRef(paused);
  stopped.current = paused;
  const [run, setRun] = useState(0);

  useEffect(() => {
    void run;
    const el = root.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>(".rs-orbit-card"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let time = stopped.current ? 7.5 : 0;
    let last = performance.now();

    function draw(now: number) {
      const delta = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      if (!stopped.current && !document.hidden) time += delta;
      const w = el?.clientWidth ?? 1000;
      const h = el?.clientHeight ?? 600;

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card) continue;
        const p = reduce ? 1 : Math.max(0, Math.min(1, (time - i * 0.045) / 2.8));
        const ease = 1 - (1 - p) ** 4;
        const angle = (i / cards.length) * Math.PI * 2 + (reduce ? 0 : time * 0.085) + (1 - ease) * 2;
        const radiusX = w * 0.4 + (1 - ease) * w * 0.7;
        const radiusY = h * 0.20 + (1 - ease) * h * 0.8;
        const depth = Math.sin(angle) * 45;
        card.style.transform = `translate3d(${Math.cos(angle) * radiusX}px, ${Math.sin(angle) * radiusY}px, ${depth}px) rotate(${Math.sin(angle * 2) * 8}deg) scale(${0.82 + (Math.sin(angle) + 1) * 0.16})`;
        card.style.opacity = `${ease * (0.55 + (Math.sin(angle) + 1) * 0.225)}`;
        card.style.zIndex = String(Math.round((Math.sin(angle) + 1) * 30) + 1);
      }

      if (counter.current) {
        const progress = reduce ? 1 : Math.min(time / 7.5, 1);
        counter.current.textContent = Math.round(
          FULL_DATASET_PHOTOS * (1 - (1 - progress) ** 2),
        ).toLocaleString("en-US");
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [run]);

  return (
    <div className="rs-orbit-scene" ref={root}>
      <div className="rs-orbit-ring" />
      {photos.slice(0, 28).map((p, i) => (
        <figure className="rs-orbit-card" key={p.src}>
          <img src={`${MEDIA}${p.src}`} alt="" />
          <figcaption>
            {String(i + 1).padStart(3, "0")} <span>{p.name === "nan" ? "Cupertino street" : p.name}</span>
          </figcaption>
        </figure>
      ))}
      <div className="rs-orbit-count">
        <strong>
          <span ref={counter}>0</span>
        </strong>
        <span className="rs-count-caption">Street View images</span>
      </div>
      <div className="rs-orbit-foot">
        <span>
          <b>80 m</b> between samples
        </span>
        <span>
          <b>2–4</b> perspectives per location
        </span>
        <span>
          <b>0</b> live AI calls when routing
        </span>
      </div>
      <small className="rs-attribution">Imagery © Google Street View</small>
    </div>
  );
}

/* ── Hacker / Algorithm Animated Title ── */
function HackerTitle({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState(text);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>[]_";

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          let iteration = 0;
          const interval = setInterval(() => {
            setDisplayText(
              text
                .split("")
                .map((char, index) => {
                  if (char === " ") return " ";
                  if (index < iteration) return text[index];
                  return chars[Math.floor(Math.random() * chars.length)];
                })
                .join("")
            );
            if (iteration >= text.length) {
              clearInterval(interval);
            }
            iteration += 1 / 2;
          }, 45);
        }
      },
      { threshold: 0.2 }
    );

    if (elementRef.current) observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [text, hasAnimated]);

  return (
    <div className="bs-hacker-headline" ref={elementRef}>
      <span className="bs-hacker-prefix">[ALGO:ACTIVE]</span>
      <span className="bs-hacker-text">{displayText}</span>
      <span className="bs-hacker-cursor">_</span>
    </div>
  );
}

export default function Presentation() {
  const [manifest, setManifest] = useState<Manifest>();
  const [data, setData] = useState<DemoData>();
  const [error, setError] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [demoUiMode, setDemoUiMode] = useState<"modern" | "nature">("modern");
  const sandboxTrackRef = useRef<HTMLDivElement>(null);
  const demoUiModeRef = useRef<"modern" | "nature">("modern");
  const userInteractedRef = useRef<boolean>(false);

  // Keep ref synchronized
  useEffect(() => {
    demoUiModeRef.current = demoUiMode;
  }, [demoUiMode]);

  const scrollToSection = (idx: number) => {
    const sec = document.querySelector<HTMLElement>(`[data-section-idx="${idx}"]`);
    if (sec) {
      sec.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Fetch Presentation Dataset
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`${MEDIA}manifest.json`, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error("media");
        return r.json();
      }),
      fetch(`${MEDIA}routes.json`, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error("routes");
        return r.json();
      }),
    ])
      .then(([m, d]) => {
        setManifest(m);
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, []);

  // Initialize Lenis Smooth Scrolling & Unified Scroll-Tracking
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // Track active section and automatic sandbox mode switch
    const onScroll = () => {
      // 1. Update active section
      const sections = document.querySelectorAll<HTMLElement>("[data-section-idx]");
      let currentIdx = 0;
      const viewMiddle = window.scrollY + window.innerHeight * 0.45;

      sections.forEach((sec, idx) => {
        const top = sec.offsetTop;
        const bottom = top + sec.offsetHeight;
        if (viewMiddle >= top && viewMiddle < bottom) {
          currentIdx = idx;
        }
      });
      setActiveSection(currentIdx);

      // 2. Centered Sticky Sandbox Mode Sliding
      if (sandboxTrackRef.current) {
        const rect = sandboxTrackRef.current.getBoundingClientRect();
        const vh = window.innerHeight;
        const sandboxHeight = 680;
        const centerTop = Math.max(20, (vh - sandboxHeight) / 2);

        // Distance the track has scrolled past the centering point:
        const pinScroll = centerTop - rect.top;
        const totalPinTravel = 950;

        // Reset manual interaction lock if user scrolls away from this section
        if (rect.top > vh || rect.bottom < 0) {
          userInteractedRef.current = false;
        }

        if (!userInteractedRef.current) {
          // While scrolling down to center and during the first 260px of pinned scroll:
          // Stay firmly in Fast & Safe!
          if (pinScroll < 260) {
            if (demoUiModeRef.current !== "modern") {
              demoUiModeRef.current = "modern";
              setDemoUiMode("modern");
            }
          } else if (pinScroll >= 260 && pinScroll <= totalPinTravel + 200) {
            // As user continues scrolling further down with sandbox centered:
            // Mode slides to Nature Mode!
            if (demoUiModeRef.current !== "nature") {
              demoUiModeRef.current = "nature";
              setDemoUiMode("nature");
            }
          }
        }
      }
    };

    lenis.on("scroll", onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      lenis.destroy();
    };
  }, []);

  // Scroll-Driven Reveal Observer for Smooth Element Transitions
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in-view");
          }
        });
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    const elements = document.querySelectorAll<HTMLElement>(
      ".bs-reveal, .bs-reveal-stagger, .bs-reveal-left, .bs-reveal-right, .bs-reveal-scale"
    );
    elements.forEach((el) => {
      // Check if already inside viewport or above fold on mount
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 30) {
        el.classList.add("is-in-view");
      }
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, [manifest, data]);

  return (
    <div className="bs-showcase">
      {/* Floating Scroll Nav Indicator */}
      <nav className="bs-scroll-nav" aria-label="Scroll Progress">
        {[
          "Overview",
          "Target Audience",
          "The Problem",
          "Our Solution",
          "Technical Architecture",
          "Our Vision",
        ].map((label, idx) => (
          <div
            key={label}
            className={`bs-nav-dot ${activeSection === idx ? "is-active" : ""}`}
            onClick={() => scrollToSection(idx)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") scrollToSection(idx);
            }}
          >
            <span className="bs-nav-dot-label">{label}</span>
            <div className="bs-nav-dot-pip" />
          </div>
        ))}
      </nav>

      {/* ====================================================================
          SECTION 1: HERO & PHONE OVERVIEW
          ==================================================================== */}
      <section className="bs-section" data-section-idx="0">
        <div className="bs-container">
          <div className="bs-hero-grid">
            <div className="bs-reveal">
              <div className="bs-badge">
                <Sparkles size={14} />
                <span>Next-Gen Cyclist Navigation</span>
              </div>
              <h1 className="bs-headline">
                Bike<em>Scape</em>.
                <br />
                Your road, <span className="bs-nowrap">re-imagined.</span>
              </h1>
              <p className="bs-lead">
                Current navigation system is not bicycle friendly. BikeScape uses street-level
                computer vision and street safety analysis to route you through what the street{" "}
                <em>actually feels like</em>.
              </p>

              <div className="bs-hero-stats bs-reveal-stagger">
                <div className="bs-stat-item">
                  <strong>8,514</strong>
                  <span>Junctions Mapped</span>
                </div>
                <div className="bs-stat-item">
                  <strong>95%</strong>
                  <span>Cupertino Street Analyzed</span>
                </div>
              </div>
            </div>

            {/* Live App UI in Phone Mockup */}
            <div className="bs-phone-wrapper bs-reveal-scale">
              <div className="bs-phone-mockup">
                <div className="bs-phone-notch" />
                <div className="bs-phone-screen">
                  <iframe
                    src="/bike-app"
                    title="BikeScape App Preview"
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          SECTION 2: TARGET AUDIENCE — ONE BIKE, DIFFERENT PURPOSE
          ==================================================================== */}
      <section className="bs-section bs-dual-world-section" data-section-idx="1">
        <div className="bs-dual-backdrop">
          <div className="bs-dual-side-city">
            <CityWireframe />
          </div>
          <div className="bs-dual-side-nature">
            <NatureWireframe />
          </div>
          <div className="bs-dual-divider" />
        </div>
        <div className="bs-container" style={{ position: "relative", zIndex: 2 }}>
          <div className="bs-reveal">
            <div className="bs-badge bs-badge-emerald">
              <Compass size={14} />
              <span>Target Audience</span>
            </div>
            <h2 className="bs-headline">
              One bicycle.
              <br />
              <em>Two completely different worlds.</em>
            </h2>
            <p className="bs-lead">
              A bicycle is rarely just a tool—it is shaped by why you ride. A fast commute demands
              zero danger; a weekend ride demands peace of mind.
            </p>
          </div>

          <div className="bs-split-grid bs-reveal-stagger">
            {/* Persona 1: Modern Commuter */}
            <div className="bs-card-glass bs-reveal-left">
              <div className="bs-card-header">
                <span className="bs-card-tag bs-card-tag-cyan">
                  Modern Commuter · Urban Rush
                </span>
                <Zap size={18} style={{ color: "var(--bs-cyan)", opacity: 0.7 }} />
              </div>

              <p className="bs-persona-quote">
                "I have an 8:30 AM class at De Anza. Silicon Valley traffic is gridlocked. My bike
                is the fastest vehicle on the road—until maps force me onto a deadly 50 mph stroad."
              </p>

              <ul className="bs-persona-features">
                <li>
                  <CheckCircle2 size={15} style={{ color: "var(--bs-cyan)", flexShrink: 0 }} />
                  <span>
                    <strong>Goal:</strong>
                    <span className="bs-persona-pill bs-pill-cyan">Fast</span>
                    <span className="bs-persona-pill bs-pill-cyan">Safe</span>
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={15} style={{ color: "var(--bs-cyan)", flexShrink: 0 }} />
                  <span>
                    <strong>Enemy:</strong> 6-lane expressways & 50 mph traffic
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={15} style={{ color: "var(--bs-cyan)", flexShrink: 0 }} />
                  <span>
                    <strong>Priority:</strong> Protected bike lanes & time certainty
                  </span>
                </li>
              </ul>
            </div>

            {/* Persona 2: Nature Enthusiast */}
            <div className="bs-card-glass bs-reveal-right">
              <div className="bs-card-header">
                <span className="bs-card-tag bs-card-tag-emerald">
                  Nature Lover · Leisure Escape
                </span>
                <Leaf size={18} style={{ color: "var(--bs-emerald)", opacity: 0.7 }} />
              </div>

              <p className="bs-persona-quote">
                "After spending 9 hours behind a computer screen, I want fresh air and green trees.
                The journey is the reward. A 5-minute detour is worth it if I get shade and quiet."
              </p>

              <ul className="bs-persona-features">
                <li>
                  <CheckCircle2 size={15} style={{ color: "var(--bs-emerald)", flexShrink: 0 }} />
                  <span>
                    <strong>Goal:</strong>
                    <span className="bs-persona-pill bs-pill-emerald">Fresh Air</span>
                    <span className="bs-persona-pill bs-pill-emerald">Quiet Streets</span>
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={15} style={{ color: "var(--bs-emerald)", flexShrink: 0 }} />
                  <span>
                    <strong>Enemy:</strong> Loud concrete roads & car exhaust
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={15} style={{ color: "var(--bs-emerald)", flexShrink: 0 }} />
                  <span>
                    <strong>Priority:</strong> Tree shade, parks & creek paths
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          SECTION 3: THE PROBLEM — CURRENT NAVIGATION TOOLS
          ==================================================================== */}
      <section className="bs-section" data-section-idx="2">
        <div className="bs-container">
          <div className="bs-reveal">
            <div className="bs-badge bs-badge-red">
              <ShieldAlert size={14} />
              <span>The Problem · Car-Centric Algorithms</span>
            </div>

            <h2 className="bs-headline bs-headline-red">
              Google Maps thinks you're
              <br />
              <em>a two-ton steel vehicle.</em>
            </h2>
          </div>

          {/* Authentic Reddit Comments */}
          <div className="bs-reddit-stream bs-reveal-stagger">
            <RedditComment
              subreddit="bikecommuting"
              username="SiliconCommuter"
              time="8h ago"
              body={`Google Maps almost got me killed this morning. It routed me onto an expressway on-ramp with 55mph traffic and told me to "turn left across 3 lanes". There wasn't even a shoulder, let alone a bike lane!`}
              upvotes="2.4k"
              commentCount="382"
            />

            <RedditComment
              subreddit="bicycling"
              username="VeloRider99"
              time="14h ago"
              body={`Never trust Google Maps for cycling. It considers a 6-lane stroad with 40mph roaring semi-trucks "bicycle friendly" simply because it lacks a freeway badge. It has zero understanding of traffic stress.`}
              upvotes="1.9k"
              commentCount="245"
            />
          </div>

          {/* Nature Problem: Right-Aligned Title & Street View Nature Audit */}
          <div className="bs-nature-problem-heading bs-reveal">
            <div className="bs-badge bs-badge-emerald">
              <TreePine size={14} />
              <span>The Blindspot · Zero Natural Intelligence</span>
            </div>
            <h2 className="bs-headline bs-headline-emerald">
              Google Maps doesn't
              <br />
              <em>have taste in nature.</em>
            </h2>
          </div>

          <div className="bs-nature-fail-card bs-reveal">
            <div className="bs-nature-fail-media">
              <img
                src="/google_maps_nature_fail.jpg"
                alt="Google Maps shortest path on Bramhall Ave"
                className="bs-nature-fail-img"
              />
              <div className="bs-nature-media-tag-top">
                <span className="bs-nature-tag-pill">Most "Optimized" Path</span>
                <span className="bs-nature-tag-dist">Bramhall Ave · 100% Distance Metric</span>
              </div>
              <div className="bs-nature-media-bottom">
                <ShieldAlert size={16} style={{ color: "var(--bs-red)", flexShrink: 0 }} />
                <span>Street View Vision Audit: High concrete dominance, zero tree canopy shade</span>
              </div>
            </div>

            <div className="bs-nature-fail-info">
              <div>
                <div className="bs-nature-score-header">
                  <span className="bs-nature-score-label">AI Street Nature Audit</span>
                  <div className="bs-nature-score-pill">
                    <Flame size={14} />
                    <span>1.2% / 100 NATURE SCORE</span>
                  </div>
                </div>

                <p className="bs-nature-fail-desc">
                  This is the type of road you get when algorithms optimize solely for the
                  shortest geometric line. Bare asphalt, baking heat, and zero living nature.
                </p>

                <div className="bs-nature-bars">
                  <div className="bs-nature-bar-item">
                    <div className="bs-nature-bar-labels">
                      <span>🌳 Tree Canopy & Shade</span>
                      <span className="bs-nature-bar-val" style={{ color: "var(--bs-red)" }}>
                        0.0%
                      </span>
                    </div>
                    <div className="bs-nature-bar-track">
                      <div className="bs-nature-bar-fill" style={{ width: "2%", background: "var(--bs-red)" }} />
                    </div>
                  </div>

                  <div className="bs-nature-bar-item">
                    <div className="bs-nature-bar-labels">
                      <span>🌿 Living Plants & Greenery</span>
                      <span className="bs-nature-bar-val" style={{ color: "var(--bs-red)" }}>
                        1.2%
                      </span>
                    </div>
                    <div className="bs-nature-bar-track">
                      <div className="bs-nature-bar-fill" style={{ width: "3%", background: "var(--bs-red)" }} />
                    </div>
                  </div>

                  <div className="bs-nature-bar-item">
                    <div className="bs-nature-bar-labels">
                      <span>💧 Water Elements & Streams</span>
                      <span className="bs-nature-bar-val" style={{ color: "var(--bs-red)" }}>
                        0.0%
                      </span>
                    </div>
                    <div className="bs-nature-bar-track">
                      <div className="bs-nature-bar-fill" style={{ width: "1%", background: "var(--bs-red)" }} />
                    </div>
                  </div>

                  <div className="bs-nature-bar-item">
                    <div className="bs-nature-bar-labels">
                      <span>🏗️ Concrete, Asphalt & Wire Clutter</span>
                      <span className="bs-nature-bar-val" style={{ color: "#fb923c" }}>
                        98.8%
                      </span>
                    </div>
                    <div className="bs-nature-bar-track">
                      <div
                        className="bs-nature-bar-fill"
                        style={{
                          width: "98.8%",
                          background: "linear-gradient(90deg, #f87171, #fb923c)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bs-nature-contrast-note">
                <strong>Why BikeScape Differs:</strong> Our Haiku vision pipeline rates street-level
                tree canopy and green density in advance. Nature Mode actively penalizes barren
                concrete corridors, pulling you through lush, shaded residential streets and park
                creeks.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          SECTION 4: OUR SOLUTION — BIKESCAPE 5-PILLAR INTELLIGENCE
          ==================================================================== */}
      <section className="bs-section bs-section-solution" data-section-idx="3">
        <div className="bs-container">
          <div className="bs-reveal">
            <HackerTitle text="OUR SOLUTION" />
          </div>

          <div className="bs-solutions-grid bs-reveal-stagger">
            <div className="bs-sol-card">
              <div className="bs-sol-icon">
                <ShieldAlert size={20} />
              </div>
              <h4>1. Danger Analysis</h4>
              <p>
                Identifies road hazards like high-speed merges, blind spots, and door zones.
              </p>
            </div>

            <div className="bs-sol-card">
              <div className="bs-sol-icon">
                <Route size={20} />
              </div>
              <h4>2. Safe Routing</h4>
              <p>
                Finds the safest route, avoiding dangerous expressways and busy multi-lane roads.
              </p>
            </div>

            <div className="bs-sol-card">
              <div className="bs-sol-icon">
                <Leaf size={20} />
              </div>
              <h4>3. Nature Path</h4>
              <p>
                Creates small detours to create a journey with more nature.
              </p>
            </div>
          </div>

          {/* Centered Sticky Product Sandbox Track */}
          <div className="bs-sandbox-track" ref={sandboxTrackRef}>
            <div className="bs-demo-sticky-wrapper">
              <div className="bs-demo-container bs-reveal">
                <div className="bs-demo-header">
                  <div className="bs-demo-header-left">
                    <div className="bs-demo-dot" />
                    <span className="bs-demo-label">
                      Interactive Product Sandbox — Cupertino Live
                    </span>
                  </div>
                  <div className="bs-scroll-mode-indicator">
                    <div className="bs-scroll-slider-track">
                      <div
                        className="bs-scroll-slider-thumb"
                        style={{
                          transform: demoUiMode === "nature" ? "translateX(100%)" : "translateX(0%)",
                          background:
                            demoUiMode === "nature"
                              ? "linear-gradient(135deg, rgba(52, 211, 153, 0.45), rgba(16, 185, 129, 0.55))"
                              : "linear-gradient(135deg, rgba(34, 211, 238, 0.45), rgba(6, 182, 212, 0.55))",
                          borderColor: demoUiMode === "nature" ? "var(--bs-emerald)" : "var(--bs-cyan)",
                          boxShadow:
                            demoUiMode === "nature"
                              ? "0 0 16px rgba(52, 211, 153, 0.45)"
                              : "0 0 16px rgba(34, 211, 238, 0.45)",
                        }}
                      />
                      <button
                        type="button"
                        className={`bs-slider-tab ${demoUiMode === "modern" ? "is-active" : ""}`}
                        onClick={() => {
                          userInteractedRef.current = true;
                          setDemoUiMode("modern");
                        }}
                      >
                        <Zap size={14} />
                        <span>Fast & Safe</span>
                      </button>
                      <button
                        type="button"
                        className={`bs-slider-tab ${demoUiMode === "nature" ? "is-active" : ""}`}
                        onClick={() => {
                          userInteractedRef.current = true;
                          setDemoUiMode("nature");
                        }}
                      >
                        <Leaf size={14} />
                        <span>Nature Mode</span>
                      </button>
                    </div>
                  </div>
                </div>
                {data && (
                  <ProductDemo
                    data={data}
                    paused={false}
                    ui={demoUiMode}
                    onModeChange={(m) => {
                      userInteractedRef.current = true;
                      setDemoUiMode(m);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          SECTION 5: TECHNICAL PIPELINE & PATHFINDING
          ==================================================================== */}
      <section className="bs-section" data-section-idx="4">
        <div className="bs-container">
          <div className="bs-reveal">
            <div className="bs-badge bs-badge-emerald">
              <Layers size={14} />
              <span>Under The Hood · Data & Algorithms</span>
            </div>

            <h2 className="bs-headline">
              From raw pixels
              <br />
              <em>to intelligent routing.</em>
            </h2>
          </div>

          {/* Autonomous Street Vision Ingestion & Scoring Engine */}
          <StreetScanner />

          {/* Sequential Pipeline Flow with Arrows */}
          <div className="bs-flow-sequence bs-reveal-stagger">
            {/* Step 1 */}
            <div className="bs-flow-node">
              <div className="bs-step-badge">STEP 01</div>
              <h4 className="bs-step-title">Data Ingestion</h4>
              <p className="bs-step-desc">Extracted 629 km of street images every 80 meters.</p>
              <div className="bs-tech-pills">
                <span className="bs-tech-pill">OSM API</span>
                <span className="bs-tech-pill">Cupertino GIS</span>
              </div>
            </div>

            <div className="bs-flow-arrow">
              <ArrowRight size={22} />
            </div>

            {/* Step 2 */}
            <div className="bs-flow-node">
              <div className="bs-step-badge">STEP 02</div>
              <h4 className="bs-step-title">Multi-Angle Vision</h4>
              <p className="bs-step-desc">2 views for bike roads, 4 views for intersections.</p>
              <div className="bs-tech-pills">
                <span className="bs-tech-pill">Google Street View API</span>
              </div>
            </div>

            <div className="bs-flow-arrow">
              <ArrowRight size={22} />
            </div>

            {/* Step 3 */}
            <div className="bs-flow-node">
              <div className="bs-step-badge">STEP 03</div>
              <h4 className="bs-step-title">AI Safety Scoring</h4>
              <p className="bs-step-desc">Evaluates road stress, tree canopy %, and hazards.</p>
              <div className="bs-tech-pills">
                <span className="bs-tech-pill">Claude Haiku 5.5</span>
                <span className="bs-tech-pill">LTS 1–4</span>
              </div>
            </div>

            <div className="bs-flow-arrow">
              <ArrowRight size={22} />
            </div>

            {/* Step 4 */}
            <div className="bs-flow-node">
              <div className="bs-step-badge">STEP 04</div>
              <h4 className="bs-step-title">Offline Routing Graph</h4>
              <p className="bs-step-desc">8,514 junctions baked for sub-second Dijkstra routing.</p>
              <div className="bs-tech-pills">
                <span className="bs-tech-pill">Dijkstra Cost</span>
                <span className="bs-tech-pill">NetworkX</span>
              </div>
            </div>
          </div>

          {/* 13,000 Perspectives Photo Swerve Animation */}
          <div className="bs-orbit-container bs-reveal">
            <div className="bs-orbit-header">
              <span className="bs-orbit-label">
                13,000 Perspectives · Scale Demo
              </span>
              <h3 className="bs-orbit-title">
                Visual Inspection Covering Every Corner of Cupertino
              </h3>
            </div>
            <div className="bs-orbit-stage">
              {manifest && <PhotoOrbit photos={manifest.photos} paused={false} />}
            </div>
          </div>

          {/* Path Finding Algorithm & Its Detail */}
          <div className="bs-pathfinding-wrapper bs-reveal">
            <div className="bs-section-subheading">
              <span className="bs-subheading-tag">Dijkstra Perceived Cost Optimization</span>
              <h3 className="bs-subheading-title">Path Finding Algorithm and Its Detail</h3>
            </div>

            <PathfindingDecisionDiagram />
          </div>

          {/* Tech Stack */}
          <TechStack />
        </div>
      </section>

      {/* ====================================================================
          SECTION 6: OUR QUOTE & PHILOSOPHICAL FINALE
          ==================================================================== */}
      <section className="bs-section bs-quote-section" data-section-idx="5">
        <div className="bs-container">
          <div className="bs-reveal">
            <div className="bs-badge">
              <Sparkles size={14} />
              <span>Our Vision</span>
            </div>

            <p className="bs-english-quote">
              "The fastest path may not be the safest path, and the safest might not be the prettiest
              path.
              <br />
              <strong style={{ color: "var(--bs-cyan)" }}>With BikeScape, speed, safety, and serenity finally become one.</strong>"
            </p>
          </div>

          <div className="bs-cta-group bs-reveal-stagger">
            <a href="/" className="bs-btn-primary">
              <ShieldCheck size={18} />
              <span>Launch Live BikeScape App</span>
            </a>
            <a href="/?mode=nature" className="bs-btn-secondary">
              <Leaf size={18} />
              <span>Explore Nature Discovery</span>
            </a>
          </div>

          <div className="bs-footer-note bs-reveal">
            ENGINEERED FOR CYCLISTS · POWERED BY VISION AI & OPEN DATA · NO LIVE AI CALLS REQUIRED
          </div>
        </div>
      </section>
    </div>
  );
}
