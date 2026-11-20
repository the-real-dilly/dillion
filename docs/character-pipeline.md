# Realistic characters: pipeline and guide

Decisions (locked):
- **Route:** MetaHuman Creator or Reallusion Character Creator 4 (CC4) for the hero, exported to **glTF/GLB** for the browser.
- **Likeness:** **lookalike only.** Dilly is *inspired by* the written description below but must **not** be a close likeness of any real person (so the public can't tell who it's based on). Don't build him from face photos or a face scan of a real person.
- **Fallback:** the procedural (code-built) human stays in the game for weak devices, crowds, and until a real model is dropped in.

## 1. Dilly's design brief (lookalike, not a portrait)

Young adult, lean build. Fair skin, light-brown eyes, no beard. Short dark-brown hair, slightly messy, swept to one side with a short fringe. Slightly squared jaw, straight brows. Outfit: oatmeal heathered quarter-zip fleece with a stand-up collar, short front zip and a small zipped pocket on the left sleeve; light-grey hiking trousers; black snow gaiters over black boots. Change a few facial proportions (nose, jaw, eye spacing) from anyone you know, so it's a believable fictional person.

## 2. Making the character

**MetaHuman Creator (free with an Epic account; runs in the browser/cloud)**
1. Start from a preset close to the brief; use the sliders for skin, eyes, hair and body. Don't use "Mesh to MetaHuman" on a real person's photos or scan.
2. Add the clothes: MetaHuman clothing is limited, so dress him in Unreal, Blender or CC4 (or model the fleece and trousers in Blender).
3. Export through Unreal Engine (Quixel Bridge → MetaHuman plugin) and bring the character into Blender, then export to **GLB**.

**Character Creator 4 (paid, from Reallusion)**
1. Pick a base, then sculpt the face with the sliders. Use the Hair and Outfit libraries (or Smart Hair).
2. Export with **GLB/FBX**, enabling "ARKit 52 facial blendshapes" if offered.

**Either way, finish in Blender (free):** reduce the polygon count, bake texture sets, check skin weights, and export a single GLB.

## 3. Technical spec for the GLB (so it runs in a browser)

| Item | Target |
|---|---|
| Triangles | **30,000–60,000** for the hero (body + head + hair + clothes); also supply a **LOD1 of about 10,000** if you can |
| Textures | 2K (2048 px) max for the head and body, 1K for clothes and hair; **PBR** (base colour, normal, roughness; optional AO). Compress with **KTX2/Basis** if you can; otherwise use JPG/PNG |
| File size | **15 MB or less** after compression (Draco or Meshopt geometry compression is fine; the game loader will support both) |
| Skeleton | A standard humanoid rig. **Mixamo-compatible bone names** (`mixamorig:Hips`, ...) *or* the Unreal/MetaHuman skeleton are both fine; I will retarget the existing animations |
| Face | **ARKit 52 blendshapes** (morph targets) on the head mesh: `jawOpen`, `mouthClose`, `mouthFunnel`, `mouthPucker`, `mouthSmile_L/R`, `eyeBlink_L/R`, `browInnerUp`, ... These drive blinking, expressions and **lip-sync from the voice system** |
| Hair | Hair-cards with alpha textures (not strands); separate mesh so I can set the alpha test and shading |
| Pose | A-pose or T-pose, facing +Z, 1 unit = 1 m, about 1.75 m tall |
| Materials | A handful of materials: skin, eyes (separate eyeball meshes), hair, clothes, shoes; named clearly (`Skin`, `Eyes`, `Hair`, `Fleece`, `Trousers`, `Boots`) |

## 4. Delivering it

Save the final file as `assets/characters/dilly.glb` (and optionally `dilly_lod1.glb`) and add the source and licence to `assets/CREDITS.md`. Either commit it yourself (GitHub web upload works for files under 25 MB) or tell me where it is and I'll add it. The game will pick it up automatically: **if `dilly.glb` exists it's used for Dilly, otherwise the procedural character appears.**

## 5. Licence checks (do these before shipping)

The GLB is downloaded by every visitor, which counts as *redistributing* the asset. So before publishing, confirm:
- **MetaHuman:** the current MetaHuman licence terms for use *outside Unreal Engine* and for shipping the exported character files in a web build. These terms have changed over time. If the terms don't allow it, use CC4 or a commissioned model instead.
- **CC4 / Reallusion:** that your licence tier allows commercial use and distributing exported characters inside a game or website, including the hair and clothing items you used.
- **Any marketplace clothing, hair or textures:** the same question.
- Record the answer for each in `assets/CREDITS.md`. If a licence doesn't allow web distribution, don't ship that asset.

## 6. What the game does with the model (my side)

- Loads the GLB with the vendored GLTFLoader (+ Draco/Meshopt/KTX2 decoders if needed), clones with SkeletonUtils.
- Retargets the existing animation set (idle, walk, sprint, crouch, jump, aim poses, driving, talking) onto the rig.
- Drives the ARKit blendshapes: blinking, eye-darts, brows, smile, and lip-sync visemes from the speech system.
- PBR skin shading with subsurface-style tricks, hair-card alpha, cloth sway on secondary bones, IK for feet on slopes and hands on the wheel and guns.
- A high/low quality switch: the LOD1 model or the procedural character on weak devices.
- Same pipeline for Last Zone's operator.

## 7. Everyone else (bots, pedestrians)

Variants of the same body/head tools exported at lower detail (CC4 and MetaHuman can both produce many), or the free CC0 packs, or the procedural characters. Budget: 3,000–8,000 triangles each with instancing/LOD.

## 8. Checklist

- [ ] Character designed as a **lookalike** (not a close likeness of a real person)
- [ ] GLB ≤ 15 MB, 30–60k tris, 2K textures, PBR
- [ ] Humanoid skeleton + ARKit blendshapes on the head
- [ ] Licences checked and recorded in `assets/CREDITS.md`
- [ ] Saved as `assets/characters/dilly.glb`
