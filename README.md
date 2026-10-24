# BakedVoxelLighting

A desktop Three.js woodland prototype with browser GPU baking, IndexedDB persistence, live lighting updates, and four tree and grass distance levels.

## Run

```powershell
git clone https://github.com/SamG-Coder/BakedVoxelLighting.git
cd BakedVoxelLighting
npm ci
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173. Drag to orbit; scroll to travel. Explore world enables mouse look and WASD, with Shift for faster walking and Escape to release the pointer. Next viewpoint cycles cameras. Tree and grass controls can force levels for inspection. The sun slider updates lighting; the moving-light checkbox animates a point light. Bake & cache world saves the current sun/volume configuration. Clear cache removes this application's stored bakes.

## World and vegetation

The deterministic 4,000 x 4,000 m world (16 km²) uses a 2001-square terrain grid, 42,000 erosion droplets, sediment deposition, thermal relaxation, and slope-aware routes. Moisture, slope and foot traffic drive meadow, dry grass, rock and soil blending. It contains 37,751 trees in 1,024 spatial batches, nine tree prototypes across oak/birch/ash, multi-stem shrubs, clustered rocks, and 27,556 grass patch locations. Nearby grass geometry is generated lazily and released beyond the active region.

Trees use continuous tapered branch tubes with child forks embedded into parent wood. Roots flare into the ground. A shared irregular root field scales with tree size, raises the soil by up to 12 cm, blends exposed soil into surrounding grass and suppresses grass placements, including grass impostors. Ground and grass use the same field so a soil patch is not covered by the old grass distribution. This is an artistic root-zone approximation, not a biological root simulation.

| Level | Trees | Grass |
|---|---|---|
| L0 | Below 85 m: detailed branch tubes and foliage cards | Below 34 m: mixed crossed foliage cards |
| L1 | 85-190 m: fewer branch ring sides, same branch skeleton and foliage positions | 34-70 m: reduced clump density |
| L2 | 190-420 m: simplified actual branches plus 16-view canopy captures from the high-detail source | 70-135 m: three shared 8-view patch captures |
| L3 | Beyond 420 m: 8-view full-tree captures, each anchored at its original terrain position | Beyond 135 m: terrain meadow coverage |

Distances use spatial batch centres. Complementary screen-door fades overlap adjacent levels over 14/26/45 m for trees and 8/13/22 m for grass. Far trees are batched spatially but retain their individual transforms: rotating a whole cluster billboard would incorrectly shift their ground contacts on slopes. Atlas minification uses mip filtering. Rendering uses 4-sample multisampling where supported. There is no fog.

## Lighting and persistence

Three.js manages scene objects, instancing and rendering. Direct GLSL/WGSL render passes run on the selected WebGPU or WebGL2 backend. They combine terrain and trunks with partial-coverage proxies for grass, leaf clusters, shrubs, rocks, branches and water, then trace approximate sky/bounce radiance and directional visibility. CPU code assembles the detail proxies; GPU passes bake occupancy and transport. The default local light volume is 96 x 48 x 96 over 256 x 64 x 256 m, repositioned as the camera travels. Other resolutions are selectable.

Live materials sample RGB indirect light and scalar sun visibility. Direct point lights and shadows update each frame; the moving light refreshes the GPU volume about every 180 ms. Grass and leaves include an approximate thin-leaf backlighting contribution. Tree and grass captures store unlit colour and normals and are relit at runtime. This avoids rebaking their colour atlases whenever the sun moves.

Initial GPU results are read asynchronously and stored in IndexedDB. SHA-256 identities include texture contents and relevant generator/shader sources. Live light updates stay on the GPU and do not add cache entries per frame. A cold default bake creates 51 main-cache records: 13 source mip chains, 13 normal maps, occupancy, static transport, live lighting, 18 tree colour/normal atlases, 3 grass atlases and a statistical far-grass ground-coverage map. Origin, settings or source changes invalidate relevant entries. Old configurations remain until cleared; automatic eviction is not implemented.

## Assets

There are 13 generated base-colour PNGs in public/textures: three barks, three tree foliage materials, meadow grass, seedhead grass, clover, dirt, rock, dry meadow ground and lush meadow ground. Source images are actually **1254 x 1254**, despite 2048 being requested. Matching exported normal PNGs are browser GPU finite differences of source luminance, not scanned high-poly normals. Texture tiling is not guaranteed mathematically seamless.

## Reference

D:\KingdomComeGlueMapper was inspected read-only, particularly tools/voxel_lighting.py, voxel_raster_cuda.cu, vegetation_gi.py, setup_bake_cache.py and world_lighting.py. The browser implementation adopts separate occupancy/light channels, partially opaque vegetation and source-aware cache identities. No KCD textures, native SVO payloads or CUDA/OptiX binaries are used.

## Verification and limits

With the dev server running, use `npm test` and `npm run build`. The Playwright suite uses installed Edge and checks cold/warm cache reuse, colour/normal capture coverage, all four levels, complementary fades, live GPU light changes, cache stability during animation, source-independent sun updates, resolution changes, root-mask falloff, erosion conservation and cache clearing. Screenshots and results are written to evidence/.

This remains a prototype. Voxel occupancy uses coarse proxies, not alpha-aware triangle voxelization; individual grass blades and rocks do not occlude that field. Lighting is approximate RGBA8 radiance, not a converged path trace. Impostors have discrete azimuth views, no depth reprojection or elevation views, and freeze captured foliage motion. Shared grass variants still repeat. The terrain grid is 2 m, so root mounds are subtle interpolated features. Mobile work and 3D block merges are deferred.


## Landscape distribution and distant terrain

Woodland density is controlled at two scales: broad habitat suitability and smaller 12-34 m clumps. Slope and upland exposure reduce suitability; river-side moisture modifies it. A 3.3 m minimum trunk spacing prevents overlapping stems. Stand composition varies with habitat. Sparse isolated trees remain outside the dense cores. This is a deterministic ecological approximation, not a simulation of seed dispersal, succession, fire or competition through time.

The river has one continuous meandering channel and a monotonically descending water profile. The terrain is carved to that profile after erosion, with a blended bank/floodplain and water strip. This is a prescribed drainage corridor, not a hydrological network generated from flow accumulation. Water is currently a simple material, not a fluid simulation.

Terrain is divided into 1,024 tiles, each with 48, 12 and 4 subdivisions per side. Distance chooses the mesh at 260 and 850 m. All levels sample the same eroded and river-carved height data; vertical skirts conceal resolution joins. River-intersecting tiles retain fine subdivisions at distance so the narrow channel does not disappear in coarse triangles. The camera can see across the full map without fog. Terrain changes levels discretely; vegetation retains its existing fades. No invented mountains are added beyond the 4 km boundary.

Dirt repeats at 1.25 m, meadow at approximately 1.39 m, and rock at 2.5 m, independently of map size. Ground normal sampling also uses world coordinates. Nearby grass candidate density increased from 1,050 to 2,600 per patch, with traffic, water and root exclusions retained. Far grass uses 110 candidate patch impostors instead of 55. Forest cores are denser while exposed uplands remain more open.

Research informing the spatial rules: [US Forest Service: individuals, clumps and openings](https://research.fs.usda.gov/treesearch/54887) and [National Park Service: soils and moisture in riparian communities](https://www.nps.gov/pohe/learn/nature/gorge-riparian-comm.htm). These sources describe particular ecosystems; their exact species or densities are not presented as universal targets for this woodland.

`node scripts/landscape-data.mjs` verifies dimensions, density variation, river exclusion and river-bed coverage, writing evidence/landscape-data.json. The browser suite captures an overview and river corridor. Forced detailed tree levels are capped beyond 650 m to keep a diagnostic selection from expanding full-detail geometry across all 16 km².


Frustum culling uses Three.js mesh bounding volumes. Terrain is culled per tile and vegetation per instanced batch, not per plant. There is no hierarchical occlusion culling: terrain-hidden batches can still be submitted. Very distant empty grass groups are skipped before scene traversal. This prototype does not yet maintain a GPU per-instance visibility list.


## Visibility-triggered merged mesh baking

Far-tree L3 batches now merge all nine prototype variants into one indexed mesh per spatial cluster. A shared colour/normal atlas packs the source prototype captures into nine rows. Every tree keeps its own centre, yaw, scale and camera-facing quad; this is merged geometry, not one flat image of a whole forest. Nearer tree levels keep their existing meshes and transitions.

At startup, active far-distance clusters are prepared around the camera in all directions, preventing a turn from revealing hundreds of unprepared draws. Subsequent updates queue clusters whose far level is active and whose conservative bounds intersect the camera frustum. The nearest eligible cluster is processed first, with at most one asynchronous cache/bake job in flight. Existing L3 geometry stays in place until replacement is ready. Camera turns can request new clusters; previously invisible geometry is not permanently discarded. Frustum checks include an allowance for shader-rotated quad corners.

Merged typed-array geometry is persisted in the BakedVoxelLightingMerged IndexedDB database using source identity and cluster ID. The project cache button clears both databases. This is a CPU geometry assembly bake using browser-generated GPU surface atlases; it is not a GPU mesh simplifier. It does not implement hill/occluder visibility, per-tree culling, or merged near-detail branches. Sun changes relight the shared materials without rebuilding merged geometry.

The footer reports merged versus visible far clusters. Detailed counts are available at worldDiagnostics.mergedVisibility. `npm run test:merged` checks single-mesh replacement, untouched unrequested clusters, cache restoration and camera-turn continuation; evidence is written to evidence/merged-visibility.json. Ordinary regression checks remain available with `npm test`.


## Variable-refresh frame timing

Rendering uses one continuous requestAnimationFrame chain with no application 60 FPS cap. Hidden tabs cancel that chain; returning starts one chain and resets timing. Baking pauses reset the FPS window, avoiding misleading low readings that include time when no frames were rendered. The FPS tooltip reports callback interval and CPU submission time; neither is a measurement of panel refresh or GPU completion.

Orbit damping is normalized by elapsed seconds against the original 60 Hz feel. Walking, wind and moving lights remain time based. `npm run test:frames` tests synthetic 60/180/90/60 Hz changes, pause/resume and damping equivalence, then records idle and pointer-motion browser timing in evidence/frame-timing.json. The headless browser test cannot verify the user's physical 180 Hz/DRR display. Windows/browser scheduling can change callback cadence during input; the page does not force the display refresh mode.


Terrain uses FrontSide back-face culling, including outward-wound edge skirts. Orbit and walking cameras stay above both the source heightfield and the actual near-tile triangle surface, with 1.85 m clearance. Thin foliage remains double-sided deliberately. `npm run test:terrain-faces` verifies downward terrain hits, rejection from below, and recovery from an underground camera position.


## Direct GLSL/WGSL rendering and baking

The Bake Studio graphics selector chooses WebGPU or forced WebGL2. Switching reloads the scene and remembers the choice in localStorage; a `?backend=webgpu` or `?backend=webgl2` URL overrides it. The header reports the actual backend, including an explicit message if WebGPU is unavailable and Three.js falls back. Both modes use Three.js WebGPURenderer with a thin node-material binding layer for native shader functions. Hardware 4-sample MSAA replaces the legacy WebGL EffectComposer/SMAA chain.

Normal-map derivation, voxel occupancy, static sky/bounce transport, dominant incoming light direction, live sun/point-light visibility and tree/grass colour-normal atlas captures all run through the selected renderer. WebGPU mode uses WGSL GPU render passes, with no hidden WebGL baking renderer. These are render-to-texture GPU passes, not compute-dispatch kernels. Mesh generation, partial vegetation occupancy preparation, merged mesh assembly and statistical ground-coverage generation remain CPU work.

Grass stays textured cards. Its lighting normal represents the upright tuft and rotates with plant yaw, independently of the carrier card. Leaves retain curved cluster vertex normals with texture normal detail. Impostor normal atlases store source/world-space directions; runtime shading rotates those directions with the plant, rather than with the camera-facing card. Captures are unlit and can be relit without rebaking when the sun moves. Cache rows use a canonical bottom-up order across both backends.

Shader graphs are shared between material variants. Per-object LOD fade uniforms stay separate; the shared light/terrain texture state is not serialized into cloned material userData.

Run `npm run test:backends` with the dev server running to exercise cold baking in both backends, cross-backend cache reuse through the real selector, all four LODs, live-light readback changes, padded-row readback orientation, colour/normal atlas coverage, and camera-independent billboard normals. The test uses installed Edge with WebGPU support. Source row alignment is handled explicitly for Three r186's raw WebGPU readback buffers. Incorrect pre-conversion caches are invalidated by the new identities.

Startup precompiles the visible scene asynchronously with progress. Instancing prefers attributes to avoid a shader variant for every batch's instance count. First-use shader preparation and merged-cluster construction still cost time; a higher frame rate is not guaranteed by the backend migration.

Custom voxel occupancy, transport and live-light kernels are authored in `src/shaders/volume.glsl` and `volume.wgsl`. `src/native-kernels.js` contains paired native functions for normal baking, grass normals, wind, foliage radiance, terrain blending, volume sampling, atlas selection and fades. The `tsl-materials.js` and `tsl-baking.js` names are retained for compatibility: they bind textures/uniforms/attributes and connect the native functions to Three.js. Three still generates its built-in PBR, shadows and render plumbing with nodes; this is not a separate raw WebGPU renderer or a WebAssembly conversion.

Static scene world matrices are now initialized once, with explicit updates for moving lights and newly attached objects. This removes repeated full-world matrix propagation from shadow passes. A local 1280x800 headless Edge CPU profile before native-kernel conversion improved from about 8 FPS / 118 ms CPU submission to 60 FPS / 16 ms after this fix and visible-cluster premerging. These measurements diagnose the regression; they are not a guarantee of physical display refresh, GPU completion time, or performance on another computer.

### Cutout and movement regression fixes

Material clones explicitly preserve alphaTest (Three r186 NodeMaterial.copy omits this inherited property). Surface capture uses explicit alpha discard and writes RGBA directly. Colour tests reject black-only captures. Atlas mip chains are built per view in an atlas worker, with alpha-weighted colour/normal reduction and coverage preservation; merged forests pack the same mip chains. Mipmaps, four tree HLOD levels, billboard plant normals and merged far meshes remain enabled.

Ground shader UVs bypass texture repeat matrices so world-space tiling is applied once. Startup warms the active distance rings in all camera directions. Inactive LOD and shrub groups detach from scene traversal. Grass construction and local voxel contributor preparation yield in small chunks. Local volume rebuilding keeps rendering the previous lighting until the replacement is ready; GPU readback restores the presentation target before yielding. This is cooperative main-thread scheduling for geometry/proxies, plus a dedicated worker for atlas mip processing, not a claim that all CPU work has moved to workers.

`node scripts/verify-camera-turn.mjs` exercises actual pointer drags and checks that frames continue during a displaced-volume rebuild. It writes interval measurements to `evidence/camera-turn.json`. Physical 180 Hz presentation is not covered by this headless test.

### Sun, clouds and local scattering

The visible sky sun, directional shadow light and voxel sun direction share one
normalized direction. The sky follows the camera across the 4 km map. Clouds
occupy a world-space layer at 650 m; a shared 512-square GPU texture supplies the
visible cloud pattern and sunlight attenuation (up to 48%). Clouds attenuate
both direct surface lighting and foliage transmission. This is live shading;
the static occupancy/transport cache is not rebuilt as clouds drift.

A depth-limited, eight-sample scattering pass runs at 35% linear resolution and
uses the streamed voxel visibility. It adds local lit-air scattering without a
blanket distance-fog extinction term. This is an approximate single-scattering
pass, not full atmospheric transport; its shafts are limited by voxel resolution
and the 256 m local volume. Volume boundaries blend over 24 m horizontally and
6 m vertically. Recenter requests begin 64 m from the current requested centre.
Fast travel can still outrun asynchronous bake completion.

Grass placement uses 3,400 candidates per near block, with darker/shorter coherent
patches and a varying preferred growth direction. The worker and bake-source
placement use the same changes. The existing meadow, seedhead and clover assets
remain in use; no additional texture species were generated in this change.
Oak, birch and ash now also form coherent groves in the open-land selection.

Validation: `node scripts/verify-sun.mjs` checks multi-block grass and shared sun
parameters and captures `evidence/visible-sun.png`. Backend verification checks
cutout thresholds, atlas mipmaps, live relighting and cache reuse. Headless timing
does not certify smooth 180 Hz presentation on a physical display.
Cloud-field generation is an explicit 10 Hz GPU pass. Materials sample its
shared texture; they do not carry their own procedural-noise or RTT dependency.
Observed movement limitation: the final profiled WebGPU traversal kept 257 frames
flowing through a roughly 7.2-second volume rebuild, but its worst interval was
about 500 ms. The two camera sweeps had 95th-percentile intervals of about 83 and
50 ms. Shader graph construction and scene traversal remain substantial costs;
this change does not establish hitch-free high-speed streaming. The separate
settled-view check reached 60 FPS; these are different acceptance boundaries.

### Indexed static bakes, colour-preserving LODs and the 24-minute cycle

- `AreaIndex` stores bounds in 64 m X/Z cells and returns candidates in stable
  source order. Voxel tree/grass/shrub/rock queries use these indexes. Instanced
  rock/shrub transforms and bounds are extracted once at world setup.
- The static world fingerprint is hashed once, rather than serializing all trees
  on every streamed-volume request.
- All three rendered grass LOD placements are worker-generated and persisted in
  `BakedGrassBlocks-v1`, addressed by source identity, block coordinates, seed and
  LOD. A bounded 96-entry resident cache avoids repeated database reads. Voxel
  grass uses the same cached high-detail placement. The project-cache button
  clears this database too. First visits still require missing blocks to bake.
- Every source colour and normal texture has an explicitly generated, cached mip
  chain. Colour reduction uses linear light and original alpha weights; normal
  vectors are renormalized and cutout coverage is handled independently. Atlas
  frames remain isolated. Far grass uses the same habitat mixture, material tint
  and transmission strength as near grass; the ground-cover colour comes from
  source mip averages with the matching tint. Mipmaps cannot remove differences
  caused by geometry silhouettes or local lighting coverage.
- The cloud stripe bug was a native-function entry-point error: the wrapper had
  selected a hash helper instead of the 2D density function. The replacement has
  one entry point. The 1024-square cloud density/mip field bakes once; runtime
  movement samples translated UVs. This supersedes the earlier 10 Hz noise bake.
- One real second advances one world minute. A full cycle is 1,440 real seconds
  (24 minutes). The time slider scrubs time, the checkbox pauses/resumes, and
  **Look at sun** aims toward the daytime sun. Sun intensity, ambient light,
  vegetation transmission and scattering respond to daylight; live radiance
  refreshes periodically without rebuilding static occupancy or transport.

Checks: `verify-area-cycle.mjs` compares indexed queries to exhaustive bounds
checks and verifies clock arithmetic; `verify-mip-colour.mjs` checks linear-light
averaging, transparent-pixel rejection and atlas-view isolation;
`verify-cycle-browser.mjs` checks daytime/nighttime, clock progression and cloud
variation on both axes. Backend checks now expect 51 reusable main-cache bakes.
Static lookup work is reduced; GPU draw submission, visibility decisions, dynamic
lighting and first-use shader preparation remain runtime work.
Voxel-volume origins now use a 64 m horizontal area address and an 8 m quantized
height derived from that area's centre. Camera sub-cell movement therefore does
not change the occupancy cache key. The browser cycle test checks this reuse.

Latest profiled traversal before this final address correction: cold/warm sweep
p95 intervals were about 83/50 ms; a background rebuild took about 5.5 seconds,
continued rendering 180 frames, and had a worst interval around 483 ms. These
results do not establish hitch-free movement; shader preparation and draw/scene
work remain costs beyond the static-data bake changes.


## License

Released under the [MIT License](LICENSE). Generated texture provenance is
recorded in [docs/asset-prompts.md](docs/asset-prompts.md). Third-party npm
dependencies retain their respective licenses.

Local verification scripts are included. No GitHub Actions workflows or automated
CI tests are configured for this initial release. This is an experimental desktop
renderer; the streaming/performance limitations above remain open.
