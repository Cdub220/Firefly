/**
 * World physics constants. Every number the fire model uses is named here so Dean can
 * copy the ones his brain's linear heat model needs (GEN, COOL, IGNITE, CLOSED_DOOR_LEAK).
 *
 * The per-tick model in src/world/physics.ts is, per space i:
 *
 *   T_i' = T_i + sum_j eff_ij * (T_j - T_i)
 *              + GEN_RATE * (FLAME_TEMP - T_i)   (if burning with fuel)
 *              + COOL * (ambient - T_i)
 *
 * where eff_ij is the plan edge rate, scaled by CLOSED_DOOR_LEAK when a door/passage is
 * shut, and per-space outgoing rates are clamped so their sum never exceeds
 * MAX_OUTGOING_RATE. Generation is a pull toward FLAME_TEMP rather than a constant, so a
 * burning space plateaus near flashover temperature whatever the size of the structure
 * (a constant source either fails to spread on dense graphs or runs to thousands of
 * degrees on small ones). The model is still linear in T; the generation term is just
 * a diagonal entry (1 - GEN_RATE) plus a constant GEN_RATE * FLAME_TEMP. Everything else
 * (hazards, spontaneous ignition, door failure) is realism layered on top of that core.
 */

/** Initial temperature (C) of every space listed in plan.ignition. */
export const IGNITION_TEMP = 450;

/** Temperature (C) a burning space is driven toward. Compartment fires plateau near this. */
export const FLAME_TEMP = 900;

/**
 * Fraction of (FLAME_TEMP - temp) a burning space with fuel closes per tick. At 450 C this
 * is +67 C/tick. Chosen by sweep: 0.1 never spreads on a two-level plan or a 5x3 grid
 * (neighbors dilute the heat); 0.15 spreads on both and peaks near 800 C.
 */
export const GEN_RATE = 0.15;

/** Fuel (fraction of 1) a burning space consumes per tick. */
export const BURN = 0.02;

/** Fraction of (ambient - temp) every space loses per tick to structure and outside. */
export const COOL = 0.02;

/** Temperature (C) at or above which an unburned space with fuel can ignite. */
export const IGNITE = 250;

/** A space must have more than this much fuel to ignite. Retardant coating pushes fuel below it. */
export const MIN_IGNITION_FUEL = 0.2;

/** Per-tick probability that a space above IGNITE with no burning neighbor ignites on its own. */
export const SPONTANEOUS_IGNITE_P = 0.1;

/** Multiplier on a door/passage edge rate when the door is closed on both sides. */
export const CLOSED_DOOR_LEAK = 0.2;

/** Cap on the sum of a space's outgoing effective rates, so the synchronous update is stable. */
export const MAX_OUTGOING_RATE = 0.9;

/** 'fuel' hazard: GEN_RATE and BURN are both multiplied by this. */
export const FUEL_HAZARD_MULT = 1.5;

/** 'ordnance' hazard: at or above this temp the space cooks off. */
export const ORDNANCE_COOKOFF_TEMP = 400;

/** 'ordnance' cook-off adds this many C to every neighbor, once, then the hazard is spent. */
export const ORDNANCE_COOKOFF_HEAT = 150;

/** 'chemical' hazard: COOL is multiplied by this for that space (it holds heat). */
export const CHEMICAL_COOL_MULT = 0.5;

/** Per-tick probability that each open door of a burning space fails shut. */
export const DOOR_FAIL_P = 0.01;

/** Std dev (C) of the Gaussian noise on every clean sensor reading. The world never lies; this is all it adds. */
export const SENSOR_NOISE_C = 0.5;

/** All constants in one frozen object, for `import { constants } from '../world'`. */
export const constants = Object.freeze({
  IGNITION_TEMP,
  FLAME_TEMP,
  GEN_RATE,
  BURN,
  COOL,
  IGNITE,
  MIN_IGNITION_FUEL,
  SPONTANEOUS_IGNITE_P,
  CLOSED_DOOR_LEAK,
  MAX_OUTGOING_RATE,
  FUEL_HAZARD_MULT,
  ORDNANCE_COOKOFF_TEMP,
  ORDNANCE_COOKOFF_HEAT,
  CHEMICAL_COOL_MULT,
  DOOR_FAIL_P,
  SENSOR_NOISE_C,
});
