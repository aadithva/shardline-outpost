import * as THREE from "three";

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function prepare(mesh, castShadow = true) {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function rotateLocalToWorld(x, z, rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return new THREE.Vector2(
    x * cosine + z * sine,
    -x * sine + z * cosine,
  );
}

export class World {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.colliders = [];
    this.shootables = [];
    this.random = seededRandom(4187);
    this.bounds = 47;
    this.elapsed = 0;
    this.objectivePosition = new THREE.Vector3(0, 0, 16);
    this.heartshardReady = false;

    this.materials = {
      earth: new THREE.MeshStandardMaterial({
        color: 0x6d8a67,
        roughness: 1,
        flatShading: true,
      }),
      meadow: new THREE.MeshStandardMaterial({
        color: 0x8ca56f,
        roughness: 1,
        flatShading: true,
      }),
      path: new THREE.MeshStandardMaterial({
        color: 0xb99a61,
        roughness: 1,
        flatShading: true,
      }),
      stone: new THREE.MeshStandardMaterial({
        color: 0x899385,
        roughness: 0.95,
        flatShading: true,
      }),
      paleStone: new THREE.MeshStandardMaterial({
        color: 0xa79d79,
        roughness: 0.92,
        flatShading: true,
      }),
      darkStone: new THREE.MeshStandardMaterial({
        color: 0x40545a,
        roughness: 0.94,
        flatShading: true,
      }),
      water: new THREE.MeshStandardMaterial({
        color: 0x174b59,
        emissive: 0x082d3b,
        emissiveIntensity: 0.65,
        roughness: 0.28,
        metalness: 0.16,
        transparent: true,
        opacity: 0.92,
      }),
      corruption: new THREE.MeshStandardMaterial({
        color: 0x273d3b,
        emissive: 0x261449,
        emissiveIntensity: 0.34,
        roughness: 0.9,
        flatShading: true,
      }),
      crystal: new THREE.MeshStandardMaterial({
        color: 0xc65cff,
        emissive: 0x711ac9,
        emissiveIntensity: 2.1,
        roughness: 0.22,
        metalness: 0.18,
        flatShading: true,
      }),
      crystalBlue: new THREE.MeshStandardMaterial({
        color: 0x55e6ff,
        emissive: 0x087999,
        emissiveIntensity: 1.8,
        roughness: 0.24,
        metalness: 0.16,
        flatShading: true,
      }),
      crystalDark: new THREE.MeshStandardMaterial({
        color: 0x46235f,
        emissive: 0x260b44,
        emissiveIntensity: 0.9,
        roughness: 0.45,
        flatShading: true,
      }),
    };

    this.group = new THREE.Group();
    scene.add(this.group);

    this.zones = [
      {
        id: "courtyard",
        name: "SUNKEN COURTYARD",
        subtitle: "The garden remembers",
        center: new THREE.Vector3(0, 0, 16),
        triggerRadius: 18,
        enemyTypes: ["slime", "slime", "skeletonRogue"],
        spawnPoints: [
          new THREE.Vector3(-7.5, 0, 18.5),
          new THREE.Vector3(7.2, 0, 15),
          new THREE.Vector3(0, 0, 7.5),
        ],
      },
      {
        id: "causeway",
        name: "BROKEN CAUSEWAY",
        subtitle: "The Choir holds the crossing",
        center: new THREE.Vector3(0, 0, -5),
        triggerRadius: 11.5,
        enemyTypes: ["skeletonRogue", "skeletonMage", "skeletonRogue"],
        spawnPoints: [
          new THREE.Vector3(-5.8, 0, -2),
          new THREE.Vector3(5.4, 0, -6.5),
          new THREE.Vector3(0, 0, -12.5),
        ],
      },
      {
        id: "sanctum",
        name: "HEARTSHARD SANCTUM",
        subtitle: "The Heartwyrm wakes",
        center: new THREE.Vector3(0, 0, -28),
        triggerRadius: 12.5,
        enemyTypes: ["skeletonMage", "dragon"],
        spawnPoints: [
          new THREE.Vector3(-6.8, 0, -27),
          new THREE.Vector3(4.8, 0.05, -34),
        ],
      },
    ];
    this.spawnPoints = this.zones.flatMap((zone) => zone.spawnPoints);

    this.buildSky();
    this.buildGround();
    this.buildSunkenCourtyard();
    this.buildCauseway();
    this.buildSanctum();
    this.buildNature();
    this.buildScenery();
    this.buildAmbientMotes();
  }

  buildSky() {
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4c8499) },
        middleColor: { value: new THREE.Color(0xb6d1bc) },
        bottomColor: { value: new THREE.Color(0xf0b46f) },
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        uniform vec3 topColor;
        uniform vec3 middleColor;
        uniform vec3 bottomColor;
        void main() {
          float height = normalize(vPosition).y;
          vec3 lower = mix(bottomColor, middleColor, smoothstep(-0.3, 0.2, height));
          vec3 color = mix(lower, topColor, smoothstep(0.03, 0.84, height));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 18), skyMaterial);
    this.scene.add(this.sky);

    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffe0a0,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    sun.position.set(-46, 41, -82);
    sun.lookAt(0, 10, 0);
    this.scene.add(sun);
  }

  buildGround() {
    const ground = prepare(
      new THREE.Mesh(new THREE.CircleGeometry(58, 72), this.materials.earth),
      false,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.name = "GardenGround";
    this.group.add(ground);
    this.shootables.push(ground);

    this.addGroundPatch(0, 18, 19, 15, this.materials.meadow, 0);
    this.addGroundPatch(0, -5, 10.5, 18, this.materials.path, 0);
    this.addGroundPatch(0, -29, 15, 14, this.materials.corruption, 0);

    const road = prepare(
      new THREE.Mesh(new THREE.PlaneGeometry(6.4, 68, 1, 1), this.materials.path),
      false,
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.018, 2);
    this.group.add(road);
    this.shootables.push(road);

    for (let index = 0; index < 14; index += 1) {
      const stone = this.assets.cloneNature("steppingStone");
      stone.position.set(
        (this.random() - 0.5) * 2.2,
        0.035,
        35 - index * 4.65,
      );
      stone.rotation.y = this.random() * Math.PI;
      stone.scale.setScalar(1.2 + this.random() * 0.65);
      this.group.add(stone);
    }
  }

  addGroundPatch(x, z, width, depth, material, rotation) {
    const patch = prepare(
      new THREE.Mesh(new THREE.CircleGeometry(1, 48), material),
      false,
    );
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rotation;
    patch.position.set(x, 0.012, z);
    patch.scale.set(width, depth, 1);
    this.group.add(patch);
    this.shootables.push(patch);
    return patch;
  }

  buildSunkenCourtyard() {
    const centerZ = 16;
    const ring = prepare(
      new THREE.Mesh(new THREE.RingGeometry(4.6, 8.15, 64, 3), this.materials.paleStone),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.09, centerZ);
    this.group.add(ring);
    this.shootables.push(ring);

    const innerRing = prepare(
      new THREE.Mesh(new THREE.RingGeometry(4.15, 4.72, 48), this.materials.darkStone),
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.set(0, 0.11, centerZ);
    this.group.add(innerRing);
    this.shootables.push(innerRing);

    const pool = prepare(
      new THREE.Mesh(new THREE.CircleGeometry(4.15, 48), this.materials.water),
      false,
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.025, centerZ);
    this.group.add(pool);
    this.shootables.push(pool);
    this.addCircleCollider(0, centerZ, 4.25);

    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2;
      const radius = 6.35;
      const block = prepare(
        new THREE.Mesh(
          new THREE.BoxGeometry(1.45, 0.24 + (index % 3) * 0.05, 1.65),
          index % 4 === 0 ? this.materials.stone : this.materials.paleStone,
        ),
      );
      block.position.set(
        Math.sin(angle) * radius,
        0.18,
        centerZ + Math.cos(angle) * radius,
      );
      block.rotation.y = angle;
      this.group.add(block);
      this.shootables.push(block);
    }

    this.addMarketplaceAsset("wallBroken", -10.5, 20.2, 1.2, Math.PI / 2 + 0.08, {
      type: "box",
      width: 5.4,
      depth: 1.1,
    });
    this.addMarketplaceAsset("wallBroken", 10.4, 12.3, 1.2, -Math.PI / 2 - 0.08, {
      type: "box",
      width: 5.4,
      depth: 1.1,
    });
    this.addMarketplaceAsset("wallArched", -10.1, 9.4, 1.05, Math.PI / 2, {
      type: "box",
      width: 4.8,
      depth: 1.1,
    });
    this.addMarketplaceAsset("wallArched", 10.2, 23, 1.05, -Math.PI / 2, {
      type: "box",
      width: 4.8,
      depth: 1.1,
    });
    this.addMarketplaceAsset("pillarDecorated", -7.4, 27.4, 1.1, 0.1, {
      type: "circle",
      radius: 0.72,
    });
    this.addMarketplaceAsset("pillarDecorated", 7.2, 27.5, 1.1, -0.1, {
      type: "circle",
      radius: 0.72,
    });
    this.addMarketplaceAsset("crates", -8.2, 14.7, 0.9, 0.35, {
      type: "box",
      width: 2.1,
      depth: 1.45,
    });
    this.addMarketplaceAsset("barrel", 7.9, 18.5, 1, -0.4, {
      type: "circle",
      radius: 0.62,
    });

    this.createCrystalCluster(-2.3, 14.7, 0.9, 0.42, this.materials.crystalBlue);
    this.createCrystalCluster(2.2, 17.4, 0.9, 0.4, this.materials.crystalBlue);
  }

  buildCauseway() {
    this.addDoorwayAsset("wallDoorway", 0, 2.5, 1.35, 0, {
      totalWidth: 7.6,
      openingWidth: 2.7,
      depth: 1.15,
    });
    this.addDoorwayAsset("wallDoorway", 0, -17.2, 1.45, Math.PI, {
      totalWidth: 8,
      openingWidth: 2.8,
      depth: 1.2,
    });

    this.addMarketplaceAsset("wallBroken", -8.6, -6, 1.3, Math.PI / 2, {
      type: "box",
      width: 5.8,
      depth: 1.2,
    });
    this.addMarketplaceAsset("wallBroken", 8.6, -4, 1.3, -Math.PI / 2, {
      type: "box",
      width: 5.8,
      depth: 1.2,
    });
    this.addMarketplaceAsset("wallArched", -8.6, -12, 1.05, Math.PI / 2, {
      type: "box",
      width: 4.8,
      depth: 1.1,
    });
    this.addMarketplaceAsset("wallArched", 8.6, -11.8, 1.05, -Math.PI / 2, {
      type: "box",
      width: 4.8,
      depth: 1.1,
    });

    this.addBlock(-3.4, -4.2, 3.3, 1.35, 1.2, -0.2);
    this.addBlock(4.1, -9.1, 3.1, 1.25, 1.1, 0.24);
    this.addMarketplaceAsset("crates", 5.3, -1.5, 0.95, -0.35, {
      type: "box",
      width: 2.2,
      depth: 1.5,
    });
    this.addMarketplaceAsset("barrel", -5.5, -10, 1.05, 0.2, {
      type: "circle",
      radius: 0.64,
    });

    this.createCrystalCluster(-9.4, -2.5, 1.3, 0.65, this.materials.crystal);
    this.createCrystalCluster(9.5, -13.5, 1.15, 0.58, this.materials.crystal);
  }

  buildSanctum() {
    const centerZ = -29.5;
    const platform = prepare(
      new THREE.Mesh(new THREE.CylinderGeometry(10.4, 11.1, 0.48, 48), this.materials.darkStone),
    );
    platform.position.set(0, 0.08, centerZ);
    this.group.add(platform);
    this.shootables.push(platform);

    const sigil = prepare(
      new THREE.Mesh(new THREE.RingGeometry(5.6, 8.5, 64, 2), this.materials.corruption),
      false,
    );
    sigil.rotation.x = -Math.PI / 2;
    sigil.position.set(0, 0.34, centerZ);
    this.group.add(sigil);

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const shard = this.createCrystalCluster(
        Math.sin(angle) * 8.7,
        centerZ + Math.cos(angle) * 8.7,
        1.35,
        0.58 + (index % 2) * 0.16,
        index % 2 ? this.materials.crystal : this.materials.crystalDark,
      );
      shard.rotation.y = angle;
    }

    this.addMarketplaceAsset("pillarDecorated", -7.2, -25, 1.3, 0.12, {
      type: "circle",
      radius: 0.82,
    });
    this.addMarketplaceAsset("pillarDecorated", 7.2, -25, 1.3, -0.12, {
      type: "circle",
      radius: 0.82,
    });
    this.addMarketplaceAsset("pillarDecorated", -7.2, -34, 1.05, -0.16, {
      type: "circle",
      radius: 0.75,
    });
    this.addMarketplaceAsset("pillarDecorated", 7.2, -34, 1.05, 0.16, {
      type: "circle",
      radius: 0.75,
    });
    this.addMarketplaceAsset("floorRocks", 0, -24.4, 2.2, 0, null);

    this.heartshard = this.createCrystalCluster(
      0,
      -30.8,
      3.4,
      1.32,
      this.materials.crystal,
    );
    this.heartshard.name = "Heartshard";
    this.heartshardBaseY = this.heartshard.position.y;
    this.addCircleCollider(0, -30.8, 1.55);

    const heartLight = new THREE.PointLight(0xc85cff, 30, 25, 2);
    heartLight.position.set(0, 5.4, 0);
    this.heartshard.add(heartLight);
    this.heartLight = heartLight;

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xb448ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.heartBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 1.3, 18, 18, 1, true),
      beamMaterial,
    );
    this.heartBeam.position.set(0, 9, -30.8);
    this.group.add(this.heartBeam);

    this.heartRings = [];
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.3 + index * 0.72, 0.055, 8, 48),
        new THREE.MeshBasicMaterial({
          color: index === 1 ? 0x53e9ff : 0xd970ff,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.position.set(0, 1.6 + index * 0.82, -30.8);
      ring.rotation.x = Math.PI / 2 + index * 0.18;
      ring.rotation.y = index * 0.7;
      this.group.add(ring);
      this.heartRings.push(ring);
    }
  }

  buildNature() {
    const commonTrees = [
      [-18, 31, 0.92, 0.2],
      [17, 31, 1.02, 2.5],
      [-20, 20, 1.08, 1.3],
      [20, 19, 0.92, 4.1],
      [-18, 7, 0.9, 5.2],
      [18, 5, 1.02, 2.8],
      [-17, -7, 0.86, 0.8],
      [18, -12, 0.96, 3.6],
      [-15, -22, 0.82, 5.4],
      [16, -22, 0.88, 1.8],
    ];
    commonTrees.forEach(([x, z, scale, rotation]) => {
      this.addNatureAsset("commonTree", x, z, scale, rotation, {
        radius: 0.72 * scale,
        shootable: true,
      });
    });

    const twistedTrees = [
      [-13, -31, 0.52, 0.4],
      [13, -33, 0.48, 2.6],
      [-18, -39, 0.44, 4.8],
      [18, -40, 0.46, 1.7],
    ];
    twistedTrees.forEach(([x, z, scale, rotation]) => {
      this.addNatureAsset("twistedTree", x, z, scale, rotation, {
        radius: 1.2 * scale,
        shootable: true,
      });
    });

    const bushes = [
      [-11, 28],
      [11, 27],
      [-13, 17],
      [13, 15],
      [-10, 5],
      [11, 3],
      [-12, -16],
      [12, -18],
      [-11, -28],
      [11, -29],
    ];
    bushes.forEach(([x, z], index) => {
      this.addNatureAsset(
        "floweringBush",
        x,
        z,
        0.82 + (index % 3) * 0.12,
        this.random() * Math.PI * 2,
      );
    });

    const flowerSpots = [
      [-8, 24],
      [-5.5, 27],
      [5.8, 26],
      [8, 22],
      [-9, 10],
      [-6.5, 7],
      [6, 8],
      [9, 11],
      [-13, 22],
      [13, 21],
      [-12, 13],
      [12, 9],
    ];
    flowerSpots.forEach(([x, z], index) => {
      this.addNatureAsset(
        index % 2 ? "flowersBlue" : "flowersYellow",
        x,
        z,
        0.42 + (index % 3) * 0.06,
        this.random() * Math.PI * 2,
      );
    });

    const grassSpots = [
      [-15, 34],
      [-11, 33],
      [11, 34],
      [15, 32],
      [-14, 25],
      [14, 25],
      [-15, 14],
      [15, 13],
      [-13, 3],
      [13, 1],
      [-14, -8],
      [14, -10],
      [-13, -20],
      [13, -21],
      [-10, -37],
      [10, -38],
    ];
    grassSpots.forEach(([x, z], index) => {
      this.addNatureAsset(
        index % 3 ? "grassShort" : "grassTall",
        x,
        z,
        0.8 + (index % 4) * 0.12,
        this.random() * Math.PI * 2,
      );
    });

    const rocks = [
      [-13.5, 30, 0.65],
      [14, 29, 0.75],
      [-15, 1, 0.58],
      [15, -2, 0.72],
      [-12, -17, 0.62],
      [12.5, -19, 0.7],
      [-14.5, -35, 0.78],
      [14.5, -36, 0.68],
    ];
    rocks.forEach(([x, z, scale], index) => {
      this.addNatureAsset(index % 2 ? "rockB" : "rockA", x, z, scale, this.random() * Math.PI, {
        radius: 1.1 * scale,
        shootable: true,
      });
    });
  }

  buildScenery() {
    for (let index = 0; index < 28; index += 1) {
      const angle = (index / 28) * Math.PI * 2 + this.random() * 0.12;
      const distance = 52 + this.random() * 13;
      const height = 7 + this.random() * 15;
      const mountain = prepare(
        new THREE.Mesh(
          new THREE.ConeGeometry(4 + this.random() * 6, height, 5 + (index % 3)),
          index % 4 === 0 ? this.materials.darkStone : this.materials.stone,
        ),
        false,
      );
      mountain.position.set(
        Math.cos(angle) * distance,
        height * 0.42 - 1,
        Math.sin(angle) * distance,
      );
      mountain.rotation.y = this.random() * Math.PI;
      mountain.scale.z = 0.62 + this.random() * 0.72;
      this.group.add(mountain);
    }

    const landmark = prepare(
      new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 2.1, 19, 6),
        this.materials.darkStone,
      ),
      false,
    );
    landmark.position.set(-34, 8, -42);
    landmark.rotation.z = -0.12;
    this.group.add(landmark);
  }

  buildAmbientMotes() {
    const positions = [];
    const colors = [];
    const color = new THREE.Color();
    for (let index = 0; index < 180; index += 1) {
      const angle = this.random() * Math.PI * 2;
      const distance = 4 + this.random() * 42;
      positions.push(
        Math.cos(angle) * distance,
        0.45 + this.random() * 7,
        Math.sin(angle) * distance - 3,
      );
      color.set(index % 3 === 0 ? 0xffd36b : index % 3 === 1 ? 0x79f3d1 : 0xd07aff);
      colors.push(color.r, color.g, color.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.motes = new THREE.Points(geometry, material);
    this.group.add(this.motes);
  }

  addBlock(x, z, width, depth, height, rotation = 0, y = height / 2) {
    const block = prepare(
      new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.materials.darkStone),
    );
    block.position.set(x, y, z);
    block.rotation.y = rotation;
    this.group.add(block);
    this.shootables.push(block);
    this.addBoxCollider(x, z, width, depth, rotation);

    const cap = prepare(
      new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.05, 0.16, depth * 1.06),
        this.materials.paleStone,
      ),
    );
    cap.position.set(x, y + height / 2 + 0.07, z);
    cap.rotation.y = rotation;
    this.group.add(cap);
    this.shootables.push(cap);
    return block;
  }

  addMarketplaceAsset(key, x, z, scale, rotation, collider) {
    const asset = this.assets.cloneEnvironment(key);
    asset.position.set(x, 0.015, z);
    asset.rotation.y = rotation;
    asset.scale.setScalar(scale);
    asset.traverse((child) => {
      if (child.isMesh) this.shootables.push(child);
    });
    this.group.add(asset);

    if (collider?.type === "circle") {
      this.addCircleCollider(x, z, collider.radius);
    } else if (collider?.type === "box") {
      this.addBoxCollider(x, z, collider.width, collider.depth, rotation);
    }
    return asset;
  }

  addDoorwayAsset(key, x, z, scale, rotation, dimensions) {
    const asset = this.addMarketplaceAsset(key, x, z, scale, rotation, null);
    const door = asset.getObjectByName("wall_doorway_door");
    if (door) {
      door.visible = false;
      this.shootables = this.shootables.filter((mesh) => mesh !== door);
    }
    const sideWidth = (dimensions.totalWidth - dimensions.openingWidth) / 2;
    const localOffset = dimensions.openingWidth / 2 + sideWidth / 2;

    [-1, 1].forEach((side) => {
      const offset = rotateLocalToWorld(localOffset * side, 0, rotation);
      this.addBoxCollider(
        x + offset.x,
        z + offset.y,
        sideWidth,
        dimensions.depth,
        rotation,
      );
    });
    return asset;
  }

  addNatureAsset(key, x, z, scale, rotation, options = {}) {
    const asset = this.assets.cloneNature(key);
    asset.position.set(x, 0.02, z);
    asset.rotation.y = rotation;
    asset.scale.setScalar(scale);
    if (options.shootable) {
      asset.traverse((child) => {
        if (child.isMesh) this.shootables.push(child);
      });
    }
    this.group.add(asset);
    if (options.radius) this.addCircleCollider(x, z, options.radius);
    return asset;
  }

  createCrystalCluster(x, z, height, scale = 1, material = this.materials.crystal) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    this.group.add(group);

    for (let index = 0; index < 5; index += 1) {
      const crystalHeight = height * (0.58 + this.random() * 0.82) * scale;
      const crystal = prepare(
        new THREE.Mesh(
          new THREE.ConeGeometry(0.31 * scale, crystalHeight, 5),
          index % 4 === 0 ? this.materials.crystalDark : material,
        ),
      );
      crystal.position.set(
        (this.random() - 0.5) * 1.18 * scale,
        crystalHeight / 2,
        (this.random() - 0.5) * 1.18 * scale,
      );
      crystal.rotation.set(
        (this.random() - 0.5) * 0.42,
        this.random() * Math.PI,
        (this.random() - 0.5) * 0.34,
      );
      group.add(crystal);
      this.shootables.push(crystal);
    }
    return group;
  }

  addCircleCollider(x, z, radius) {
    this.colliders.push({ type: "circle", x, z, radius });
  }

  addBoxCollider(x, z, width, depth, rotation = 0) {
    this.colliders.push({
      type: "box",
      x,
      z,
      halfWidth: width / 2,
      halfDepth: depth / 2,
      rotation,
    });
  }

  resolveCollision(position, radius = 0.55) {
    for (const collider of this.colliders) {
      if (collider.type === "circle") {
        this.resolveCircleCollision(position, radius, collider);
      } else {
        this.resolveBoxCollision(position, radius, collider);
      }
    }

    const centerDistance = Math.hypot(position.x, position.z);
    const maximum = this.bounds - radius;
    if (centerDistance > maximum) {
      position.x = (position.x / centerDistance) * maximum;
      position.z = (position.z / centerDistance) * maximum;
    }
  }

  resolveCircleCollision(position, radius, collider) {
    const dx = position.x - collider.x;
    const dz = position.z - collider.z;
    const minimum = radius + collider.radius;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= minimum * minimum) return;

    if (distanceSquared < 0.0001) {
      position.x += minimum;
      return;
    }
    const distance = Math.sqrt(distanceSquared);
    const push = minimum - distance;
    position.x += (dx / distance) * push;
    position.z += (dz / distance) * push;
  }

  resolveBoxCollision(position, radius, collider) {
    const cosine = Math.cos(collider.rotation);
    const sine = Math.sin(collider.rotation);
    const dx = position.x - collider.x;
    const dz = position.z - collider.z;
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    const nearestX = THREE.MathUtils.clamp(localX, -collider.halfWidth, collider.halfWidth);
    const nearestZ = THREE.MathUtils.clamp(localZ, -collider.halfDepth, collider.halfDepth);
    let pushX = localX - nearestX;
    let pushZ = localZ - nearestZ;
    const distanceSquared = pushX * pushX + pushZ * pushZ;

    if (distanceSquared >= radius * radius) return;

    if (distanceSquared > 0.0001) {
      const distance = Math.sqrt(distanceSquared);
      const push = radius - distance;
      pushX = (pushX / distance) * push;
      pushZ = (pushZ / distance) * push;
    } else {
      const distanceToX = collider.halfWidth - Math.abs(localX);
      const distanceToZ = collider.halfDepth - Math.abs(localZ);
      if (distanceToX < distanceToZ) {
        pushX = (localX < 0 ? -1 : 1) * (distanceToX + radius);
        pushZ = 0;
      } else {
        pushX = 0;
        pushZ = (localZ < 0 ? -1 : 1) * (distanceToZ + radius);
      }
    }

    position.x += pushX * cosine + pushZ * sine;
    position.z += -pushX * sine + pushZ * cosine;
  }

  segmentColliderT(from, to, collider, padding = 0) {
    const start = new THREE.Vector2(from.x, from.z);
    const end = new THREE.Vector2(to.x, to.z);
    const direction = end.clone().sub(start);

    if (collider.type === "circle") {
      const center = new THREE.Vector2(collider.x, collider.z);
      const offset = start.clone().sub(center);
      const radius = collider.radius + padding;
      const a = direction.dot(direction);
      if (a < 0.000001) return null;
      const b = 2 * offset.dot(direction);
      const c = offset.dot(offset) - radius * radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) return null;
      const root = Math.sqrt(discriminant);
      const first = (-b - root) / (2 * a);
      const second = (-b + root) / (2 * a);
      if (first >= 0 && first <= 1) return first;
      if (second >= 0 && second <= 1) return second;
      return null;
    }

    const cosine = Math.cos(collider.rotation);
    const sine = Math.sin(collider.rotation);
    const transform = (point) => {
      const dx = point.x - collider.x;
      const dz = point.z - collider.z;
      return new THREE.Vector2(dx * cosine - dz * sine, dx * sine + dz * cosine);
    };
    const localStart = transform(from);
    const localEnd = transform(to);
    const localDirection = localEnd.clone().sub(localStart);
    const halfWidth = collider.halfWidth + padding;
    const halfDepth = collider.halfDepth + padding;
    let minimum = 0;
    let maximum = 1;

    for (const [origin, delta, halfSize] of [
      [localStart.x, localDirection.x, halfWidth],
      [localStart.y, localDirection.y, halfDepth],
    ]) {
      if (Math.abs(delta) < 0.000001) {
        if (origin < -halfSize || origin > halfSize) return null;
        continue;
      }
      let near = (-halfSize - origin) / delta;
      let far = (halfSize - origin) / delta;
      if (near > far) [near, far] = [far, near];
      minimum = Math.max(minimum, near);
      maximum = Math.min(maximum, far);
      if (minimum > maximum) return null;
    }
    return minimum >= 0 && minimum <= 1 ? minimum : null;
  }

  hasLineOfSight(from, to, padding = 0.08) {
    return !this.colliders.some((collider) => {
      const t = this.segmentColliderT(from, to, collider, padding);
      return t !== null && t > 0.015 && t < 0.985;
    });
  }

  resolveCameraPosition(origin, desired, padding = 0.34) {
    let nearest = 1;
    this.colliders.forEach((collider) => {
      const t = this.segmentColliderT(origin, desired, collider, padding);
      if (t !== null && t > 0.01) nearest = Math.min(nearest, t);
    });
    if (nearest >= 1) return desired;
    return origin.clone().lerp(desired, Math.max(0.08, nearest - 0.035));
  }

  setHeartshardReady(ready) {
    this.heartshardReady = ready;
  }

  update(cameraPosition, delta = 0) {
    this.sky.position.copy(cameraPosition);
    if (delta <= 0) return;
    this.elapsed += delta;

    if (this.motes) {
      this.motes.rotation.y += delta * 0.018;
      this.motes.position.y = Math.sin(this.elapsed * 0.35) * 0.12;
    }
    if (this.heartshard) {
      const time = this.elapsed;
      this.heartshard.rotation.y += delta * (this.heartshardReady ? 0.72 : 0.25);
      this.heartshard.position.y = this.heartshardBaseY + Math.sin(time * 1.6) * 0.09;
      this.heartBeam.material.opacity =
        (this.heartshardReady ? 0.34 : 0.16) + Math.sin(time * 2.2) * 0.055;
      this.heartLight.intensity =
        (this.heartshardReady ? 42 : 28) + Math.sin(time * 2.8) * 5;
      this.heartRings.forEach((ring, index) => {
        ring.rotation.z += delta * (0.24 + index * 0.17) * (index % 2 ? -1 : 1);
        ring.material.opacity =
          (this.heartshardReady ? 0.74 : 0.42) + Math.sin(time * 2 + index) * 0.08;
      });
    }
  }
}
