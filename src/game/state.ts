import type * as THREE from "three";
import type { Kit } from "../core/kit";
import type { MatLib } from "../core/materials";
import type { InteractSystem } from "./interact";
import type { Player } from "../player/player";
import type { Ui } from "./ui";
import type { Audio } from "./audio";

export type ChannelId = "A" | "B" | "C" | "D";
export type Sym = "cross" | "triangle" | "wave" | "star";

export const SYMBOL_OF: Record<ChannelId, Sym> = {
  A: "cross",
  B: "triangle",
  C: "wave",
  D: "star",
};

/** each channel token carries one digit (same figure as the officer's code) */
export const CHANNEL_DIGIT: Record<ChannelId, string> = { A: "7", B: "2", C: "9", D: "4" };

/** order stamped on the developed photograph */
export const DOOR_ORDER: ChannelId[] = ["D", "B", "C", "A"];
export const DOOR_CODE = DOOR_ORDER.map((c) => CHANNEL_DIGIT[c]).join("");

export interface GameState {
  power: boolean;
  /** fuses found in the world, by rating */
  found: Record<string, boolean>;
  /** fuse seated in each circuit slot */
  seated: Record<string, boolean>;
  carried: Set<string>;
  /** wing puzzle solved → channel live */
  channels: Record<ChannelId, boolean>;
  /** cord currently taken off its hook */
  cordHeld: ChannelId | null;
  /** channel plugged into its matching socket */
  patched: Record<ChannelId, boolean>;
  safeOpen: boolean;
  photo: "none" | "exposed" | "dev" | "stop" | "fixed" | "ruined";
  crankTurns: number;
  oiled: boolean;
  solenoids: boolean;
  doorOpen: boolean;
  slitOpen: boolean;
  seen: Record<string, boolean>;
  hintsUsed: number;
}

export const state: GameState = {
  power: false,
  found: { "5": false, "10": false, "15": false, "20": false },
  seated: { lighting: false, motive: false, instruments: false, heating: false },
  carried: new Set(),
  channels: { A: false, B: false, C: false, D: false },
  cordHeld: null,
  patched: { A: false, B: false, C: false, D: false },
  safeOpen: false,
  photo: "none",
  crankTurns: 0,
  oiled: false,
  solenoids: false,
  doorOpen: false,
  slitOpen: false,
  seen: {},
  hintsUsed: 0,
};

export function channelCount() {
  return (Object.keys(state.channels) as ChannelId[]).filter((k) => state.channels[k]).length;
}

export function patchedCount() {
  return (Object.keys(state.patched) as ChannelId[]).filter((k) => state.patched[k]).length;
}

// ------------------------------------------------------------------- context
export interface Ctx {
  scene: THREE.Scene;
  kit: Kit;
  mats: MatLib;
  interact: InteractSystem;
  player: Player;
  ui: Ui;
  audio: Audio;
  /** fade the whole screen, used for the door and transitions */
  fade: (on: boolean) => void;
  /** staged mains restoration */
  powerUp: () => void;
  /** bookkeeping changed: refresh the notebook */
  changed: () => void;
  /** the door opened — roll credits */
  onEscape: () => void;
}

/** Circuits on the fuse panel: slot id → rating it wants. */
export const CIRCUITS: { id: string; label: string; rating: string }[] = [
  { id: "lighting", label: "LIGHTING", rating: "5" },
  { id: "motive", label: "MOTIVE", rating: "10" },
  { id: "instruments", label: "INSTRUMENTS", rating: "15" },
  { id: "heating", label: "HEATING", rating: "20" },
];

export const ROSTER: { shift: number; name: string; code: string }[] = [
  { shift: 1, name: "VOSS", code: "A7Q" },
  { shift: 2, name: "ALDRITCH", code: "K2M" },
  { shift: 3, name: "PRYCE", code: "R9D" },
  { shift: 4, name: "BELL", code: "B4B" },
];

/** 7 2 9 4 — one digit per code, read in shift order */
export const SAFE_CODE = ROSTER.map((r) => r.code.replace(/\D/g, "")).join("");
