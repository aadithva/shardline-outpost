import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const assetPath = (path) => `${import.meta.env.BASE_URL}${path}`;

const CHARACTER_PATHS = {
  ranger: assetPath("assets/characters/ranger.glb"),
  skeletonRogue: assetPath("assets/characters/skeleton-rogue.glb"),
  skeletonMage: assetPath("assets/characters/skeleton-mage.glb"),
  skeletonWarrior: assetPath("assets/characters/skeleton-warrior.glb"),
};

const ANIMATION_PATHS = [
  assetPath("assets/animations/movement-basic.glb"),
  assetPath("assets/animations/general.glb"),
  assetPath("assets/animations/combat-ranged.glb"),
];

const PROP_PATHS = {
  heroCrossbow: assetPath("assets/props/crossbow_2handed.gltf"),
  skeletonCrossbow: assetPath("assets/props/Skeleton_Crossbow.gltf"),
  skeletonStaff: assetPath("assets/props/Skeleton_Staff.gltf"),
};

const MONSTER_PATHS = {
  dragon: assetPath("assets/characters/quaternius-dragon.fbx"),
  slime: assetPath("assets/characters/quaternius-slime.fbx"),
  bat: assetPath("assets/characters/quaternius-bat.fbx"),
};

const ENVIRONMENT_PATHS = {
  wallBroken: assetPath("assets/environment/wall_broken.gltf"),
  wallDoorway: assetPath("assets/environment/wall_doorway.gltf"),
  wallArched: assetPath("assets/environment/wall_arched.gltf"),
  pillarDecorated: assetPath("assets/environment/pillar_decorated.gltf"),
  stairs: assetPath("assets/environment/stairs.gltf"),
  crates: assetPath("assets/environment/crates_stacked.gltf"),
  barrel: assetPath("assets/environment/barrel_large_decorated.gltf"),
  floorRocks: assetPath("assets/environment/floor_tile_large_rocks.gltf"),
};

const NATURE_PATHS = {
  commonTree: assetPath("assets/nature/CommonTree_2.gltf"),
  twistedTree: assetPath("assets/nature/TwistedTree_3.gltf"),
  floweringBush: assetPath("assets/nature/Bush_Common_Flowers.gltf"),
  grassShort: assetPath("assets/nature/Grass_Common_Short.gltf"),
  grassTall: assetPath("assets/nature/Grass_Wispy_Tall.gltf"),
  flowersYellow: assetPath("assets/nature/Flower_3_Group.gltf"),
  flowersBlue: assetPath("assets/nature/Flower_4_Group.gltf"),
  rockA: assetPath("assets/nature/Rock_Medium_1.gltf"),
  rockB: assetPath("assets/nature/Rock_Medium_3.gltf"),
  steppingStone: assetPath("assets/nature/RockPath_Round_Small_1.gltf"),
};

const VFX_PATHS = {
  magic: assetPath("assets/vfx/magic_02.png"),
  muzzle: assetPath("assets/vfx/muzzle_02.png"),
  spark: assetPath("assets/vfx/spark_03.png"),
  smoke: assetPath("assets/vfx/smoke_04.png"),
  star: assetPath("assets/vfx/star_06.png"),
  flare: assetPath("assets/vfx/flare_01.png"),
  scorch: assetPath("assets/vfx/scorch_01.png"),
  ring: assetPath("assets/vfx/circle_03.png"),
};

function prepareScene(scene, cloneMaterials = true) {
  scene.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (child.material && cloneMaterials) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => material.clone())
        : child.material.clone();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.side = THREE.FrontSide;
      });
    }
  });
  return scene;
}

export class AssetLibrary {
  constructor() {
    this.manager = new THREE.LoadingManager();
    this.loader = new GLTFLoader(this.manager);
    this.fbxLoader = new FBXLoader(this.manager);
    this.textureLoader = new THREE.TextureLoader(this.manager);
    this.characters = {};
    this.monsters = {};
    this.props = {};
    this.environment = {};
    this.nature = {};
    this.vfx = {};
    this.animations = new Map();
  }

  async load(onProgress) {
    if (onProgress) {
      this.manager.onProgress = (url, loaded, total) => onProgress({ url, loaded, total });
    }

    const characterEntries = Object.entries(CHARACTER_PATHS);
    const monsterEntries = Object.entries(MONSTER_PATHS);
    const propEntries = Object.entries(PROP_PATHS);
    const environmentEntries = Object.entries(ENVIRONMENT_PATHS);
    const natureEntries = Object.entries(NATURE_PATHS);
    const vfxEntries = Object.entries(VFX_PATHS);

    const [characters, monsters, animationFiles, props, environment, nature, vfx] = await Promise.all([
      Promise.all(characterEntries.map(([, path]) => this.loader.loadAsync(path))),
      Promise.all(monsterEntries.map(([, path]) => this.fbxLoader.loadAsync(path))),
      Promise.all(ANIMATION_PATHS.map((path) => this.loader.loadAsync(path))),
      Promise.all(propEntries.map(([, path]) => this.loader.loadAsync(path))),
      Promise.all(environmentEntries.map(([, path]) => this.loader.loadAsync(path))),
      Promise.all(natureEntries.map(([, path]) => this.loader.loadAsync(path))),
      Promise.all(vfxEntries.map(([, path]) => this.textureLoader.loadAsync(path))),
    ]);

    characterEntries.forEach(([key], index) => {
      this.characters[key] = characters[index];
    });
    monsterEntries.forEach(([key], index) => {
      this.monsters[key] = monsters[index];
    });
    propEntries.forEach(([key], index) => {
      this.props[key] = props[index];
    });
    environmentEntries.forEach(([key], index) => {
      this.environment[key] = environment[index];
    });
    natureEntries.forEach(([key], index) => {
      this.nature[key] = nature[index];
    });
    vfxEntries.forEach(([key], index) => {
      const texture = vfx[index];
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      this.vfx[key] = texture;
    });
    animationFiles.flatMap((file) => file.animations).forEach((clip) => {
      this.animations.set(clip.name, clip);
    });
  }

  cloneCharacter(key) {
    const source = this.characters[key];
    if (!source) throw new Error(`Character asset "${key}" is not loaded.`);
    return prepareScene(cloneSkeleton(source.scene));
  }

  cloneProp(key) {
    const source = this.props[key];
    if (!source) throw new Error(`Prop asset "${key}" is not loaded.`);
    return prepareScene(source.scene.clone(true));
  }

  cloneMonster(key) {
    const source = this.monsters[key];
    if (!source) throw new Error(`Monster asset "${key}" is not loaded.`);
    const clone = prepareScene(cloneSkeleton(source));
    clone.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
        material.needsUpdate = true;
      });
    });
    clone.animations = source.animations;
    return clone;
  }

  cloneEnvironment(key) {
    const source = this.environment[key];
    if (!source) throw new Error(`Environment asset "${key}" is not loaded.`);
    return prepareScene(source.scene.clone(true));
  }

  cloneNature(key) {
    const source = this.nature[key];
    if (!source) throw new Error(`Nature asset "${key}" is not loaded.`);
    return prepareScene(source.scene.clone(true), false);
  }

  getVfxTexture(key) {
    const texture = this.vfx[key];
    if (!texture) throw new Error(`VFX texture "${key}" is not loaded.`);
    return texture;
  }
}
