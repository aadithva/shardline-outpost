# Shardline Outpost

An original, playable third-person shooter prototype inspired by painterly adventure-game environments and layered diegetic HUDs.

You play **Mara Venn**, the last Wayfinder. The ancient Heartshard beneath Skywatch has
reanimated its dead wardens and corrupted the garden's creatures into the **Shardborn**.
Mara must cross three ruined districts, defeat the Heartwyrm, and stabilize the beacon
with her shard-powered **Sunspike repeater**.

## Run

```bash
npm install
npm run dev
```

## Controls

- `WASD` move
- Mouse aim
- Left mouse fire
- `Shift` sprint
- `Space` dash
- `Q` shard pulse
- `R` reload
- `E` interact with the Heartshard
- `Esc` release the cursor

## Included

- Locally stored KayKit Ranger/Skeleton characters and Quaternius animated monsters
- Rigged skeletal animation for idle, walk, run, aim, shoot, reload, hit, and death states
- Three authored combat zones: Sunken Courtyard, Broken Causeway, and Heartshard Sanctum
- Collision-aware third-person camera, mouse aiming, passable doorways, and cover
- Hitscan shooting, dodgeable magic projectiles, bloom, sprite VFX, smoke, sparks, and scorch marks
- Line-of-sight enemy AI, phased waves, health, shields, cooldown abilities, and a boss encounter
- Quaternius trees, flowers, grass, bushes, rocks, plus KayKit modular ruins and props
- Responsive HUD with objectives, compass, minimap, boss health, interaction prompts, and ammo
- Full simulation and skeletal-animation freeze while paused

See [ASSETS.md](./ASSETS.md) for model sources and licensing.
