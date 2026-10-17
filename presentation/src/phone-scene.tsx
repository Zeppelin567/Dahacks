import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Phone3DScene({ scrollProgress = 0 }: { scrollProgress?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(scrollProgress);
  scrollRef.current = scrollProgress;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 7.5);

    // Ambient & Directional Lights with futuristic cyan/emerald tint
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const cyanLight = new THREE.DirectionalLight(0x06b6d4, 2.5);
    cyanLight.position.set(5, 5, 4);
    scene.add(cyanLight);

    const emeraldLight = new THREE.DirectionalLight(0x10b981, 2.0);
    emeraldLight.position.set(-5, -3, 3);
    scene.add(emeraldLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 3, 10);
    rimLight.position.set(0, 4, -2);
    scene.add(rimLight);

    // Root Group for phone
    const phoneGroup = new THREE.Group();
    scene.add(phoneGroup);

    // Phone Body: Rounded Box
    const bodyGeo = new THREE.BoxGeometry(2.3, 4.7, 0.18);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.85,
      roughness: 0.25,
    });
    const phoneBody = new THREE.Mesh(bodyGeo, bodyMat);
    phoneGroup.add(phoneBody);

    // Screen Texture via Dynamic Canvas
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    const screenTexture = new THREE.CanvasTexture(canvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;

    const screenGeo = new THREE.PlaneGeometry(2.18, 4.54);
    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTexture,
      toneMapped: false,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.z = 0.095;
    phoneGroup.add(screenMesh);

    // Subtle Screen Glare overlay
    const glareGeo = new THREE.PlaneGeometry(2.18, 4.54);
    const glareMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      roughness: 0.1,
      metalness: 0.1,
    });
    const glareMesh = new THREE.Mesh(glareGeo, glareMat);
    glareMesh.position.z = 0.098;
    phoneGroup.add(glareMesh);

    // Render loop for phone screen UI and 3D motion
    let frame = 0;
    let animTime = 0;

    function renderScreen(time: number) {
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, 512, 1024);

      // Status Bar
      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 18px monospace";
      ctx.fillText("9:41", 40, 45);
      ctx.fillText("5G  100%", 410, 45);

      // Dynamic Island / Camera Notch
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.roundRect(196, 25, 120, 28, 14);
      ctx.fill();

      // App Header
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.fillText("BikeScape", 40, 110);
      ctx.fillStyle = "#10b981";
      ctx.font = "16px monospace";
      ctx.fillText("LIVE INTELLIGENCE", 40, 135);

      // Mode Switch Pill
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(40, 155, 432, 44, 22);
      ctx.fill();

      // Active Pill toggle
      const activeX = Math.sin(time * 0.8) > 0 ? 44 : 258;
      ctx.fillStyle = activeX === 44 ? "rgba(6, 182, 212, 0.3)" : "rgba(16, 185, 129, 0.3)";
      ctx.strokeStyle = activeX === 44 ? "#06b6d4" : "#10b981";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(activeX, 159, 210, 36, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px system-ui";
      ctx.fillText("⚡ Fast & Safe", 95, 183);
      ctx.fillText("🌿 Nature Mode", 305, 183);

      // Map View Grid Area
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.roundRect(40, 225, 432, 540, 24);
      ctx.fill();
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Map Grid lines
      ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
      ctx.lineWidth = 1;
      for (let x = 60; x < 450; x += 35) {
        ctx.beginPath();
        ctx.moveTo(x, 240);
        ctx.lineTo(x, 750);
        ctx.stroke();
      }
      for (let y = 250; y < 750; y += 35) {
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(460, y);
        ctx.stroke();
      }

      // Simulated Park Greenery Zones
      ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
      ctx.beginPath();
      ctx.ellipse(320, 380, 75, 45, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
      ctx.beginPath();
      ctx.ellipse(160, 600, 60, 40, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // Animated Route Polyline
      ctx.strokeStyle = activeX === 44 ? "#06b6d4" : "#10b981";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = activeX === 44 ? "#06b6d4" : "#10b981";
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(100, 660); // 7-Eleven start
      ctx.lineTo(160, 560);
      ctx.lineTo(240, 480);
      ctx.lineTo(310, 430);
      ctx.lineTo(380, 310); // De Anza end
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // Waypoint A (7-Eleven)
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(100, 660, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("A", 96, 664);

      // Waypoint B (De Anza)
      ctx.fillStyle = activeX === 44 ? "#06b6d4" : "#10b981";
      ctx.beginPath();
      ctx.arc(380, 310, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText("B", 375, 314);

      // Lawrence Expressway Danger Flash (if modern)
      if (activeX === 44) {
        const pulse = (Math.sin(time * 6) + 1) * 0.5;
        ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + pulse * 0.25})`;
        ctx.beginPath();
        ctx.ellipse(220, 520, 50, 25, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 11px monospace";
        ctx.fillText("⚠️ LAWRENCE AVOIDED", 200, 550);
      }

      // Bottom HUD Card
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.strokeStyle = activeX === 44 ? "#06b6d4" : "#10b981";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(40, 785, 432, 195, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px system-ui";
      ctx.fillText(activeX === 44 ? "Fastest Safe Route" : "Greenest Canopy Corridor", 65, 825);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui";
      ctx.fillText(activeX === 44 ? "4.2 km · 17 min · 0 High-Stress Crossings" : "4.8 km · 20 min · 88% Tree Shade", 65, 852);

      // Small Pill Badges
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.roundRect(65, 875, 110, 32, 16);
      ctx.roundRect(185, 875, 120, 32, 16);
      ctx.roundRect(315, 875, 130, 32, 16);
      ctx.fill();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "12px monospace";
      ctx.fillText("LTS 1 CALM", 85, 895);
      ctx.fillText("NO STROADS", 200, 895);
      ctx.fillText("AI VERIFIED", 335, 895);

      screenTexture.needsUpdate = true;
    }

    function animate(t: number) {
      animTime += 0.016;
      renderScreen(animTime);

      const p = scrollRef.current;
      // Scroll-driven 3D phone rotation and floating
      phoneGroup.rotation.y = -0.3 + p * 0.9 + Math.sin(animTime * 0.8) * 0.08;
      phoneGroup.rotation.x = 0.15 - p * 0.35 + Math.cos(animTime * 0.6) * 0.04;
      phoneGroup.rotation.z = Math.sin(animTime * 0.5) * 0.03;
      phoneGroup.position.y = Math.sin(animTime * 1.2) * 0.08 + (p - 0.5) * 0.4;

      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      bodyGeo.dispose();
      bodyMat.dispose();
      screenGeo.dispose();
      screenMat.dispose();
      glareGeo.dispose();
      glareMat.dispose();
      screenTexture.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="w-full h-full min-h-[460px] pointer-events-none" />;
}
