import { useCallback } from "react";
import * as THREE from "three";
import { bicycle, box, lights, material, Stage, tube, type Build } from "./three-scenes";

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roadSign(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = "#e8eee9";
  ctx.lineWidth = 11;
  ctx.strokeRect(16, 16, 992, 224);
  ctx.fillStyle = "#fff";
  ctx.font = "700 91px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(2.65, 0.66),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
}

function carModel() {
  const car = new THREE.Group();
  const paint = material(0xd7ddda, 0.68, 0.27);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x273d45,
    metalness: 0.22,
    roughness: 0.08,
    transmission: 0.16,
    transparent: true,
    opacity: 0.9,
  });
  const rubber = material(0x101717, 0, 0.95);
  const chrome = material(0xaeb9b4, 0.9, 0.18);
  const shape = new THREE.Shape();
  shape.moveTo(-1.28, 0.24);
  shape.lineTo(-1.2, 0.52);
  shape.lineTo(-0.64, 0.58);
  shape.lineTo(-0.35, 0.93);
  shape.lineTo(0.5, 0.95);
  shape.lineTo(0.87, 0.55);
  shape.lineTo(1.18, 0.49);
  shape.lineTo(1.28, 0.28);
  shape.lineTo(1.16, 0.18);
  shape.lineTo(-1.15, 0.18);
  shape.closePath();
  const shell = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 1.15,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.05,
      bevelSegments: 2,
    }),
    paint,
  );
  shell.position.z = -0.575;
  car.add(shell);
  for (const side of [-1, 1]) {
    const z = side * 0.64;
    const windowShape = new THREE.Shape();
    windowShape.moveTo(-0.57, 0.59);
    windowShape.lineTo(-0.29, 0.89);
    windowShape.lineTo(0.44, 0.89);
    windowShape.lineTo(0.75, 0.57);
    windowShape.closePath();
    const window = new THREE.Mesh(new THREE.ShapeGeometry(windowShape), glass);
    window.position.z = z;
    if (side < 0) window.rotation.y = Math.PI;
    car.add(window);
    tube(car, [0.04, 0.59, z + side * 0.008], [0.04, 0.89, z + side * 0.008], 0.018, chrome);
    for (const x of [-0.78, 0.78]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 22), rubber);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(x, 0.25, side * 0.61);
      car.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.164, 18), chrome);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, 0.25, side * 0.62);
      car.add(rim);
    }
    box(car, [0.09, 0.09, 0.22], [1.24, 0.41, side * 0.38], new THREE.MeshBasicMaterial({ color: 0xfff1c4 }));
    box(car, [0.08, 0.1, 0.2], [-1.25, 0.4, side * 0.38], new THREE.MeshBasicMaterial({ color: 0xd7504d }));
  }
  box(car, [0.06, 0.27, 0.1], [-0.23, 0.44, 0.65], chrome);
  box(car, [0.06, 0.27, 0.1], [0.78, 0.44, 0.65], chrome);
  box(car, [0.16, 0.06, 0.04], [0.3, 0.55, 0.66], chrome);
  return car;
}

function cyclist() {
  const person = new THREE.Group();
  const jersey = material(0xa7f0c7, 0, 0.82),
    trouser = material(0x253b43, 0, 0.86);
  const skin = material(0x9a624b, 0, 0.9),
    helmet = material(0xd2f1ad, 0.18, 0.55);
  tube(person, [-0.75, 2.78, 0], [0.12, 3.65, 0], 0.24, jersey);
  for (const side of [-0.14, 0.14]) {
    tube(person, [0.06, 3.5, side], [0.54, 3.07, side], 0.1, jersey);
    tube(person, [0.54, 3.07, side], [1.16, 2.7, side], 0.08, skin);
    tube(person, [-0.71, 2.75, side], [side < 0 ? -0.05 : -0.95, 2.04, side], 0.13, trouser);
    tube(person, [side < 0 ? -0.05 : -0.95, 2.04, side], [side < 0 ? -0.2 : -0.52, 1.27, side], 0.1, trouser);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), skin);
  head.position.set(0.33, 3.99, 0);
  person.add(head);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    helmet,
  );
  cap.position.set(0.33, 4.08, 0);
  person.add(cap);
  const actor = new THREE.Group();
  const pivot = new THREE.Group();
  person.position.y = -2.8;
  pivot.position.y = 2.8;
  pivot.add(person);
  actor.add(pivot);
  return { actor, pivot };
}

export function LawrenceScene({ paused, replay }: { paused: boolean; replay: number }) {
  const build = useCallback<Build>(
    (scene, camera) => {
      void replay;
      lights(scene);
      camera.position.set(9.4, 11.5, 13.4);
      camera.lookAt(0.6, 0.1, 0);
      const asphalt = material(0x343a39, 0.05, 0.95),
        curb = material(0xaaa998, 0, 0.94);
      const verge = material(0x766f57, 0, 1),
        white = material(0xe1e4db, 0, 0.87);
      const yellow = material(0xf1c663, 0, 0.85),
        orange = material(0xfa8242, 0, 0.82);
      box(scene, [15.5, 0.18, 11], [0, -0.16, 0], verge);
      box(scene, [15.5, 0.07, 7], [0, -0.03, 0], asphalt);
      box(scene, [2.4, 0.08, 11], [1.7, -0.015, 0], asphalt);
      for (const z of [-2.65, -1.6, -0.55, 0.55, 1.6, 2.65]) {
        if (Math.abs(z) < 0.6) continue;
        for (let x = -7.2; x <= 7.2; x += 1.8) box(scene, [0.87, 0.012, 0.047], [x, 0.02, z], white);
      }
      for (const z of [-0.12, 0.12]) box(scene, [15.5, 0.016, 0.045], [0, 0.025, z], yellow);
      for (const z of [-3.5, 3.5]) box(scene, [15.5, 0.18, 0.28], [0, -0.01, z], curb);
      for (let z = -3.08; z < 3.1; z += 0.48) box(scene, [1.72, 0.02, 0.22], [1.7, 0.035, z], white);
      for (const z of [-3.5, 3.5])
        for (const x of [-4.8, 5.9]) {
          tube(scene, [x, 0, z], [x, 3.8, z], 0.055, material(0x778782, 0.67, 0.42));
          const signal = box(scene, [0.37, 0.9, 0.31], [x, 3.52, z], material(0x1b2421));
          signal.rotation.y = -0.18;
          for (let i = 0; i < 3; i++) {
            const lamp = new THREE.Mesh(
              new THREE.SphereGeometry(0.095, 12, 10),
              new THREE.MeshBasicMaterial({ color: i === 0 ? 0xd83f3c : 0x28332b }),
            );
            lamp.position.set(x + 0.19, 3.79 - i * 0.24, z + 0.05);
            scene.add(lamp);
          }
        }
      tube(scene, [-5.9, 0, -3.3], [-5.9, 2.8, -3.3], 0.055, material(0x748582, 0.7));
      const sign = roadSign("LAWRENCE EXPRESSWAY", "#176942");
      if (sign) {
        sign.position.set(-4.9, 2.72, -3.3);
        sign.rotation.y = -0.3;
        scene.add(sign);
      }
      for (let i = 0; i < 6; i++) {
        const x = -6.6 + i * 0.58;
        box(scene, [0.1, 0.63, 0.1], [x, 0.31, 3.65], orange);
        box(scene, [0.17, 0.08, 0.17], [x, 0.41, 3.65], white);
      }
      for (const x of [-6.7, -5.5, 5.2, 6.5]) {
        tube(scene, [x, 0, -4.7], [x, 0.85, -4.7], 0.11, material(0x6d6651));
        for (let j = 0; j < 3; j++) {
          const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.73, 1), material(0x5d7d55, 0, 0.95));
          crown.position.set(x + (j - 1) * 0.28, 1.42 + j * 0.16, -4.7);
          scene.add(crown);
        }
      }
      const photo = new THREE.TextureLoader().load("/presentation-media/lawrence.png");
      photo.colorSpace = THREE.SRGBColorSpace;
      photo.repeat.set(1, 0.58);
      photo.offset.set(0, 0.42);
      const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(17, 5.6),
        new THREE.MeshBasicMaterial({
          map: photo,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      backdrop.position.set(0, 2.7, -5.1);
      scene.add(backdrop);
      const car = carModel();
      car.position.set(-6.4, 0, -0.75);
      scene.add(car);
      const { bike, wheelGroups } = bicycle(0xbaf8d0);
      bike.scale.setScalar(0.4);
      bike.rotation.y = Math.PI / 2;
      scene.add(bike);
      const { actor: person, pivot } = cyclist();
      person.scale.setScalar(0.4);
      person.rotation.y = Math.PI / 2;
      scene.add(person);
      const skid = new THREE.Mesh(
        new THREE.RingGeometry(0.23, 0.32, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffdd9d,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        }),
      );
      skid.rotation.x = -Math.PI / 2;
      skid.position.set(1.7, 0.05, -0.8);
      scene.add(skid);
      return {
        tick: (time, dt) => {
          const loopPeriod = 7.5;
          const cycleTime = time % loopPeriod;
          const t = Math.min(cycleTime, 6.2);
          const impact = clamp((t - 3.6) / 0.38);
          const fall = clamp((t - 3.86) / 1.35);
          car.position.x = Math.min(-6.4 + t * 2.2, 1.63 + fall * 0.4);
          const z = Math.max(4.27 - t * 1.38, -0.9);
          bike.position.set(1.7 - fall * 0.65, 0.01, z + fall * 2.2);
          bike.rotation.z = -1.08 * fall;
          person.position.set(
            1.7 + fall * 2.1,
            0.02 + Math.sin(fall * Math.PI) * 0.5 - fall * 0.08,
            z + fall * 2.5,
          );
          pivot.rotation.z = -2.32 * fall;
          pivot.rotation.x = 0.36 * fall;
          for (const wheel of wheelGroups) wheel.rotation.z -= dt * (1 - impact) * 3;
          (skid.material as THREE.MeshBasicMaterial).opacity = Math.sin(impact * Math.PI) * 0.54;
          skid.scale.setScalar(1 + impact * 1.2);
        },
      };
    },
    [replay],
  );
  return (
    <Stage
      build={build}
      paused={paused}
      label="Illustrative 3D Lawrence Expressway crossing with a multi-lane road, a car striking the bicycle, and the cyclist falling away from it."
    />
  );
}
