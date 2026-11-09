/** Local FEM conf (no tweakpane). Mutated by SlimeBurstFem. */
export const conf = {
  /** Preview default 30 — 60 still hitchy with multi-chunk FEM. */
  stepsPerSecond: 30,
  /** Cap substeps per update to avoid spiral-of-death when a frame hitch accumulates. */
  maxStepsPerFrame: 1,
  /** Active softbody count; FEMPhysics.update syncs kernels to this. */
  bodies: 0,
  /** Basic spatial hash resolution (was 80 → 512k clears/step; 32 still heavy). */
  gridSize1d: 16,
  /**
   * Preview: skip tet–tet collision grid (compile + clearBuffer + 3³ neighbor walk).
   * Ground plane collider in applyElemPass still runs.
   */
  collisionsEnabled: false,
};
