import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CreatureRig, EnemyRig, PlayerRig } from "./Rigs.js";
import { SoundEngine } from "./Sound.js";
import { World } from "./World.js";

const PLAYER_RADIUS = 0.55;

const ENEMY_CONFIG = {
  skeletonRogue: {
    health: 3,
    speed: 1.8,
    minRange: 5.5,
    maxRange: 9.5,
    attackRange: 24,
    damage: 8,
    radius: 0.55,
    hitHeight: 1.3,
    hitRadius: 0.74,
    color: 0xff5478,
    label: "CHOIR SENTINEL",
  },
  skeletonMage: {
    health: 4,
    speed: 1.55,
    minRange: 7,
    maxRange: 12,
    attackRange: 28,
    damage: 10,
    radius: 0.58,
    hitHeight: 1.35,
    hitRadius: 0.76,
    color: 0xc95cff,
    label: "CHOIR HEXER",
  },
  slime: {
    health: 2,
    speed: 2.2,
    minRange: 3.6,
    maxRange: 6.2,
    attackRange: 15,
    damage: 7,
    radius: 0.78,
    hitHeight: 0.88,
    hitRadius: 0.82,
    color: 0x56f0b7,
    label: "SHARD SLIME",
  },
  dragon: {
    health: 10,
    speed: 1.42,
    minRange: 8,
    maxRange: 13.5,
    attackRange: 31,
    damage: 14,
    radius: 1.5,
    hitHeight: 1.85,
    hitRadius: 1.7,
    color: 0xff7a43,
    label: "THE HEARTWYRM",
    boss: true,
  },
};

class Enemy {
  constructor(scene, assets, position, archetype, index, zoneIndex) {
    const config = ENEMY_CONFIG[archetype];
    this.archetype = archetype;
    this.config = config;
    this.rig =
      archetype === "slime" || archetype === "dragon"
        ? new CreatureRig(assets, archetype)
        : new EnemyRig(assets, archetype, config.color);
    this.rig.root.position.copy(position);
    this.rig.root.userData.enemy = this;
    scene.add(this.rig.root);

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(config.radius * 1.08, config.radius * 1.28, 32),
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: config.boss ? 0.72 : 0.5,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.marker.position.y = 0.045;
    this.marker.rotation.x = -Math.PI / 2;
    this.rig.root.add(this.marker);

    this.threatIcon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: assets.getVfxTexture("star"),
        color: config.color,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const iconSize = config.boss ? 0.68 : 0.34;
    this.threatIcon.scale.setScalar(iconSize);
    this.threatIcon.position.y = config.hitHeight + config.hitRadius + 0.35;
    this.rig.root.add(this.threatIcon);

    this.readabilityLight = new THREE.PointLight(
      config.color,
      config.boss ? 7 : 2.4,
      config.boss ? 9 : 4.5,
      2,
    );
    this.readabilityLight.position.y = config.hitHeight;
    this.rig.root.add(this.readabilityLight);

    this.health = config.health;
    this.maxHealth = config.health;
    this.speed = config.speed;
    this.attackCooldown = 0.65 + Math.random() * 0.8;
    this.strafeDirection = index % 2 === 0 ? 1 : -1;
    this.alive = true;
    this.removeTimer = 0;
    this.index = index;
    this.zoneIndex = zoneIndex;
    this.home = position.clone();
    this.isBoss = Boolean(config.boss);
    this.killCredited = false;
  }

  getHitSphere() {
    return new THREE.Sphere(
      this.rig.root.position.clone().add(new THREE.Vector3(0, this.config.hitHeight, 0)),
      this.config.hitRadius,
    );
  }

  update(delta, playerPosition, world, peers, attack) {
    if (!this.alive) {
      this.removeTimer += delta;
      this.rig.update(delta, 0);
      return;
    }

    const playerOffset = playerPosition.clone().sub(this.rig.root.position);
    playerOffset.y = 0;
    const distance = playerOffset.length();
    const direction = distance > 0.001 ? playerOffset.clone().divideScalar(distance) : new THREE.Vector3();
    const playerCenter = playerPosition.clone().add(new THREE.Vector3(0, 1.15, 0));
    const muzzle = this.rig.muzzle.getWorldPosition(new THREE.Vector3());
    const lineOfSight = world.hasLineOfSight(muzzle, playerCenter);
    const homeDistance = this.rig.root.position.distanceTo(this.home);

    let move = new THREE.Vector3();
    if (homeDistance > 17.5 || distance > 31) {
      move.copy(this.home).sub(this.rig.root.position).setY(0).normalize();
    } else if (!lineOfSight || distance > this.config.maxRange) {
      move.copy(direction);
    } else if (distance < this.config.minRange) {
      move.copy(direction).multiplyScalar(-0.72);
    } else {
      move.set(-direction.z, 0, direction.x).multiplyScalar(this.strafeDirection * 0.42);
    }

    let movementSpeed = 0;
    if (move.lengthSq() > 0.001) {
      move.normalize();
      const previous = this.rig.root.position.clone();
      this.rig.root.position.addScaledVector(move, this.speed * delta);
      world.resolveCollision(this.rig.root.position, this.config.radius);
      movementSpeed = previous.distanceTo(this.rig.root.position) / Math.max(delta, 0.001);
    }

    for (const peer of peers) {
      if (peer === this || !peer.alive) continue;
      const separation = this.rig.root.position.clone().sub(peer.rig.root.position).setY(0);
      const minimum = this.config.radius + peer.config.radius;
      const separationLength = separation.length();
      if (separationLength > 0.001 && separationLength < minimum) {
        this.rig.root.position.addScaledVector(
          separation.divideScalar(separationLength),
          (minimum - separationLength) * 0.5,
        );
      }
    }
    world.resolveCollision(this.rig.root.position, this.config.radius);

    const aimYaw = Math.atan2(-direction.x, -direction.z);
    this.rig.root.rotation.y = THREE.MathUtils.lerp(
      this.rig.root.rotation.y,
      aimYaw,
      Math.min(1, delta * (this.isBoss ? 3.4 : 6)),
    );

    this.attackCooldown -= delta;
    if (
      this.attackCooldown <= 0 &&
      distance < this.config.attackRange &&
      lineOfSight
    ) {
      this.attackCooldown =
        (this.isBoss ? 1.35 : 1.15) + Math.random() * (this.isBoss ? 0.55 : 1);
      this.strafeDirection *= -1;
      this.rig.fire();
      attack(this);
    }

    this.rig.update(delta, movementSpeed);
  }

  damage(amount) {
    if (!this.alive) return false;
    this.health -= amount;
    this.rig.flash();
    if (this.health > 0) return false;

    this.health = 0;
    this.alive = false;
    this.marker.visible = false;
    this.threatIcon.visible = false;
    this.readabilityLight.intensity = 0;
    this.rig.die();
    return true;
  }
}

export class Game {
  constructor(container, assets) {
    this.container = container;
    this.assets = assets;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x779286, 0.0115);

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      220,
    );
    this.camera.position.set(6, 5, 42);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.86;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.world = new World(this.scene, assets);
    this.player = null;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,
      0.3,
      1.05,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.sound = new SoundEngine();
    this.raycaster = new THREE.Raycaster();
    this.cameraRaycaster = new THREE.Raycaster();
    this.effects = [];
    this.enemies = [];
    this.keys = new Set();
    this.input = { fire: false };
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.moveDirection = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.cameraDesired = new THREE.Vector3();

    this.dom = this.collectDom();
    this.minimapContext = this.dom.minimap.getContext("2d");
    this.started = false;
    this.paused = true;
    this.ended = false;
    this.notificationTimer = 0;
    this.locationTimer = 0;
    this.damageFlash = 0;
    this.damageCrosshairTimer = 0;
    this.hitMarker = 0;
    this.targetKills = this.world.zones.reduce(
      (total, zone) => total + zone.enemyTypes.length,
      0,
    );

    this.bindEvents();
    this.reset();
    this.updateCamera(1);
    this.updateHud();
  }

  setupLights() {
    const hemisphere = new THREE.HemisphereLight(0xd8f3e7, 0x4e443d, 1.55);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffddb0, 2.45);
    sun.position.set(-24, 38, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 48;
    sun.shadow.camera.bottom = -48;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 110;
    sun.shadow.bias = -0.00055;
    this.scene.add(sun);

    const coolRim = new THREE.DirectionalLight(0x69d9ff, 0.82);
    coolRim.position.set(22, 16, -36);
    this.scene.add(coolRim);

    const sanctumRim = new THREE.PointLight(0xaf4cff, 8, 34, 2);
    sanctumRim.position.set(0, 9, -30);
    this.scene.add(sanctumRim);
  }

  collectDom() {
    return {
      startScreen: document.querySelector("#start-screen"),
      startButton: document.querySelector("#start-button"),
      startDescription: document.querySelector("#start-description"),
      endScreen: document.querySelector("#end-screen"),
      restartButton: document.querySelector("#restart-button"),
      endEyebrow: document.querySelector("#end-eyebrow"),
      endTitle: document.querySelector("#end-title"),
      endCopy: document.querySelector("#end-copy"),
      objectiveCopy: document.querySelector("#objective-copy"),
      missionProgress: document.querySelector("#mission-progress"),
      missionCount: document.querySelector("#mission-count"),
      healthBar: document.querySelector("#health-bar"),
      healthCopy: document.querySelector("#health-copy"),
      shieldBar: document.querySelector("#shield-bar"),
      shieldCopy: document.querySelector("#shield-copy"),
      ammo: document.querySelector("#ammo"),
      reserveAmmo: document.querySelector("#reserve-ammo"),
      weaponState: document.querySelector("#weapon-state"),
      score: document.querySelector("#score"),
      shards: document.querySelector("#shards"),
      compassCardinal: document.querySelector("#compass-cardinal"),
      compassDegrees: document.querySelector("#compass-degrees"),
      minimap: document.querySelector("#minimap"),
      notification: document.querySelector("#notification"),
      crosshair: document.querySelector("#crosshair"),
      hitMarker: document.querySelector("#hit-marker"),
      damageFlash: document.querySelector("#damage-flash"),
      pulseCooldown: document.querySelector("#pulse-cooldown"),
      dashCooldown: document.querySelector("#dash-cooldown"),
      interactionPrompt: document.querySelector("#interaction-prompt"),
      locationCard: document.querySelector("#location-card"),
      locationName: document.querySelector("#location-name"),
      locationSubtitle: document.querySelector("#location-subtitle"),
      bossPanel: document.querySelector("#boss-panel"),
      bossHealth: document.querySelector("#boss-health"),
      bossHealthCopy: document.querySelector("#boss-health-copy"),
    };
  }

  bindEvents() {
    this.dom.startButton.addEventListener("click", () => this.start());
    this.dom.restartButton.addEventListener("click", () => {
      this.reset();
      this.start();
    });

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.input.fire = false;
    });

    document.addEventListener("keydown", (event) => {
      this.keys.add(event.code);
      if (event.code === "KeyR") this.startReload();
      if (event.code === "KeyQ") this.usePulse();
      if (event.code === "KeyE") this.interact();
      if (event.code === "Space") {
        event.preventDefault();
        this.startDash();
      }
    });
    document.addEventListener("keyup", (event) => this.keys.delete(event.code));
    document.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.renderer.domElement || this.ended) return;
      this.yaw -= event.movementX * 0.00225;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - event.movementY * 0.0019,
        -0.34,
        0.55,
      );
    });

    document.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || this.ended) return;
      if (document.pointerLockElement === this.renderer.domElement) {
        this.input.fire = true;
      }
    });
    document.addEventListener("mouseup", (event) => {
      if (event.button === 0) this.input.fire = false;
    });
    document.addEventListener("contextmenu", (event) => event.preventDefault());

    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      this.paused = !locked;
      this.input.fire = false;
      document.body.classList.toggle("game-paused", !locked);

      if (!locked && this.started && !this.ended) {
        this.dom.startDescription.textContent =
          "Field link paused. No simulation is advancing while you are away.";
        this.dom.startButton.querySelector("span").textContent = "RESUME CONTRACT";
        this.dom.startScreen.classList.add("overlay--visible");
      } else if (locked) {
        this.dom.startScreen.classList.remove("overlay--visible");
      }
    });
  }

  reset() {
    this.enemies.forEach((enemy) => this.scene.remove(enemy.rig.root));
    this.effects.forEach((effect) => this.removeEffect(effect));
    if (this.player) this.scene.remove(this.player.root);
    this.player = new PlayerRig(this.assets);
    this.scene.add(this.player.root);
    this.enemies = [];
    this.effects = [];

    this.player.root.position.set(0, 0, 37);
    this.player.root.rotation.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0.04;
    this.health = 100;
    this.shield = 60;
    this.ammo = 12;
    this.reserveAmmo = 72;
    this.score = 0;
    this.shards = 120;
    this.kills = 0;
    this.spawned = 0;
    this.currentZoneIndex = 0;
    this.pendingZoneIndex = null;
    this.zoneCleared = false;
    this.finalClear = false;
    this.interactionAvailable = false;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.reloadDuration = 1.15;
    this.pulseCooldown = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashDirection = new THREE.Vector3(0, 0, -1);
    this.shieldRechargeDelay = 0;
    this.damageCrosshairTimer = 0;
    this.ended = false;
    this.started = false;
    this.paused = true;
    this.input.fire = false;
    this.world.setHeartshardReady(false);
    document.body.classList.add("game-paused");
    this.clock.start();

    this.spawnZone(0, false);

    this.dom.endScreen.classList.remove("overlay--visible");
    this.dom.startScreen.classList.add("overlay--visible");
    this.dom.startDescription.textContent =
      "The Heartshard has poisoned Skywatch's garden and awakened the buried wardens. Mara Venn must cross three ruined districts, break the Hollow Choir, and reclaim the beacon from the Heartwyrm.";
    this.dom.startButton.querySelector("span").textContent = "ENTER SKYWATCH";
    this.dom.objectiveCopy.textContent =
      "Clear the Shardborn from the Sunken Courtyard.";
    this.dom.interactionPrompt.classList.remove("interaction--visible");
    this.dom.bossPanel.classList.remove("boss-panel--visible");
    this.updateHud();
  }

  start() {
    this.sound.unlock();
    this.started = true;
    this.ended = false;
    this.renderer.domElement.requestPointerLock();
  }

  spawnZone(zoneIndex, announce = true) {
    const zone = this.world.zones[zoneIndex];
    this.currentZoneIndex = zoneIndex;
    this.pendingZoneIndex = null;
    this.zoneCleared = false;
    this.world.objectivePosition.copy(zone.center);

    zone.enemyTypes.forEach((archetype, index) => {
      const point = zone.spawnPoints[index].clone();
      const enemy = new Enemy(
        this.scene,
        this.assets,
        point,
        archetype,
        this.spawned,
        zoneIndex,
      );
      this.enemies.push(enemy);
      this.spawned += 1;
      this.createSpawnEffect(point.clone().add(new THREE.Vector3(0, 1, 0)), enemy.config.color);
    });

    if (announce) {
      this.showLocation(zone.name, zone.subtitle);
      this.showNotification("HOSTILES AWAKENED", `${zone.enemyTypes.length} signatures`);
    }
    this.updateObjectiveCopy();
  }

  run() {
    this.renderer.setAnimationLoop(() => {
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const simulationActive = !this.paused && this.started && !this.ended;

      if (simulationActive) {
        this.update(delta);
        this.updateCamera(delta);
        this.world.update(this.camera.position, delta);
      } else {
        this.updateCamera(0);
        this.world.update(this.camera.position, 0);
      }

      this.composer.render();
    });
  }

  update(delta) {
    this.fireCooldown = Math.max(0, this.fireCooldown - delta);
    this.pulseCooldown = Math.max(0, this.pulseCooldown - delta);
    this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    this.shieldRechargeDelay = Math.max(0, this.shieldRechargeDelay - delta);
    this.damageFlash = Math.max(0, this.damageFlash - delta * 2.6);
    this.damageCrosshairTimer = Math.max(0, this.damageCrosshairTimer - delta);
    this.hitMarker = Math.max(0, this.hitMarker - delta * 7);
    this.notificationTimer = Math.max(0, this.notificationTimer - delta);
    this.locationTimer = Math.max(0, this.locationTimer - delta);

    if (this.shieldRechargeDelay <= 0 && this.shield < 60) {
      this.shield = Math.min(60, this.shield + delta * 8);
    }

    this.forward.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));

    const horizontal = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    const vertical = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
    this.moveDirection.set(0, 0, 0);
    this.moveDirection.addScaledVector(this.forward, vertical);
    this.moveDirection.addScaledVector(this.right, horizontal);
    if (this.moveDirection.lengthSq() > 1) this.moveDirection.normalize();

    let speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 6.6 : 3.9;
    if (this.dashTimer > 0) {
      this.dashTimer -= delta;
      speed = 17;
      this.moveDirection.copy(this.dashDirection);
    }

    this.player.root.position.addScaledVector(this.moveDirection, speed * delta);
    this.world.resolveCollision(this.player.root.position, PLAYER_RADIUS);
    this.player.root.rotation.y = -this.yaw;

    if (this.reloadTimer > 0) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) this.finishReload();
    } else if (this.input.fire && this.fireCooldown <= 0) {
      this.shoot();
    }

    this.player.update({
      delta,
      movement: this.moveDirection.length() * speed,
      speed,
      aimPitch: this.pitch,
      firing: this.input.fire,
    });

    for (const enemy of this.enemies) {
      enemy.update(
        delta,
        this.player.root.position,
        this.world,
        this.enemies,
        (attacker) => this.enemyAttack(attacker),
      );
    }

    this.enemies = this.enemies.filter((enemy) => {
      const removalDelay = enemy.isBoss ? 1.35 : 1.05;
      if (!enemy.alive && enemy.removeTimer > removalDelay) {
        this.scene.remove(enemy.rig.root);
        return false;
      }
      return true;
    });

    this.updateMissionFlow();
    this.updateEffects(delta);
    this.updateHud();
  }

  updateMissionFlow() {
    const activeEnemies = this.enemies.filter(
      (enemy) => enemy.alive && enemy.zoneIndex === this.currentZoneIndex,
    );

    if (!this.zoneCleared && activeEnemies.length === 0) {
      this.zoneCleared = true;
      if (this.currentZoneIndex < this.world.zones.length - 1) {
        this.pendingZoneIndex = this.currentZoneIndex + 1;
        const next = this.world.zones[this.pendingZoneIndex];
        this.world.objectivePosition.copy(next.center);
        this.showNotification("PATH OPEN", `Advance to ${next.name}`);
      } else {
        this.finalClear = true;
        this.world.objectivePosition.set(0, 0, -30.8);
        this.world.setHeartshardReady(true);
        this.showNotification("HEARTWYRM BROKEN", "Reclaim the Heartshard");
      }
      this.updateObjectiveCopy();
    }

    if (this.pendingZoneIndex !== null) {
      const next = this.world.zones[this.pendingZoneIndex];
      if (this.player.root.position.distanceTo(next.center) <= next.triggerRadius) {
        this.spawnZone(this.pendingZoneIndex);
      }
    }

    this.interactionAvailable =
      this.finalClear &&
      this.player.root.position.distanceTo(this.world.objectivePosition) < 3.4;
  }

  updateObjectiveCopy() {
    if (this.finalClear) {
      this.dom.objectiveCopy.textContent =
        "Approach the Heartshard and press E to stabilize the beacon.";
      return;
    }
    if (this.pendingZoneIndex !== null) {
      const next = this.world.zones[this.pendingZoneIndex];
      this.dom.objectiveCopy.textContent = `Follow the gold path to ${next.name}.`;
      return;
    }

    const zone = this.world.zones[this.currentZoneIndex];
    const remaining = this.enemies.filter(
      (enemy) => enemy.alive && enemy.zoneIndex === this.currentZoneIndex,
    ).length;
    this.dom.objectiveCopy.textContent = `Clear ${zone.name}: ${remaining} hostile${
      remaining === 1 ? "" : "s"
    } remain.`;
  }

  interact() {
    if (this.paused || this.ended || !this.interactionAvailable) return;
    this.completeMission();
  }

  shoot() {
    if (this.ammo <= 0) {
      this.startReload();
      return;
    }

    this.ammo -= 1;
    this.fireCooldown = 0.12;
    this.player.shoot();
    this.sound.shoot();

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const ray = this.raycaster.ray;
    const worldHit = this.raycaster.intersectObjects(this.world.shootables, false)[0];
    let hitDistance = worldHit?.distance ?? 72;
    let hitPoint = ray.at(hitDistance, new THREE.Vector3());
    let hitEnemy = null;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const point = ray.intersectSphere(enemy.getHitSphere(), new THREE.Vector3());
      if (!point) continue;
      const distance = point.distanceTo(ray.origin);
      if (distance < hitDistance) {
        hitDistance = distance;
        hitPoint = point;
        hitEnemy = enemy;
      }
    }

    const muzzle = this.player.muzzle.getWorldPosition(new THREE.Vector3());
    this.createTracer(muzzle, hitPoint, 0x8ef8ff, 0.11);
    this.createMuzzleFlash(muzzle, 0x8ef8ff);
    this.createImpact(hitPoint, hitEnemy ? hitEnemy.config.color : 0xffc785, hitEnemy ? 9 : 5);

    if (!hitEnemy && hitPoint.y < 0.38) this.createScorch(hitPoint);

    if (hitEnemy) {
      const killed = hitEnemy.damage(1);
      if (killed) {
        this.registerKill(hitEnemy);
      } else {
        this.score += hitEnemy.isBoss ? 140 : 90;
        this.shards += 1;
      }
      this.hitMarker = 1;
      this.sound.hit();
    }

    if (this.ammo === 0 && this.reserveAmmo > 0) {
      this.showNotification("BOLT RACK EMPTY", "Press R to reload");
    }
    this.updateObjectiveCopy();
  }

  registerKill(enemy) {
    if (enemy.killCredited) return;
    enemy.killCredited = true;
    this.kills += 1;
    this.score += enemy.isBoss ? 2200 : 550;
    this.shards += enemy.isBoss ? 24 : 8;
    this.createDeathEffect(
      enemy.rig.root.position.clone().add(new THREE.Vector3(0, enemy.config.hitHeight, 0)),
      enemy.config.color,
      enemy.isBoss,
    );
    this.showNotification(
      enemy.isBoss ? "HEARTWYRM BROKEN" : `${enemy.config.label} BROKEN`,
      `+${enemy.isBoss ? 2200 : 550} · ${this.kills}/${this.targetKills}`,
    );
  }

  enemyAttack(enemy) {
    if (!enemy.alive || this.ended) return;
    const muzzle = enemy.rig.muzzle.getWorldPosition(new THREE.Vector3());
    const target = this.player.root.position
      .clone()
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.35, 1.15, 0));
    const distance = muzzle.distanceTo(target);
    const missChance = enemy.isBoss ? 0.13 : Math.min(0.3, distance / 85);
    const missed = Math.random() < missChance;
    if (missed) {
      target.x += (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 1.5);
      target.z += (Math.random() - 0.5) * 1.2;
    }

    this.createEnemyProjectile(enemy, muzzle, target, missed);
    this.createMuzzleFlash(muzzle, enemy.config.color);
    this.sound.enemyShot();
  }

  createEnemyProjectile(enemy, start, end, missed) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.assets.getVfxTexture("magic"),
        color: enemy.config.color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const size = enemy.isBoss ? 1.15 : enemy.archetype === "slime" ? 0.72 : 0.55;
    sprite.scale.setScalar(size);
    sprite.position.copy(start);
    this.scene.add(sprite);

    const duration = THREE.MathUtils.clamp(
      start.distanceTo(end) / (enemy.isBoss ? 15 : 19),
      0.24,
      1.35,
    );
    this.effects.push({
      kind: "projectile",
      object: sprite,
      start: start.clone(),
      end: end.clone(),
      ttl: duration,
      maxTtl: duration,
      damage: enemy.config.damage,
      color: enemy.config.color,
      missed,
      size,
    });
  }

  takeDamage(amount) {
    this.shieldRechargeDelay = 3.6;
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) this.health = Math.max(0, this.health - remaining);

    this.damageFlash = 1;
    this.damageCrosshairTimer = 0.12;
    this.sound.damage();
    if (this.health <= 0) this.failMission();
  }

  startReload() {
    if (
      this.reloadTimer > 0 ||
      this.ammo >= 12 ||
      this.reserveAmmo <= 0 ||
      this.ended
    ) {
      return;
    }
    this.reloadTimer = this.reloadDuration;
    this.input.fire = false;
    this.player.reload(this.reloadDuration);
    this.sound.reload();
  }

  finishReload() {
    const required = 12 - this.ammo;
    const loaded = Math.min(required, this.reserveAmmo);
    this.ammo += loaded;
    this.reserveAmmo -= loaded;
  }

  startDash() {
    if (this.paused || this.dashCooldown > 0 || this.ended) return;
    this.dashCooldown = 2.4;
    this.dashTimer = 0.18;
    this.dashDirection.copy(
      this.moveDirection.lengthSq() > 0.01 ? this.moveDirection : this.forward,
    );
    this.dashDirection.normalize();
    this.createDashTrail();
  }

  usePulse() {
    if (this.paused || this.pulseCooldown > 0 || this.ended) return;
    this.pulseCooldown = 8;
    this.player.pulse();
    this.sound.pulse();

    const position = this.player.root.position.clone().add(new THREE.Vector3(0, 0.12, 0));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1, 64),
      new THREE.MeshBasicMaterial({
        map: this.assets.getVfxTexture("ring"),
        color: 0xc45cff,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.effects.push({
      kind: "ring",
      object: ring,
      ttl: 0.75,
      maxTtl: 0.75,
      baseOpacity: 0.92,
    });
    this.createSpriteEffect("flare", position.clone().add(new THREE.Vector3(0, 1, 0)), {
      color: 0xd76cff,
      startScale: 1.4,
      endScale: 5.5,
      ttl: 0.58,
      opacity: 0.85,
    });

    let hits = 0;
    for (const enemy of this.enemies) {
      if (
        !enemy.alive ||
        enemy.rig.root.position.distanceTo(this.player.root.position) > 8
      ) {
        continue;
      }
      hits += 1;
      const killed = enemy.damage(2);
      const direction = enemy.rig.root.position
        .clone()
        .sub(this.player.root.position)
        .setY(0)
        .normalize();
      enemy.rig.root.position.addScaledVector(direction, enemy.isBoss ? 0.45 : 1.2);
      this.world.resolveCollision(enemy.rig.root.position, enemy.config.radius);
      this.createImpact(
        enemy.rig.root.position.clone().add(new THREE.Vector3(0, enemy.config.hitHeight, 0)),
        0xc45cff,
        enemy.isBoss ? 14 : 10,
      );
      if (killed) {
        this.registerKill(enemy);
      } else {
        this.score += enemy.isBoss ? 220 : 150;
      }
    }

    this.showNotification(
      "SHARD PULSE",
      hits > 0 ? `${hits} targets disrupted` : "No targets in range",
    );
    this.updateObjectiveCopy();
  }

  createTracer(start, end, color, ttl) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.effects.push({
      kind: "fade",
      object: line,
      ttl,
      maxTtl: ttl,
      baseOpacity: 0.92,
    });
  }

  createSpriteEffect(textureKey, position, options = {}) {
    const material = new THREE.SpriteMaterial({
      map: this.assets.getVfxTexture(textureKey),
      color: options.color ?? 0xffffff,
      transparent: true,
      opacity: options.opacity ?? 1,
      blending: options.blending ?? THREE.AdditiveBlending,
      depthWrite: false,
      rotation: options.rotation ?? Math.random() * Math.PI,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    const startScale = options.startScale ?? 0.5;
    sprite.scale.setScalar(startScale);
    this.scene.add(sprite);
    const ttl = options.ttl ?? 0.35;
    this.effects.push({
      kind: options.kind ?? "sprite",
      object: sprite,
      ttl,
      maxTtl: ttl,
      startScale,
      endScale: options.endScale ?? startScale * 2,
      baseOpacity: options.opacity ?? 1,
      velocity: options.velocity,
    });
    return sprite;
  }

  createMuzzleFlash(position, color) {
    this.createSpriteEffect("muzzle", position, {
      color,
      startScale: 0.22,
      endScale: 0.86,
      ttl: 0.09,
      opacity: 1,
    });
    this.createSpriteEffect("flare", position, {
      color,
      startScale: 0.16,
      endScale: 0.52,
      ttl: 0.075,
      opacity: 0.82,
    });
  }

  createImpact(position, color, count) {
    this.createSpriteEffect("spark", position, {
      color,
      startScale: 0.35,
      endScale: 1.45,
      ttl: 0.28,
      opacity: 0.98,
    });
    this.createSpriteEffect("star", position, {
      color: 0xffffff,
      startScale: 0.18,
      endScale: 0.82,
      ttl: 0.2,
      opacity: 0.9,
    });

    for (let index = 0; index < count; index += 1) {
      const ttl = 0.4 + Math.random() * 0.26;
      const particle = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.035 + Math.random() * 0.055),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      particle.position.copy(position);
      this.scene.add(particle);
      this.effects.push({
        kind: "particle",
        object: particle,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4.4,
          1 + Math.random() * 3.2,
          (Math.random() - 0.5) * 4.4,
        ),
        ttl,
        maxTtl: ttl,
        baseOpacity: 1,
      });
    }
  }

  createDeathEffect(position, color, boss = false) {
    this.createSpriteEffect("magic", position, {
      color,
      startScale: boss ? 1.6 : 0.8,
      endScale: boss ? 6.8 : 3.2,
      ttl: boss ? 0.9 : 0.58,
      opacity: 0.94,
    });
    const smokeCount = boss ? 8 : 3;
    for (let index = 0; index < smokeCount; index += 1) {
      this.createSpriteEffect("smoke", position.clone(), {
        color: boss ? 0x713e82 : 0x526b68,
        startScale: boss ? 1.2 : 0.55,
        endScale: boss ? 4.5 : 2,
        ttl: 0.65 + Math.random() * 0.45,
        opacity: 0.48,
        blending: THREE.NormalBlending,
        kind: "smoke",
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.55,
          0.45 + Math.random() * 0.55,
          (Math.random() - 0.5) * 0.55,
        ),
      });
    }
  }

  createSpawnEffect(position, color) {
    this.createSpriteEffect("magic", position, {
      color,
      startScale: 0.4,
      endScale: 2.8,
      ttl: 0.72,
      opacity: 0.72,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.58, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.position.copy(position).setY(0.08);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.effects.push({
      kind: "ring",
      object: ring,
      ttl: 0.72,
      maxTtl: 0.72,
      baseOpacity: 0.75,
    });
  }

  createScorch(position) {
    const material = new THREE.MeshBasicMaterial({
      map: this.assets.getVfxTexture("scorch"),
      color: 0x382b35,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), material);
    decal.position.copy(position);
    decal.position.y = Math.max(0.035, decal.position.y + 0.02);
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = Math.random() * Math.PI;
    this.scene.add(decal);
    this.effects.push({
      kind: "decal",
      object: decal,
      ttl: 4,
      maxTtl: 4,
      baseOpacity: 0.52,
    });
  }

  createDashTrail() {
    for (let index = 0; index < 5; index += 1) {
      const position = this.player.root.position
        .clone()
        .add(new THREE.Vector3(0, 1 + index * 0.05, 0))
        .addScaledVector(this.dashDirection, -index * 0.34);
      this.createSpriteEffect("flare", position, {
        color: 0x7cecff,
        startScale: 0.48 - index * 0.045,
        endScale: 1.2,
        ttl: 0.3,
        opacity: 0.42 - index * 0.05,
      });
    }
  }

  updateEffects(delta) {
    const active = [];
    const projectileImpacts = [];

    for (const effect of this.effects) {
      effect.ttl -= delta;
      const progress = 1 - Math.max(0, effect.ttl) / effect.maxTtl;

      if (effect.kind === "particle") {
        effect.velocity.y -= 7.5 * delta;
        effect.object.position.addScaledVector(effect.velocity, delta);
        effect.object.rotation.x += delta * 8;
        effect.object.rotation.y += delta * 6;
      } else if (effect.kind === "ring") {
        effect.object.scale.setScalar(1 + progress * 9);
        effect.object.rotation.z += delta * 1.8;
      } else if (effect.kind === "sprite") {
        effect.object.scale.setScalar(
          THREE.MathUtils.lerp(effect.startScale, effect.endScale, progress),
        );
        effect.object.material.rotation += delta * 2.4;
      } else if (effect.kind === "smoke") {
        effect.object.scale.setScalar(
          THREE.MathUtils.lerp(effect.startScale, effect.endScale, progress),
        );
        effect.object.position.addScaledVector(effect.velocity, delta);
        effect.object.material.rotation += delta * 0.35;
      } else if (effect.kind === "projectile") {
        effect.object.position.lerpVectors(effect.start, effect.end, progress);
        effect.object.scale.setScalar(
          effect.size * (0.86 + Math.sin(progress * Math.PI * 8) * 0.14),
        );
        effect.object.material.rotation += delta * 4;
      }

      if (effect.object.material) {
        let opacityFactor = Math.max(0, effect.ttl / effect.maxTtl);
        if (effect.kind === "decal") {
          opacityFactor = effect.ttl > 1 ? 1 : Math.max(0, effect.ttl);
        }
        effect.object.material.opacity = effect.baseOpacity ?? opacityFactor;
        effect.object.material.opacity *= opacityFactor;
      }

      if (effect.ttl <= 0) {
        if (effect.kind === "projectile") projectileImpacts.push(effect);
        this.removeEffect(effect);
      } else {
        active.push(effect);
      }
    }

    this.effects = active;
    projectileImpacts.forEach((effect) => {
      this.createImpact(effect.end, effect.color, effect.damage >= 14 ? 12 : 7);
      const playerCenter = this.player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      if (!effect.missed && playerCenter.distanceTo(effect.end) < 1.45) {
        this.takeDamage(effect.damage);
      }
    });
  }

  removeEffect(effect) {
    this.scene.remove(effect.object);
    effect.object.geometry?.dispose();
    effect.object.material?.dispose();
  }

  updateCamera(delta) {
    this.forward.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.cameraTarget.copy(this.player.root.position).add(new THREE.Vector3(0, 1.45, 0));
    this.cameraDesired
      .copy(this.cameraTarget)
      .addScaledVector(this.forward, -5.8)
      .addScaledVector(this.right, 1.25);
    this.cameraDesired.y += 2.05 + this.pitch * 1.8;

    let safePosition = this.world.resolveCameraPosition(
      this.cameraTarget,
      this.cameraDesired,
    );
    const cameraDirection = safePosition.clone().sub(this.cameraTarget);
    const cameraDistance = cameraDirection.length();
    if (cameraDistance > 0.2) {
      cameraDirection.divideScalar(cameraDistance);
      this.cameraRaycaster.set(this.cameraTarget, cameraDirection);
      const obstruction = this.cameraRaycaster
        .intersectObjects(this.world.shootables, false)
        .find((hit) => hit.distance > 0.18 && hit.distance < cameraDistance);
      if (obstruction) {
        safePosition = this.cameraTarget
          .clone()
          .addScaledVector(cameraDirection, Math.max(0.22, obstruction.distance - 0.22));
      }
    }
    const cameraBlend = delta <= 0 ? 1 : 1 - Math.exp(-delta * 10);
    this.camera.position.lerp(safePosition, cameraBlend);

    this.cameraLook
      .copy(this.cameraTarget)
      .addScaledVector(this.forward, 12)
      .add(new THREE.Vector3(0, this.pitch * 9, 0));
    this.camera.lookAt(this.cameraLook);
  }

  updateHud() {
    this.dom.healthBar.style.width = `${this.health}%`;
    this.dom.shieldBar.style.width = `${(this.shield / 60) * 100}%`;
    this.dom.healthCopy.textContent = Math.ceil(this.health);
    this.dom.shieldCopy.textContent = Math.ceil(this.shield);
    this.dom.ammo.textContent = String(this.ammo).padStart(2, "0");
    this.dom.reserveAmmo.textContent = String(this.reserveAmmo).padStart(2, "0");
    this.dom.score.textContent = String(this.score).padStart(4, "0");
    this.dom.shards.textContent = this.shards;
    this.dom.missionCount.textContent = `${this.kills} / ${this.targetKills}`;
    this.dom.missionProgress.style.width = `${(this.kills / this.targetKills) * 100}%`;
    this.dom.weaponState.textContent =
      this.reloadTimer > 0
        ? "RELOADING..."
        : this.ammo === 0
          ? "BOLT RACK EMPTY"
          : "SUNSPIKE / AUTO";

    const heading = ((THREE.MathUtils.radToDeg(this.yaw) % 360) + 360) % 360;
    const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    this.dom.compassCardinal.textContent = cardinals[Math.round(heading / 45) % 8];
    this.dom.compassDegrees.textContent = `${String(Math.round(heading)).padStart(3, "0")}°`;
    this.dom.damageFlash.style.opacity = String(this.damageFlash * 0.72);
    this.dom.hitMarker.style.opacity = String(this.hitMarker);
    this.dom.hitMarker.style.transform = `translate(-50%, -50%) scale(${
      0.75 + this.hitMarker * 0.45
    })`;
    this.dom.notification.classList.toggle(
      "notification--visible",
      this.notificationTimer > 0,
    );
    this.dom.locationCard.classList.toggle(
      "location-card--visible",
      this.locationTimer > 0,
    );
    this.dom.crosshair.classList.toggle(
      "crosshair--damage",
      this.damageCrosshairTimer > 0,
    );
    this.dom.interactionPrompt.classList.toggle(
      "interaction--visible",
      this.interactionAvailable,
    );

    const boss = this.enemies.find((enemy) => enemy.isBoss && enemy.alive);
    this.dom.bossPanel.classList.toggle("boss-panel--visible", Boolean(boss));
    if (boss) {
      const percentage = (boss.health / boss.maxHealth) * 100;
      this.dom.bossHealth.style.width = `${percentage}%`;
      this.dom.bossHealthCopy.textContent = `${boss.health} / ${boss.maxHealth}`;
    }

    const spread =
      1 + Math.min(1, this.moveDirection.length()) * 0.38 + (this.input.fire ? 0.2 : 0);
    this.dom.crosshair.style.setProperty("--spread", `${spread}`);
    this.dom.pulseCooldown.style.transform = `scaleY(${Math.min(
      1,
      this.pulseCooldown / 8,
    )})`;
    this.dom.dashCooldown.style.transform = `scaleY(${Math.min(
      1,
      this.dashCooldown / 2.4,
    )})`;
    this.drawMinimap();
  }

  drawMinimap() {
    const context = this.minimapContext;
    const size = this.dom.minimap.width;
    const center = size / 2;
    const scale = 1.65;
    context.clearRect(0, 0, size, size);

    const gradient = context.createRadialGradient(center, center, 2, center, center, center);
    gradient.addColorStop(0, "rgba(37, 63, 59, 0.9)");
    gradient.addColorStop(1, "rgba(12, 25, 31, 0.97)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, center - 4, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.beginPath();
    context.arc(center, center, center - 8, 0, Math.PI * 2);
    context.clip();
    context.translate(center, center);
    context.rotate(this.yaw);

    context.strokeStyle = "rgba(225, 220, 196, 0.13)";
    context.lineWidth = 1;
    for (let ring = 20; ring <= 60; ring += 20) {
      context.beginPath();
      context.arc(0, 0, ring, 0, Math.PI * 2);
      context.stroke();
    }

    context.strokeStyle = "rgba(220, 190, 107, 0.55)";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(
      (0 - this.player.root.position.x) * scale,
      (37 - this.player.root.position.z) * scale,
    );
    context.lineTo(
      (0 - this.player.root.position.x) * scale,
      (-31 - this.player.root.position.z) * scale,
    );
    context.stroke();

    const objective = this.world.objectivePosition.clone().sub(this.player.root.position);
    context.fillStyle = this.finalClear ? "#f8d45c" : "#c25cff";
    context.save();
    context.translate(objective.x * scale, objective.z * scale);
    context.rotate(Math.PI / 4);
    context.fillRect(-4, -4, 8, 8);
    context.restore();

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const offset = enemy.rig.root.position.clone().sub(this.player.root.position);
      if (Math.hypot(offset.x, offset.z) > 45) continue;
      context.fillStyle = enemy.isBoss ? "#ff9d4f" : "#ff5b74";
      context.beginPath();
      context.arc(
        offset.x * scale,
        offset.z * scale,
        enemy.isBoss ? 5.2 : 3.3,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    context.restore();
    context.save();
    context.translate(center, center);
    context.fillStyle = "#8ef8ff";
    context.beginPath();
    context.moveTo(0, -8);
    context.lineTo(6, 7);
    context.lineTo(0, 4);
    context.lineTo(-6, 7);
    context.closePath();
    context.fill();
    context.restore();
  }

  showNotification(title, detail) {
    this.dom.notification.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    this.notificationTimer = 2.1;
  }

  showLocation(name, subtitle) {
    this.dom.locationName.textContent = name;
    this.dom.locationSubtitle.textContent = subtitle;
    this.locationTimer = 3.2;
  }

  completeMission() {
    if (this.ended) return;
    this.ended = true;
    this.paused = true;
    this.input.fire = false;
    this.interactionAvailable = false;
    this.dom.objectiveCopy.textContent =
      "The Heartshard is stable. Skywatch's garden can live again.";
    this.dom.endEyebrow.textContent = "CONTRACT COMPLETE";
    this.dom.endTitle.innerHTML = "HEARTSHARD<br /><em>RECLAIMED</em>";
    this.dom.endCopy.textContent = `${this.kills} Shardborn broken · ${this.score} field score`;
    this.dom.endScreen.classList.add("overlay--visible");
    this.sound.complete();
    document.exitPointerLock?.();
  }

  failMission() {
    if (this.ended) return;
    this.ended = true;
    this.paused = true;
    this.input.fire = false;
    this.dom.endEyebrow.textContent = "CONTRACT FAILED";
    this.dom.endTitle.innerHTML = "SIGNAL<br /><em>LOST</em>";
    this.dom.endCopy.textContent = `${this.kills} of ${this.targetKills} Shardborn broken`;
    this.dom.endScreen.classList.add("overlay--visible");
    document.exitPointerLock?.();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 1.65);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }
}
