# Two map-specific public building kits

The two concept boards were generated first with the built-in imagegen tool. The
complete original prompts are archived next to them. The approved direction from
the conversation was to preserve recognizable shapes and make them more cartoon-like.

- `compact-concept.png`: Bay Carnival Town — harbor hall, seaside vault, dock
  crane, card arcade, carnival prize wheel, lighthouse portal, miniature express.
- `expansion-concept.png`: Metro Wonder City — clock hall, glass vault, tower
  crane, card theatre, astral prize wheel, loop portal, streamlined express.

`../build_map_specials.py` builds fourteen original Blender mesh assets following
those silhouettes. Windows, clocks, cards, coins, canopy ribs, dock planks, ropes,
rocks, arches, curtains and train bodies are mesh geometry, with no texture URLs,
fonts, external models or runtime decoder dependencies. Rounded silhouettes and
selective ornamental details are retained at one-board-tile scale. The rendered
models are authored approximations of the concept art, not extracted geometry.

Rebuild with Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python art/build_map_specials.py
```

Optional environment variables: `MAP_SPECIALS_KIT=compact` or `expansion` rebuilds
one kit; `MAP_SPECIALS_RENDER=0` skips rendering while still exporting and saving
the editable Blender scene. `MAP_SPECIALS_RENDER_NAMES=expansion_rush_station`
limits individual close-ups to a comma-separated root-name list; the complete
contact sheet and editable studio scene are still updated.

The script exports `assets/models/{compact,expansion}-specials.glb`, a `.blend`
studio scene and a JSON manifest. Each manifest records exact bounds, triangle
counts, file size, source concept, root names and the articulated nodes. Individual
680 × 740 close-up renders and 1800 × 1280 contact sheets are saved in `renders/`.

All roots use the original kit's metre scale, bottom-centre origin and 1.02 × 1.02
footprint. Blender front is -Y and glTF front is +Z. Each map contains roots named
`<map>_civic_hall`, `vault_bank`, `builders_guild`, `card_pavilion`, `chance_wheel`,
`teleport_gate`, and `rush_station` (with the map prefix on every name).

Each prize wheel has an independent `life_<map>_wheel_rotor`, and each crane an
independent `life_<map>_crane_pendulum`. Both use `lifePart` extras and local Z
rotation in the existing scene-life animation contract. The static bases are
unchanged by these animations. Existing classic-map assets are not overwritten.
