/**
 * Drones and their commands in the scene. Live drones are small meshes on a ring above
 * their space, styled by class, with a resource bar; tethers trail a hose to the nearest
 * resupply space. Dead drones leave a dim gray X where they died. Commands draw an arrow
 * from the drone's space to its goTo, coloured by task, faded once it has arrived.
 * During playback a drone glides from its previous space to its current one; scrubbing
 * snaps.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { Group, Quaternion, Vector3 } from 'three';
import type { TickRecord } from '../../loop';
import type { Drone, SpaceId, StructurePlan } from '../../shared/types';
import { DRONE_LIFT, DRONE_STYLE, nearestResupply, ringOffsets, slotsBySpace, taskColor } from '../droneLayout';
import type { Layout, Pos } from '../layout';
import { BOX } from './Scene';

const UP = new Vector3(0, 1, 0);

type Props = {
  plan: StructurePlan;
  layout: Layout;
  rec: TickRecord;
  /** The previous tick, for interpolation. */
  prev: TickRecord | undefined;
  /** True while the playback loop is advancing; false when scrubbing (snap). */
  playing: boolean;
  /** Ticks per second, to time the glide. */
  speed: number;
  shown: (id: SpaceId) => boolean;
};

/** World position of a drone slot above a space. */
function slotPos(layout: Layout, at: SpaceId, index: number, count: number): Pos | undefined {
  const p = layout[at];
  if (!p) return undefined;
  const o = ringOffsets(count)[index] ?? { dx: 0, dz: 0 };
  return { x: p.x + o.dx, y: p.y + BOX.h / 2 + DRONE_LIFT, z: p.z + o.dz };
}

function DroneMesh({ d, pos, from, progress, hoseTo }: { d: Drone; pos: Pos; from: Pos; progress: React.MutableRefObject<number>; hoseTo: Pos | undefined }) {
  const style = DRONE_STYLE[d.class];
  const g = useRef<Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const t = progress.current;
    g.current.position.set(from.x + (pos.x - from.x) * t, from.y + (pos.y - from.y) * t, from.z + (pos.z - from.z) * t);
  });
  return (
    <>
      <group ref={g} position={[from.x, from.y, from.z]} name={`drone:${d.id}`}>
        {style.shape === 'cylinder' && <mesh><cylinderGeometry args={[0.16, 0.16, 0.34, 12]} /><meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={0.35} /></mesh>}
        {style.shape === 'tetra' && <mesh rotation={[0.6, 0.4, 0]}><tetrahedronGeometry args={[0.24]} /><meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={0.35} /></mesh>}
        {style.shape === 'sphere' && <mesh><sphereGeometry args={[0.17, 14, 14]} /><meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={0.3} /></mesh>}
        {style.shape === 'cube' && <mesh><boxGeometry args={[0.28, 0.28, 0.28]} /><meshStandardMaterial color={style.color} emissive={style.color} emissiveIntensity={0.35} /></mesh>}
        {/* resource bar: a thin plate under the mesh, width scaled by resource */}
        <mesh position={[-(0.4 * (1 - d.resource)) / 2, -0.32, 0]}>
          <boxGeometry args={[Math.max(0.02, 0.4 * d.resource), 0.04, 0.06]} />
          <meshBasicMaterial color={d.resource > 0.3 ? '#5dd39e' : '#ff8a5c'} />
        </mesh>
      </group>
      {hoseTo && <Line points={[[pos.x, pos.y - 0.2, pos.z], [hoseTo.x, hoseTo.y + BOX.h / 2, hoseTo.z]]} color={style.color} lineWidth={1} transparent opacity={0.45} dashed dashSize={0.25} gapSize={0.15} />}
    </>
  );
}

function DeadMark({ pos }: { pos: Pos }) {
  return (
    <group position={[pos.x, pos.y + BOX.h / 2 + 0.06, pos.z]}>
      <mesh rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[1.1, 0.04, 0.08]} /><meshBasicMaterial color="#6f7b8c" /></mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}><boxGeometry args={[1.1, 0.04, 0.08]} /><meshBasicMaterial color="#6f7b8c" /></mesh>
    </group>
  );
}

function Arrow({ from, to, color, faded, thick }: { from: Pos; to: Pos; color: string; faded: boolean; thick?: boolean }) {
  const { end, quat, mid } = useMemo(() => {
    const a = new Vector3(from.x, from.y, from.z);
    const b = new Vector3(to.x, to.y, to.z);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) return { end: b, quat: new Quaternion(), mid: b };
    dir.normalize();
    const end = b.clone().sub(dir.clone().multiplyScalar(0.35));
    return { end, quat: new Quaternion().setFromUnitVectors(UP, dir), mid: a.clone().add(dir.clone().multiplyScalar(len - 0.5)) };
  }, [from.x, from.y, from.z, to.x, to.y, to.z]);
  const opacity = faded ? 0.18 : 0.9;
  return (
    <>
      <Line points={[[from.x, from.y, from.z], [end.x, end.y, end.z]]} color={color} lineWidth={thick ? 3 : 1.5} transparent opacity={opacity} />
      <mesh position={[mid.x, mid.y, mid.z]} quaternion={quat}>
        <coneGeometry args={[thick ? 0.18 : 0.12, 0.35, 10]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </>
  );
}

export function Drones({ plan, layout, rec, prev, playing, speed, shown }: Props) {
  // Glide progress 0..1 since the cursor last changed; snaps to 1 when not playing.
  const progress = useRef(1);
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = performance.now();
    progress.current = playing ? 0 : 1;
  }, [rec, playing]);
  useFrame(() => {
    if (!playing) { progress.current = 1; return; }
    progress.current = Math.min(1, (performance.now() - startedAt.current) / (1000 / speed));
  });

  const slots = useMemo(() => slotsBySpace(rec.truth.drones.filter((d) => d.alive)), [rec]);
  const prevSlots = useMemo(() => (prev ? slotsBySpace(prev.truth.drones.filter((d) => d.alive)) : slots), [prev, slots]);
  const prevAt = useMemo(() => new Map((prev ?? rec).truth.drones.map((d) => [d.id, d.at])), [prev, rec]);
  const cmdFor = useMemo(() => new Map(rec.commands.map((c) => [c.droneId, c])), [rec]);
  const resupplyOf = useMemo(() => new Map(plan.spaces.map((s) => [s.id, nearestResupply(plan, s.id)])), [plan]);

  return (
    <group name="drones">
      {rec.truth.drones.map((d) => {
        if (!shown(d.at)) return null;
        const p = layout[d.at];
        if (!p) return null;
        if (!d.alive) return <DeadMark key={d.id} pos={p} />;
        const slot = slots.get(d.id) ?? { index: 0, count: 1 };
        const pos = slotPos(layout, d.at, slot.index, slot.count)!;
        const pa = prevAt.get(d.id) ?? d.at;
        const ps = prevSlots.get(d.id) ?? slot;
        const from = slotPos(layout, pa, ps.index, ps.count) ?? pos;
        const hoseTarget = d.class === 'tether' ? resupplyOf.get(d.at) : undefined;
        const hoseTo = hoseTarget && hoseTarget !== d.at ? layout[hoseTarget] : undefined;
        const c = cmdFor.get(d.id);
        const goToPos = c ? layout[c.goTo] : undefined;
        return (
          <group key={d.id}>
            <DroneMesh d={d} pos={pos} from={from} progress={progress} hoseTo={hoseTo} />
            {c && goToPos && shown(c.goTo) && c.goTo !== d.at && (
              <Arrow from={pos} to={{ x: goToPos.x, y: goToPos.y + BOX.h / 2 + DRONE_LIFT, z: goToPos.z }} color={taskColor(c.task)} faded={false} />
            )}
            {c && goToPos && c.goTo === d.at && (
              // Arrived: a short faded stub pointing down at the space.
              <Arrow from={{ x: pos.x, y: pos.y + 0.6, z: pos.z }} to={{ x: pos.x, y: pos.y + 0.25, z: pos.z }} color={taskColor(c.task)} faded />
            )}
          </group>
        );
      })}
    </group>
  );
}
