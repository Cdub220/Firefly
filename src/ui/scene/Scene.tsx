/**
 * Three.js scene: boxes per space colored by a SceneFrame, edges as lines, fixed sensors
 * as spheres, occupant labels, orbit controls, level slicing. What the colors mean is
 * decided by whoever builds the frame (truth today, belief at checkpoint 4).
 */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type { MeshStandardMaterial } from 'three';
import type { TickRecord } from '../../loop';
import type { Edge, SpaceId, StructurePlan } from '../../shared/types';
import { layoutBounds, layoutFor, type Pos } from '../layout';
import { EDGE_COLORS, SENSOR_COLORS, tempHex } from './color';
import { Drones } from './Drones';
import { isDoorOpen, type SceneFrame } from './frame';

export const BOX = { w: 2, h: 1.4, d: 2 } as const;

type SpaceBoxProps = {
  id: SpaceId;
  pos: Pos;
  color: string;
  burning: boolean;
  occupants: number;
  hidden: boolean;
};

function SpaceBox({ id, pos, color, burning, occupants, hidden }: SpaceBoxProps) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    mat.current.emissiveIntensity = burning ? 0.35 + 0.35 * Math.sin(clock.elapsedTime * 4) : 0;
  });
  if (hidden) return null;
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh name={`space:${id}`}>
        <boxGeometry args={[BOX.w, BOX.h, BOX.d]} />
        <meshStandardMaterial ref={mat} color={color} emissive={burning ? '#ff6a00' : '#000000'} roughness={0.6} metalness={0.1} />
      </mesh>
      <Html center position={[0, -BOX.h / 2 - 0.05, BOX.d / 2 + 0.05]} style={{ pointerEvents: 'none' }}>
        <div className="scene-id">{id}{occupants > 0 && <span className="scene-occ" title={`${occupants} occupants`}>{occupants}</span>}</div>
      </Html>
    </group>
  );
}

function edgeColor(e: Edge, frame: SceneFrame): string {
  if ((e.kind === 'door' || e.kind === 'passage') && !isDoorOpen(frame, e.a, e.b)) return EDGE_COLORS.closed;
  return EDGE_COLORS[e.kind];
}

export type SceneProps = {
  plan: StructurePlan;
  frame: SceneFrame;
  /** Hide every level above this one so you can look inside. Default: show all. */
  maxLevel?: number;
  /** Drones and commands to draw, with the previous tick for smooth movement. Omit for none. */
  drones?: { rec: TickRecord; prev: TickRecord | undefined; playing: boolean; speed: number };
};

export function Scene({ plan, frame, maxLevel, drones }: SceneProps) {
  const layout = layoutFor(plan);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);
  const levelOf = useMemo(() => new Map(plan.spaces.map((s) => [s.id, s.level])), [plan]);
  const shown = (id: SpaceId): boolean => maxLevel === undefined || (levelOf.get(id) ?? 1) <= maxLevel;
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, bounds.max.y - bounds.min.y, 6);
  const c = bounds.center;

  return (
    <Canvas camera={{ position: [c.x + span * 0.9, c.y + span * 0.8, c.z + span * 1.1], fov: 45, near: 0.1, far: 500 }} dpr={[1, 2]}>
      <color attach="background" args={['#0e1116']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} />
      <directionalLight position={[-10, 8, -6]} intensity={0.4} />
      <OrbitControls target={[c.x, c.y, c.z]} makeDefault />

      {plan.spaces.map((s) => {
        const pos = layout[s.id]!;
        return (
          <SpaceBox
            key={s.id}
            id={s.id}
            pos={pos}
            color={tempHex(frame.temps[s.id] ?? plan.ambient, plan.ambient)}
            burning={frame.burning[s.id] ?? false}
            occupants={s.occupants ?? 0}
            hidden={!shown(s.id)}
          />
        );
      })}

      {plan.edges.map((e, i) => {
        if (!shown(e.a) || !shown(e.b)) return null;
        const a = layout[e.a]!;
        const b = layout[e.b]!;
        return (
          <Line
            key={`${e.a}-${e.b}-${i}`}
            points={[[a.x, a.y, a.z], [b.x, b.y, b.z]]}
            color={edgeColor(e, frame)}
            lineWidth={e.kind === 'floor' || e.kind === 'shaft' ? 2 : 1.2}
            transparent
            opacity={e.kind === 'bulkhead' ? 0.6 : 0.9}
          />
        );
      })}

      {drones && <Drones plan={plan} layout={layout} rec={drones.rec} prev={drones.prev} playing={drones.playing} speed={drones.speed} shown={shown} />}

      {plan.sensors.map((f) => {
        if (!shown(f.spaceId)) return null;
        const p = layout[f.spaceId]!;
        return (
          <mesh key={f.id} name={`sensor:${f.id}`} position={[p.x, p.y + BOX.h / 2 + 0.25, p.z]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color={SENSOR_COLORS[frame.sensors[f.id] ?? 'dead']} emissive={SENSOR_COLORS[frame.sensors[f.id] ?? 'dead']} emissiveIntensity={0.5} />
          </mesh>
        );
      })}
    </Canvas>
  );
}
