import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LatLng, Segment } from "@/bikemap/api";

type Animation = { tick: (time: number, delta: number) => void; dispose?: () => void };
export type Build = (
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
) => Animation;

export function Stage({ build, paused, label }: { build: Build; paused: boolean; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const stopped = useRef(paused);
  const [failed, setFailed] = useState(false);
  stopped.current = paused;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animation = build(scene, camera, renderer);
    const resize = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    });
    resize.observe(el);
    let frame = 0,
      time = 0,
      last = performance.now();
    function render(now: number) {
      // A frame timestamp can precede setup's performance.now(); time must stay nonnegative.
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      if (!document.hidden) {
        if (!stopped.current && !reduced.matches) time += dt;
        animation.tick(time, stopped.current || reduced.matches ? 0 : dt);
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      animation.dispose?.();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of materials) m.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [build]);
  return (
    <div ref={host} className="rs-three" role="img" aria-label={label}>
      {failed && (
        <div className="rs-webgl-fallback">
          RideScape<span>Two wheels. Your way.</span>
        </div>
      )}
    </div>
  );
}

export function material(color: number, metalness = 0.25, roughness = 0.4) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}
export function tube(parent: THREE.Object3D, a: number[], b: number[], radius: number, mat: THREE.Material) {
  const from = new THREE.Vector3(...a),
    to = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 12), mat);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
  parent.add(mesh);
  return mesh;
}
export function box(parent: THREE.Object3D, size: number[], position: number[], mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...(position as [number, number, number]));
  parent.add(mesh);
  return mesh;
}
export function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xe5fff4, 0x14241d, 3.2));
  const key = new THREE.DirectionalLight(0xffffff, 5);
  key.position.set(-3, 8, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa7ffce, 6);
  rim.position.set(4, 3, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xadcfff, 2);
  fill.position.set(-5, 1, -2);
  scene.add(fill);
}

export function bicycle(color = 0xbfffd8) {
  const bike = new THREE.Group();
  const paint = material(color, 0.65, 0.24),
    metal = material(0xb8c8bf, 0.8, 0.22);
  const rubber = material(0x101613, 0.05, 0.85),
    dark = material(0x28332d, 0.45, 0.4);
  const wheelGroups: THREE.Group[] = [];
  for (const x of [-1.55, 1.55]) {
    const wheel = new THREE.Group();
    wheel.position.set(x, 1.05, 0);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(1, 0.065, 12, 96), rubber);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.915, 0.025, 10, 96), metal);
    wheel.add(tire, rim);
    for (let i = 0; i < 28; i++) {
      const angle = (i * Math.PI) / 14;
      tube(
        wheel,
        [0, 0, i % 2 ? 0.08 : -0.08],
        [Math.cos(angle) * 0.91, Math.sin(angle) * 0.91, 0],
        0.007,
        metal,
      );
    }
    tube(wheel, [0, 0, -0.16], [0, 0, 0.16], 0.065, dark);
    bike.add(wheel);
    wheelGroups.push(wheel);
  }
  const rear: [number, number, number] = [-1.55, 1.05, 0],
    crank: [number, number, number] = [-0.35, 0.94, 0],
    seat: [number, number, number] = [-0.8, 2.45, 0];
  const head: [number, number, number] = [0.94, 2.38, 0],
    headLow: [number, number, number] = [1.08, 2.04, 0];
  tube(bike, seat, head, 0.067, paint);
  tube(bike, crank, headLow, 0.085, paint);
  tube(bike, crank, seat, 0.06, paint);
  for (const z of [-0.13, 0.13]) {
    tube(bike, [rear[0], rear[1], z], [seat[0], seat[1], z / 2], 0.033, paint);
    tube(bike, [rear[0], rear[1], z], [crank[0], crank[1], z / 2], 0.038, paint);
    tube(bike, [headLow[0], headLow[1], z / 2], [1.55, 1.05, z], 0.045, paint);
  }
  tube(bike, head, headLow, 0.08, paint);
  tube(bike, seat, [-0.88, 2.72, 0], 0.035, metal);
  const saddle = box(bike, [0.52, 0.065, 0.27], [-0.84, 2.73, 0], rubber);
  saddle.rotation.z = -0.05;
  tube(bike, head, [0.83, 2.65, 0], 0.035, metal);
  tube(bike, [0.83, 2.65, 0], [1.15, 2.7, 0], 0.04, dark);
  tube(bike, [1.15, 2.7, -0.35], [1.15, 2.7, 0.35], 0.035, metal);
  for (const z of [-0.36, 0.36]) {
    const curve = new THREE.CatmullRomCurve3(
      [
        [1.1, 2.7, z],
        [1.42, 2.67, z],
        [1.52, 2.42, z],
        [1.25, 2.34, z],
      ].map((p) => new THREE.Vector3(...p)),
    );
    bike.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.035, 8, false), rubber));
  }
  const gear = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.027, 8, 40), metal);
  gear.position.set(-0.35, 0.94, 0.15);
  bike.add(gear);
  const chain = new THREE.CatmullRomCurve3(
    [
      [-1.55, 1.13, 0.16],
      [-0.35, 1.16, 0.16],
      [-0.12, 0.94, 0.16],
      [-0.35, 0.72, 0.16],
      [-1.55, 0.96, 0.16],
    ].map((p) => new THREE.Vector3(...p)),
    true,
  );
  bike.add(new THREE.Mesh(new THREE.TubeGeometry(chain, 64, 0.012, 5, true), dark));
  tube(bike, [-0.35, 0.94, 0.18], [-0.18, 0.64, 0.18], 0.025, metal);
  tube(bike, [-0.35, 0.94, -0.18], [-0.52, 1.24, -0.18], 0.025, metal);
  box(bike, [0.18, 0.045, 0.16], [-0.18, 0.64, 0.24], rubber);
  box(bike, [0.18, 0.045, 0.16], [-0.52, 1.24, -0.24], rubber);
  bike.position.y = -1.4;
  return { bike, wheelGroups };
}

export function BicycleScene({ paused, nature = false }: { paused: boolean; nature?: boolean }) {
  const build = useCallback<Build>(
    (scene, camera, renderer) => {
      lights(scene);
      camera.position.set(3.4, 1.8, 8);
      const { bike, wheelGroups } = bicycle(nature ? 0xb9f4a3 : 0xc8ffe5);
      scene.add(bike);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.minPolarAngle = Math.PI * 0.29;
      controls.maxPolarAngle = Math.PI * 0.6;
      controls.target.set(0, 0.15, 0);
      controls.update();
      return {
        tick: (time, dt) => {
          bike.position.y = -1.4 + Math.sin(time * 0.6) * 0.06;
          bike.rotation.y = Math.sin(time * 0.24) * 0.13;
          for (const wheel of wheelGroups) wheel.rotation.z -= dt * 0.2;
          controls.update();
        },
        dispose: () => controls.dispose(),
      };
    },
    [nature],
  );
  return (
    <Stage
      build={build}
      paused={paused}
      label="Interactive three-dimensional mint bicycle. Drag to rotate."
    />
  );
}

export function GraphScene({
  paused,
  network,
  coords,
  nature,
}: {
  paused: boolean;
  network: Segment[];
  coords: LatLng[];
  nature: boolean;
}) {
  const build = useCallback<Build>(
    (scene, camera, renderer) => {
      lights(scene);
      camera.position.set(1.3, 8, 10.4);
      camera.lookAt(0, 0, 0);
      const group = new THREE.Group();
      scene.add(group);
      const project = ([lat, lng]: LatLng, y = 0.04) =>
        new THREE.Vector3((lng + 122.04) * 100, y, -(lat - 37.318) * 126);
      const linePositions: number[] = [];
      for (const seg of network)
        for (let i = 1; i < seg.coords.length; i++) {
          const from = seg.coords[i - 1],
            to = seg.coords[i];
          if (from && to) linePositions.push(...project(from).toArray(), ...project(to).toArray());
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
      group.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: 0x71918b, opacity: 0.3, transparent: true }),
        ),
      );
      box(group, [10.4, 0.15, 7.8], [0, -0.12, 0], material(0x14201d, 0.1, 0.7));
      const grid = new THREE.GridHelper(10, 20, 0x29413b, 0x20352f);
      grid.position.y = -0.02;
      group.add(grid);
      const points = coords.map((p) => project(p, 0.12));
      const curve = new THREE.CatmullRomCurve3(
        points.length > 1 ? points : [new THREE.Vector3(-1, 0.1, 0), new THREE.Vector3(1, 0.1, 0)],
        false,
        "centripetal",
        0.1,
      );
      const routeColor = nature ? 0xbbf9a1 : 0x8ef5e5;
      const route = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 240, 0.033, 6, false),
        new THREE.MeshBasicMaterial({ color: routeColor }),
      );
      group.add(route);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      group.add(dot);
      for (const p of [points[0], points[points.length - 1]])
        if (p) {
          tube(group, p.toArray(), [p.x, 0.7, p.z], 0.014, material(routeColor));
          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 16, 16),
            new THREE.MeshBasicMaterial({ color: routeColor }),
          );
          marker.position.set(p.x, 0.7, p.z);
          group.add(marker);
        }
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minPolarAngle = 0.2;
      controls.maxPolarAngle = 1.2;
      controls.update();
      return {
        tick: (time) => {
          dot.position.copy(curve.getPointAt((time * 0.09) % 1));
          controls.update();
        },
        dispose: () => controls.dispose(),
      };
    },
    [network, coords, nature],
  );
  return (
    <Stage
      build={build}
      paused={paused}
      label="Rotatable 3D view of the actual Cupertino street graph, with the recommended route highlighted."
    />
  );
}
