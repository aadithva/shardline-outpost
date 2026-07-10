import * as THREE from "three";

const CLIPS = {
  idle: "Idle_A",
  walk: "Walking_B",
  run: "Running_A",
  aim: "Ranged_2H_Aiming",
  shoot: "Ranged_2H_Shoot",
  reload: "Ranged_2H_Reload",
  magicAim: "Ranged_Magic_Raise",
  magicShoot: "Ranged_Magic_Shoot",
  hit: "Hit_A",
  death: "Death_A",
};

class MarketplaceRig {
  constructor(assets, options) {
    this.assets = assets;
    this.root = new THREE.Group();
    this.root.name = options.name;
    this.visual = assets.cloneCharacter(options.character);
    this.visual.rotation.y = Math.PI;
    this.visual.scale.setScalar(options.scale ?? 1);
    this.root.add(this.visual);

    this.mixer = new THREE.AnimationMixer(this.visual);
    this.actions = new Map();
    this.activeAction = null;
    this.activeName = "";
    this.desiredState = "idle";
    this.lockTimer = 0;
    this.flashTimer = 0;
    this.dead = false;
    this.spine = this.visual.getObjectByName("spine");
    this.head = this.visual.getObjectByName("head");
    this.handSlot = this.visual.getObjectByName("handslot.r");
    this.aimAxis = new THREE.Vector3(1, 0, 0);
    this.spineAimOffset = new THREE.Quaternion();
    this.headAimOffset = new THREE.Quaternion();
    this.inverseAim = new THREE.Quaternion();

    for (const [name, clip] of assets.animations) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(name, action);
    }

    if (options.weapon && this.handSlot) {
      this.weapon = assets.cloneProp(options.weapon);
      this.handSlot.add(this.weapon);
    }

    const muzzleParent = this.weapon ?? this.handSlot ?? this.visual;
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(...(options.muzzle ?? [0, 0, 1.15]));
    muzzleParent.add(this.muzzle);

    if (options.coreColor) {
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: options.coreColor,
        emissive: options.coreColor,
        emissiveIntensity: 1.5,
        roughness: 0.25,
        metalness: 0.2,
      });
      this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), coreMaterial);
      this.core.position.set(0, 1.34, -0.38);
      this.core.castShadow = true;
      this.root.add(this.core);

      const light = new THREE.PointLight(options.coreColor, 3.5, 4.5, 2);
      light.position.copy(this.core.position);
      this.root.add(light);
    }

    this.playLoop(CLIPS.idle, 0);
  }

  playLoop(name, fade = 0.18) {
    if (this.dead || this.activeName === name) return;
    const next = this.actions.get(name) ?? this.actions.get(CLIPS.idle);
    if (!next) return;

    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();

    if (this.activeAction && fade > 0) {
      next.crossFadeFrom(this.activeAction, fade, true);
    } else if (this.activeAction) {
      this.activeAction.stop();
    }

    this.activeAction = next;
    this.activeName = name;
  }

  playOneShot(name, duration, fade = 0.07, lock = true) {
    if (this.dead && name !== CLIPS.death) return;
    const action = this.actions.get(name);
    if (!action) return;

    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(Math.max(0.01, action.getClip().duration / duration));
    action.play();

    if (this.activeAction) {
      action.crossFadeFrom(this.activeAction, fade, true);
    }

    this.activeAction = action;
    this.activeName = name;
    if (lock) this.lockTimer = duration;
  }

  removeAimOffsets() {
    if (this.spine) {
      this.inverseAim.copy(this.spineAimOffset).invert();
      this.spine.quaternion.multiply(this.inverseAim);
    }
    if (this.head) {
      this.inverseAim.copy(this.headAimOffset).invert();
      this.head.quaternion.multiply(this.inverseAim);
    }
  }

  applyAimOffsets(aimPitch) {
    this.spineAimOffset.setFromAxisAngle(this.aimAxis, aimPitch * 0.16);
    this.headAimOffset.setFromAxisAngle(this.aimAxis, aimPitch * 0.08);
    if (this.spine) this.spine.quaternion.multiply(this.spineAimOffset);
    if (this.head) this.head.quaternion.multiply(this.headAimOffset);
  }

  updateAnimation(delta, state, aimPitch = 0) {
    this.desiredState = state;
    this.removeAimOffsets();
    this.mixer.update(delta);

    if (this.core) {
      this.core.rotation.x += delta * 1.4;
      this.core.rotation.y += delta * 2.2;
      this.flashTimer = Math.max(0, this.flashTimer - delta);
      this.core.material.emissiveIntensity = this.flashTimer > 0 ? 5 : 1.5;
    }

    if (this.dead) return;

    this.lockTimer = Math.max(0, this.lockTimer - delta);
    if (this.lockTimer <= 0) {
      this.playLoop(CLIPS[state] ?? CLIPS.idle);
    }
    this.applyAimOffsets(aimPitch);
  }

  hit() {
    if (!this.dead) this.playOneShot(CLIPS.hit, 0.28, 0.04);
    this.flashTimer = 0.09;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.playOneShot(CLIPS.death, 0.9, 0.08, false);
  }
}

export class PlayerRig extends MarketplaceRig {
  constructor(assets) {
    super(assets, {
      name: "MaraVenn",
      character: "ranger",
      weapon: "heroCrossbow",
      scale: 1.04,
      muzzle: [0, 0, 1.24],
    });
  }

  update({ delta, movement, speed, aimPitch }) {
    const state = movement < 0.05 ? "aim" : speed > 5.3 ? "run" : "walk";
    this.updateAnimation(delta, state, aimPitch);

    if (this.lockTimer > 0 || !this.activeAction) return;
    if (state === "walk") {
      this.activeAction.setEffectiveTimeScale(
        THREE.MathUtils.clamp(movement / 3.9, 0.72, 1.18),
      );
    } else if (state === "run") {
      this.activeAction.setEffectiveTimeScale(
        THREE.MathUtils.clamp(movement / 6.6, 0.78, 1.18),
      );
    }
  }

  shoot() {
    this.playOneShot(CLIPS.shoot, 0.2, 0.035);
  }

  reload(duration) {
    this.playOneShot(CLIPS.reload, duration, 0.1);
  }

  pulse() {
    this.playOneShot(CLIPS.magicShoot, 0.55, 0.08);
  }
}

export class EnemyRig extends MarketplaceRig {
  constructor(assets, variant, accent) {
    const mage = variant === "skeletonMage";
    super(assets, {
      name: mage ? "ChoirHexer" : "ChoirSentinel",
      character: variant,
      weapon: mage ? "skeletonStaff" : "skeletonCrossbow",
      scale: mage ? 1.08 : 1.04,
      muzzle: mage ? [0, 0.5, 0.35] : [0, 0, 1.1],
      coreColor: accent,
    });
    this.mage = mage;
  }

  update(delta, speed, aimPitch = 0) {
    const state = speed > 0.8 ? "run" : this.mage ? "magicAim" : "aim";
    this.updateAnimation(delta, state, aimPitch);
  }

  fire() {
    this.playOneShot(this.mage ? CLIPS.magicShoot : CLIPS.shoot, 0.38, 0.05);
  }

  flash() {
    this.hit();
  }
}

const CREATURE_CONFIG = {
  slime: {
    scale: 0.0082,
    idle: "Slime_Idle",
    move: "Slime_Walk",
    attack: "Slime_Attack",
    death: "Slime_Death",
    hit: "",
    muzzle: [0, 0.9, -0.75],
    palette: {
      Body: 0x58d64f,
      Eyes: 0x16242a,
    },
  },
  dragon: {
    scale: 0.011,
    idle: "Dragon_Flying",
    move: "Dragon_Flying",
    attack: "Dragon_Attack",
    death: "Dragon_Death",
    hit: "Dragon_Hit",
    muzzle: [0, 1.75, -2.35],
    palette: {
      Main: 0x8e294d,
      Wings: 0x4d204f,
      Belly: 0xe19a3a,
      Claws: 0xead9b4,
      Eyes: 0xffe675,
    },
  },
  bat: {
    scale: 0.012,
    idle: "Bat_Flying",
    move: "Bat_Flying",
    attack: "Bat_Attack",
    death: "Bat_Death",
    hit: "Bat_Hit",
    muzzle: [0, 1.2, -0.9],
    palette: {
      Main: 0x51306f,
      Black: 0x171b2b,
      Belly: 0xe4a344,
      Nose: 0xa84772,
      Eyes: 0x8ff6ff,
    },
  },
};

export class CreatureRig {
  constructor(assets, creature) {
    const config = CREATURE_CONFIG[creature];
    if (!config) throw new Error(`Unknown creature rig "${creature}".`);

    this.root = new THREE.Group();
    this.root.name = creature === "dragon" ? "Heartwyrm" : "ShardSlime";
    this.visual = assets.cloneMonster(creature);
    this.visual.rotation.y = Math.PI;
    this.visual.scale.setScalar(config.scale);
    this.root.add(this.visual);

    this.mixer = new THREE.AnimationMixer(this.visual);
    this.actions = new Map();
    this.activeAction = null;
    this.activeName = "";
    this.lockTimer = 0;
    this.flashTimer = 0;
    this.dead = false;
    this.config = config;
    this.emissiveMaterials = new Set();

    this.visual.animations.forEach((clip) => {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    });
    this.visual.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        const paletteColor = config.palette?.[material.name];
        if (paletteColor !== undefined && material.color) {
          material.color.setHex(paletteColor);
        }
        if (!material.emissive) return;
        material.emissive.copy(material.color);
        material.emissive.multiplyScalar(material.name === "Eyes" ? 0.72 : 0.12);
        material.emissiveIntensity = material.name === "Eyes" ? 2.4 : 0.55;
        material.userData.baseEmissive = material.emissive.getHex();
        material.userData.baseEmissiveIntensity = material.emissiveIntensity ?? 1;
        this.emissiveMaterials.add(material);
      });
    });

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.fromArray(config.muzzle);
    this.root.add(this.muzzle);
    this.playLoop(config.idle, 0);
  }

  findAction(fragment) {
    if (!fragment) return null;
    return [...this.actions.entries()].find(([name]) => name.includes(fragment)) ?? null;
  }

  playLoop(fragment, fade = 0.16) {
    if (this.dead) return;
    const found = this.findAction(fragment);
    if (!found || this.activeName === found[0]) return;
    const [name, next] = found;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.play();
    if (this.activeAction && fade > 0) {
      next.crossFadeFrom(this.activeAction, fade, true);
    } else if (this.activeAction) {
      this.activeAction.stop();
    }
    this.activeAction = next;
    this.activeName = name;
  }

  playOneShot(fragment, duration, fade = 0.06, lock = true) {
    const found = this.findAction(fragment);
    if (!found) return;
    const [name, action] = found;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(Math.max(0.01, action.getClip().duration / duration));
    action.play();
    if (this.activeAction) action.crossFadeFrom(this.activeAction, fade, true);
    this.activeAction = action;
    this.activeName = name;
    if (lock) this.lockTimer = duration;
  }

  update(delta, speed) {
    this.mixer.update(delta);
    this.lockTimer = Math.max(0, this.lockTimer - delta);
    this.flashTimer = Math.max(0, this.flashTimer - delta);

    this.emissiveMaterials.forEach((material) => {
      if (this.flashTimer > 0) {
        material.emissive.setHex(0xffffff);
        material.emissiveIntensity = 2.2;
      } else {
        material.emissive.setHex(material.userData.baseEmissive);
        material.emissiveIntensity = material.userData.baseEmissiveIntensity;
      }
    });

    if (this.dead || this.lockTimer > 0) return;
    this.playLoop(speed > 0.1 ? this.config.move : this.config.idle);
  }

  fire() {
    const duration = this.config === CREATURE_CONFIG.dragon ? 0.72 : 0.48;
    this.playOneShot(this.config.attack, duration);
  }

  flash() {
    this.flashTimer = 0.1;
    if (this.config.hit) this.playOneShot(this.config.hit, 0.28);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.playOneShot(this.config.death, this.config === CREATURE_CONFIG.dragon ? 1.2 : 0.55, 0.05, false);
  }
}
