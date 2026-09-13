/**
 * One camera for several canvases. Whoever orbits writes the pose here; every other
 * canvas copies it on its next frame. A plain module object, no React state, so a drag
 * does not re-render three scenes per mouse move.
 */
export type CameraPose = { position: [number, number, number]; target: [number, number, number] };

type Sync = { pose: CameraPose | null; version: number; owner: string | null };

const syncs = new Map<string, Sync>();

/** The shared pose slot for a group of canvases. */
export function cameraGroup(name: string): Sync {
  let s = syncs.get(name);
  if (!s) { s = { pose: null, version: 0, owner: null }; syncs.set(name, s); }
  return s;
}

export function publishPose(group: string, owner: string, pose: CameraPose): void {
  const s = cameraGroup(group);
  s.pose = pose;
  s.owner = owner;
  s.version += 1;
}

/** Reset a group (tests, or when the plan changes and the old pose is meaningless). */
export function resetCameraGroup(name: string): void {
  syncs.delete(name);
}
