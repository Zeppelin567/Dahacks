import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { bicycle } from "./three-scenes";

type FadeMaterial = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
type StreetObject = { group: THREE.Group; x: number };

function block(
  parent: THREE.Object3D,
  size: [number, number, number],
  at: [number, number, number],
  mat: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...at);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function fadeMaterial(color: number, emissive = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    roughness: 0.7,
    metalness: 0.1,
    transparent: true,
    depthWrite: false,
  });
}

function rider(bikeGroup: THREE.Group) {
  const body = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0xdef2d6, roughness: 0.8 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x233e3d, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9c654b, roughness: 0.9 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xe8f5bf, roughness: 0.45 });
  const limb = (
    from: [number, number, number],
    to: [number, number, number],
    radius: number,
    mat: THREE.Material,
  ) => {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    body.add(mesh);
  };
  limb([-0.78, 2.85, 0], [0.1, 3.62, 0], 0.25, jacket);
  limb([0.06, 3.48, -0.13], [0.65, 3.1, -0.15], 0.1, jacket);
  limb([0.65, 3.1, -0.15], [1.17, 2.72, -0.17], 0.08, skin);
  limb([0.06, 3.48, 0.13], [0.52, 3.06, 0.15], 0.1, jacket);
  limb([0.52, 3.06, 0.15], [1.13, 2.69, 0.17], 0.08, skin);
  limb([-0.72, 2.84, -0.12], [-0.1, 2.06, -0.12], 0.13, trousers);
  limb([-0.1, 2.06, -0.12], [-0.2, 1.28, -0.13], 0.1, trousers);
  limb([-0.72, 2.84, 0.12], [-0.93, 2.1, 0.12], 0.13, trousers);
  limb([-0.93, 2.1, 0.12], [-0.55, 1.2, 0.12], 0.1, trousers);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), skin);
  head.position.set(0.32, 3.99, 0);
  body.add(head);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    helmet,
  );
  cap.position.set(0.32, 4.07, 0);
  body.add(cap);
  const visor = block(body, [0.24, 0.035, 0.45], [0.57, 4.1, 0], helmet);
  visor.rotation.z = -0.15;
  bikeGroup.add(body);
  return body;
}

function makeCity(mats: FadeMaterial[], objects: StreetObject[]) {
  const group = new THREE.Group();
  const facadeColors = [0x758789, 0x667577, 0x909a96, 0x465c62, 0xa5aaa0];
  for (let i = 0; i < 12; i++) {
    const tower = new THREE.Group();
    const height = 3.8 + ((i * 7) % 8) * 0.52;
    const width = 1.35 + (i % 3) * 0.35;
    const z = -4.5 - (i % 3) * 0.95;
    const wall = fadeMaterial(facadeColors[i % facadeColors.length] ?? 0x728286);
    const glass = fadeMaterial(0xbfd4cd, 0x213d3d);
    const roof = fadeMaterial(0x354547);
    mats.push(wall, glass, roof);
    block(tower, [width, height, 1.75], [0, height / 2, 0], wall);
    block(tower, [width + 0.14, 0.12, 1.9], [0, height + 0.04, 0], roof);
    const positions: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let row = 0; row < Math.floor(height / 0.49); row++) {
      for (let col = 0; col < 3; col++) {
        dummy.position.set((col - 1) * (width / 3.7), 0.45 + row * 0.49, z < 0 ? 0.9 : -0.9);
        dummy.updateMatrix();
        positions.push(dummy.matrix.clone());
      }
    }
    const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.26), glass, positions.length);
    for (let j = 0; j < positions.length; j++) {
      const matrix = positions[j];
      if (matrix) windows.setMatrixAt(j, matrix);
    }
    tower.add(windows);
    tower.position.set(-16 + i * 2.9, 0, z);
    group.add(tower);
    objects.push({ group: tower, x: tower.position.x });
  }
  const pavement = fadeMaterial(0x8b9991);
  mats.push(pavement);
  block(group, [60, 0.16, 1.4], [0, -0.04, -2.75], pavement);
  return group;
}

function makeNature(mats: FadeMaterial[], objects: StreetObject[]) {
  const group = new THREE.Group();
  const grass = fadeMaterial(0x6f9c64);
  const trunk = fadeMaterial(0x654b35);
  const leafColors = [0x4a824d, 0x6a9c5c, 0x7baa68, 0x3e7651, 0xa3bd70];
  mats.push(grass, trunk);
  block(group, [60, 0.16, 2.6], [0, -0.05, -3.25], grass);
  block(group, [60, 0.16, 1.5], [0, -0.05, 5.75], grass);
  for (let i = 0; i < 26; i++) {
    const tree = new THREE.Group();
    const height = 2.2 + (i % 5) * 0.34;
    const side = -4.5 - (i % 3) * 0.72;
    const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, height, 9), trunk);
    trunkMesh.position.y = height / 2;
    tree.add(trunkMesh);
    const leaves = fadeMaterial(leafColors[i % leafColors.length] ?? 0x63945a);
    mats.push(leaves);
    for (let n = 0; n < 3; n++) {
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82 + (i % 3) * 0.12, 1), leaves);
      canopy.position.set((n - 1) * 0.42, height + 0.2 + (n % 2) * 0.3, (n - 1) * 0.2);
      canopy.castShadow = true;
      tree.add(canopy);
    }
    tree.position.set(-17 + i * 1.4, 0, side);
    group.add(tree);
    objects.push({ group: tree, x: tree.position.x });
  }
  return group;
}

function JourneyWorld({ paused }: { paused: boolean }) {
  const { scene } = useThree();
  const mix = useRef({ value: 0 });
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const travel = useRef(0);
  const reduced = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const world = useMemo(() => {
    const cityMats: FadeMaterial[] = [],
      natureMats: FadeMaterial[] = [];
    const cityObjects: StreetObject[] = [],
      natureObjects: StreetObject[] = [];
    const city = makeCity(cityMats, cityObjects);
    const nature = makeNature(natureMats, natureObjects);
    const road = new THREE.Group();
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x3d5050, roughness: 0.92 });
    const lane = new THREE.MeshStandardMaterial({ color: 0xe0dfc4, roughness: 0.9 });
    const bikeLane = new THREE.MeshStandardMaterial({ color: 0x79d7aa, roughness: 0.85 });
    block(road, [70, 0.12, 7.8], [0, -0.12, 1.1], asphalt);
    for (let i = -15; i < 16; i++) {
      block(road, [0.9, 0.015, 0.045], [i * 2.2, -0.045, -0.2], lane);
      block(road, [0.9, 0.015, 0.06], [i * 2.2, -0.045, 3.25], bikeLane);
    }
    const { bike, wheelGroups } = bicycle(0xbfffd8);
    bike.position.set(1.45, -0.02, 1.55);
    bike.scale.setScalar(0.94);
    const person = rider(bike);
    const sky = new THREE.Color(0xb2c0bf);
    return {
      city,
      nature,
      road,
      asphalt,
      cityMats,
      natureMats,
      cityObjects,
      natureObjects,
      bike,
      wheelGroups,
      person,
      sky,
    };
  }, []);

  useEffect(() => {
    scene.background = world.sky;
    scene.fog = new THREE.Fog(world.sky, 12, 42);
    const tl = gsap.timeline({ repeat: -1, paused: true });
    tl.set(mix.current, { value: 0 })
      .to(mix.current, { value: 0, duration: 3 })
      .to(mix.current, { value: 1, duration: 3.5, ease: "power2.inOut" })
      .to(mix.current, { value: 1, duration: 4.5 })
      .to(mix.current, { value: 0, duration: 3.5, ease: "power2.inOut" });
    timeline.current = tl;
    if (!paused && !reduced.current) tl.play();
    else if (reduced.current) mix.current.value = 0.7;
    return () => {
      tl.kill();
      scene.background = null;
      scene.fog = null;
      for (const root of [world.city, world.nature, world.road, world.bike])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const materials = Array.isArray(o.material) ? o.material : [o.material];
            for (const mat of materials) mat.dispose();
          }
        });
    };
  }, [scene, world]);
  useEffect(() => {
    if (paused || reduced.current) timeline.current?.pause();
    else timeline.current?.resume();
  }, [paused]);

  useFrame((_, delta) => {
    const m = mix.current.value;
    world.sky.set(0xb2c0bf).lerp(new THREE.Color(0xb9d4b7), m);
    world.asphalt.color.set(0x3d5050).lerp(new THREE.Color(0x596d59), m);
    for (const mat of world.cityMats) {
      mat.opacity = 1 - m;
      mat.visible = m < 0.995;
    }
    for (const mat of world.natureMats) {
      mat.opacity = m;
      mat.visible = m > 0.005;
    }
    if (!paused && !reduced.current) {
      travel.current += Math.min(delta, 0.05) * 1.55;
      const motion = travel.current;
      for (const item of world.cityObjects)
        item.group.position.x = ((((item.x - motion + 19) % 38) + 38) % 38) - 19;
      for (const item of world.natureObjects)
        item.group.position.x = ((((item.x - motion + 19) % 38) + 38) % 38) - 19;
      for (const wheel of world.wheelGroups) wheel.rotation.z -= Math.min(delta, 0.05) * 2.2;
      world.bike.position.y = -0.02 + Math.sin(motion * 8) * 0.025;
      world.person.rotation.z = Math.sin(motion * 8) * 0.012;
    }
  });
  return (
    <>
      <primitive object={world.city} />
      <primitive object={world.nature} />
      <primitive object={world.road} />
      <primitive object={world.bike} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[2, 10, 9]} intensity={3.2} color={0xfff4e1} castShadow />
      <directionalLight position={[-8, 4, -4]} intensity={1.7} color={0xb8e6c5} />
    </>
  );
}

export function JourneyScene({ paused }: { paused: boolean }) {
  return (
    <div
      className="rs-journey-canvas"
      role="img"
      aria-label="A cyclist rides through skyscrapers as the city gradually changes into a tree-lined road."
    >
      <Canvas
        camera={{ position: [2.9, 4.8, 14.5], fov: 36, near: 0.1, far: 90 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        shadows
      >
        <JourneyWorld paused={paused} />
      </Canvas>
    </div>
  );
}
