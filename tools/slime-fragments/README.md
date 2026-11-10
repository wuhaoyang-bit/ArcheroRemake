# Rebuilding the irregular fragment assets

The runtime uses 20 unequal weighted Voronoi cells (seed 74123). Cut interfaces are generated once and shared with reversed winding; their curved interior surfaces meet exactly. The live body's outer surface remains the reference boundary. Physics and skin bindings are baked offline.

Generate into a staging directory first, using Node/tsx and a Python environment with numpy, scipy and trimesh:

```sh
npx tsx tools/slime-fragments/generate.ts /tmp/slime-cuts/raw
python tools/slime-fragments/build-meshes.py /tmp/slime-cuts/raw /tmp/slime-cuts/runtime
python tools/slime-fragments/bind-pose.py /tmp/slime-cuts/runtime
```

Review `manifest.json`, `mesh-report.json` and `pose-report.json`, then copy the staged runtime files into `public/assets/slime-fragments/`. The loader and validation tools read the piece count from the manifest. Sidebar copy states the current count and should be updated if it changes again.

The generator checks both neighbours of every interior interface. Tests check reconstruction against the body, total signed volume, mixed piece volumes, the physics/render budget, soft landing and the exact inner/outer face labels. Browser checks cover live explosions and GPU/CPU normal consistency.

The current set has 91,520 surface triangles, 1,125 physics nodes and 3,917 tetrahedra. It keeps the one-mesh-per-burst GPU rendering path; increasing count does not add a draw per fragment. Each burst uses the same baked cuts, mapped to its live death pose; cuts are not randomized at runtime.
