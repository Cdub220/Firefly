/**
 * Three.js scene: boxes per space, edges as lines, fixed sensors as spheres, occupant
 * labels, drones, orbit controls, level slicing. `view` picks what the colors mean:
 * truth, the brain's belief, or the difference; `brain` picks whose belief. Several
 * scenes can share one camera through `cameraGroup`.
 *
 * Geometry is created once at module level and shared by every mesh, so three scenes
 * of 24 spaces stay cheap.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { BoxGeometry, EdgesGeometry, SphereGeometry, type MeshStandardMaterial } from 'three';
import type { TickRecord } from '../../loop';
import type { Belief, DroneId, Edge, SpaceId, StructurePlan } from '../../shared/types';
import { layoutBounds, layoutFor, type Pos } from '../layout';
import { cameraGroup, publishPose } from './cameraSync';
import { EDGE_COLORS, SENSOR_COLORS, tempHex } from './color';
import { Drones } from './Drones';
import { frameFor, isDoorOpen, type SceneFrame, type SceneView } from './frame';

export const BOX = { w: 2, h: 1.4, d: 2 } as const;

// Shared geometry: one of each for the whole app.
const BOX_GEO = new BoxGeometry(BOX.w, BOX.h, BOX.d);
const HULL_GEO = new BoxGeometry(BOX.w + 0.5, BOX.h + 0.5, BOX.d + 0.5);
const HULL_EDGES = new EdgesGeometry(HULL_GEO);
const OUTLINE_GEO = new BoxGeometry(BOX.w + 0.12, BOX.h + 0.12, BOX.d + 0.12);
const OUTLINE_EDGES = new EdgesGeometry(OUTLINE_GEO);
const SENSOR_GEO = new SphereGeometry(0.18, 16, 16);

/** One color per ambiguity group, cycling. */
export const GROUP_COLORS = ['#a78bfa', '#38bdf8', '#f472b6', '#facc15', '#34d399', '#fb923c'];

type SpaceBoxProps = {
  id: SpaceId;
  pos: Pos;
  color: string;
  burning: boolean;
  occupants: number;
  hidden: boolean;
  hatched: boolean;
  outline: 'wrong' | 'uncertain' | undefined;
};

function SpaceBox({ id, pos, color, burning, occupants, hidden, hatched, outline }: SpaceBoxProps) {
  const mat = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    mat.current.emissiveIntensity = burning ? 0.35 + 0.35 * Math.sin(clock.elapsedTime * 4) : 0;
  });
  if (hidden) return null;
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh name={`space:${id}`} geometry={BOX_GEO}>
        <meshStandardMaterial ref={mat} color={hatched ? '#2a3240' : color} emissive={burning ? '#ff6a00' : '#000000'} roughness={0.6} metalness={0.1} transparent={hatched} opacity={hatched ? 0.55 : 1} />
      </mesh>
      {hatched && (
        <mesh name={`hatch:${id}`} geometry={BOX_GEO}>
          <meshBasicMaterial color="#6f7b8c" wireframe transparent opacity={0.6} />
        </mesh>
      )}
      {outline && (
        <lineSegments name={`outline:${id}`} geometry={OUTLINE_EDGES}>
          <lineBasicMaterial color={outline === 'wrong' ? '#ef4444' : '#f59e0b'} />
        </lineSegments>
      )}
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

/**
 * OrbitControls that publish their pose to a camera group on change and follow the
 * group's pose when another canvas moved it.
 */
function SyncedControls({ group, id, target }: { group: string | undefined; id: string; target: [number, number, number] }) {
  const ref = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const seen = useRef(0);
  useFrame(() => {
    if (!group || !ref.current) return;
    const g = cameraGroup(group);
    if (g.version === seen.current || g.owner === id || !g.pose) return;
    seen.current = g.version;
    camera.position.set(...g.pose.position);
    ref.current.target.set(...g.pose.target);
    ref.current.update();
  });
  const onChange = () => {
    if (!group || !ref.current) return;
    const g = cameraGroup(group);
    seen.current = g.version + 1;
    publishPose(group, id, { position: [camera.position.x, camera.position.y, camera.position.z], target: [ref.current.target.x, ref.current.target.y, ref.current.target.z] });
  };
  return <OrbitControls ref={ref} target={target} makeDefault onChange={onChange} />;
}

export type SceneProps = {
  plan: StructurePlan;
  /** The primary trace's record at the cursor: truth, obs, commands. */
  rec: TickRecord;
  /** What the colors mean. Default truth. */
  view?: SceneView;
  /** Whose belief, for belief and diff views. */
  brain?: string;
  /** That brain's belief at the cursor. Truth view ignores it; belief/diff fall back to truth without one. */
  belief?: Belief | undefined;
  /** Hide every level above this one so you can look inside. Default: show all. */
  maxLevel?: number;
  /** Draw drones and commands. Needs the previous record for smooth movement. */
  drones?: { prev: TickRecord | undefined; playing: boolean; speed: number; thick?: ReadonlySet<DroneId> | undefined } | undefined;
  /** Share the camera with every other Scene given the same group name. */
  cameraGroup?: string;
};

export function Scene({ plan, rec, view = 'truth', brain = 'ours', belief, maxLevel, drones, cameraGroup: group }: SceneProps) {
  const layout = layoutFor(plan);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);
  const levelOf = useMemo(() => new Map(plan.spaces.map((s) => [s.id, s.level])), [plan]);
  const frame = useMemo(() => frameFor(view, rec, plan, belief), [view, rec, plan, belief]);
  const shown = (id: SpaceId): boolean => maxLevel === undefined || (levelOf.get(id) ?? 1) <= maxLevel;
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, bounds.max.y - bounds.min.y, 6);
  const c = bounds.center;
  const unsensed = useMemo(() => new Set(frame.unsensed ?? []), [frame]);
  const suspect = useMemo(() => new Set(frame.suspect ?? []), [frame]);
  const sensorSpace = useMemo(() => new Map(plan.sensors.map((f) => [f.id, f.spaceId])), [plan]);
  const canvasId = `${group ?? 'solo'}:${view}:${brain}`;

  // A new plan means the shared pose is meaningless; the first orbit re-seeds it.
  useEffect(() => { if (group) cameraGroup(group).pose = null; }, [group, plan]);

  return (
    <Canvas camera={{ position: [c.x + span * 0.9, c.y + span * 0.8, c.z + span * 1.1], fov: 45, near: 0.1, far: 500 }} dpr={[1, 2]} frameloop="always">
      <color attach="background" args={['#0e1116']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} />
      <directionalLight position={[-10, 8, -6]} intensity={0.4} />
      <SyncedControls group={group} id={canvasId} target={[c.x, c.y, c.z]} />

      {plan.spaces.map((s) => {
        const pos = layout[s.id]!;
        return (
          <SpaceBox
            key={s.id}
            id={s.id}
            pos={pos}
            color={frame.colors?.[s.id] ?? tempHex(frame.temps[s.id] ?? plan.ambient, plan.ambient)}
            burning={frame.burning[s.id] ?? false}
            occupants={s.occupants ?? 0}
            hidden={!shown(s.id)}
            hatched={unsensed.has(s.id)}
            outline={frame.outline?.[s.id]}
          />
        );
      })}

      {/* Ambiguity groups: a translucent hull per member in the group's color, joined by a line. */}
      {(frame.groups ?? []).map((g, gi) => {
        const color = GROUP_COLORS[gi % GROUP_COLORS.length]!;
        const members = g.filter((id) => shown(id) && layout[id]);
        if (members.length === 0) return null;
        const pts = members.map((id) => layout[id]!).map((p): [number, number, number] => [p.x, p.y + BOX.h / 2 + 0.35, p.z]);
        return (
          <group key={`group:${gi}`} name={`group:${gi}`}>
            {members.map((id) => {
              const p = layout[id]!;
              return (
                <group key={id} position={[p.x, p.y, p.z]}>
                  <mesh geometry={HULL_GEO}><meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} /></mesh>
                  <lineSegments geometry={HULL_EDGES}><lineBasicMaterial color={color} transparent opacity={0.8} /></lineSegments>
                </group>
              );
            })}
            {pts.length > 1 && <Line points={pts} color={color} lineWidth={2} dashed dashSize={0.3} gapSize={0.2} />}
          </group>
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

      {drones && <Drones plan={plan} layout={layout} rec={rec} prev={drones.prev} playing={drones.playing} speed={drones.speed} shown={shown} thick={drones.thick} />}

      {plan.sensors.map((f) => {
        if (!shown(f.spaceId)) return null;
        const p = layout[sensorSpace.get(f.id) ?? f.spaceId]!;
        const struck = suspect.has(f.id);
        const col = struck ? '#ef4444' : SENSOR_COLORS[frame.sensors[f.id] ?? 'dead'];
        const y = p.y + BOX.h / 2 + 0.25;
        return (
          <group key={f.id} position={[p.x, y, p.z]}>
            <mesh name={`sensor:${f.id}`} geometry={SENSOR_GEO}>
              <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.5} />
            </mesh>
            {struck && <Line name={`strike:${f.id}`} points={[[-0.36, 0.3, 0], [0.36, -0.3, 0]]} color="#ef4444" lineWidth={2.5} />}
          </group>
        );
      })}
    </Canvas>
  );
}
