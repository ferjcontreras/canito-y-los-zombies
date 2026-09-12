import * as THREE from 'three';

export interface AABB {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export class Canito {
  readonly group: THREE.Group;
  private _yRot = 0;
  private _phase = 0;
  private _howlOsc = 0;

  private _body!: THREE.Group;
  private _head!: THREE.Group;
  private _earL!: THREE.Group;
  private _earR!: THREE.Group;
  private _legFL!: THREE.Group;
  private _legFR!: THREE.Group;
  private _legBL!: THREE.Group;
  private _legBR!: THREE.Group;
  private _tail!: THREE.Group;
  private _jaw!: THREE.Object3D;

  private _barkTimer = 0;
  private _howlTimer = 0;
  private _turnLean = 0;
  private static readonly BARK_DURATION = 0.26;
  private static readonly HOWL_DURATION = 1.05;

  // Hurt flash bookkeeping
  private _hurtTimer = 0;
  private _hurtMats: THREE.MeshLambertMaterial[] = [];
  private _hurtMatOrigColors: number[] = [];
  private static readonly HURT_DURATION = 0.55;

  // Knockback velocity when hit
  private _knockX = 0;
  private _knockZ = 0;
  private _knockTimer = 0;
  private static readonly KNOCKBACK_SPEED = 8;

  private readonly SPEED        = 6;
  private readonly SPRINT_SPEED = 18;
  private readonly TURN         = 2.6;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this._build();
    scene.add(this.group);
  }

  private _mat(color: number) { return new THREE.MeshLambertMaterial({ color }); }

  private _add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number, y: number, z: number,
    parent?: THREE.Object3D,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    (parent ?? this.group).add(m);
    return m;
  }

  private _build(): void {
    const white = this._mat(0xf2ede6);
    const cream = this._mat(0xe8e0d4);
    // Track the body-fur materials so hurt() can pulse them red/white
    this._hurtMats = [white, cream];
    this._hurtMatOrigColors = [0xf2ede6, 0xe8e0d4];
    const pink  = this._mat(0xf4b0bb);
    const dark  = this._mat(0x1e1e1e);
    const shine = this._mat(0xffffff);
    const red   = this._mat(0xc0392b);
    const gold  = this._mat(0xf1c40f);
    const blush = this._mat(0xffaaaa);

    this._body = new THREE.Group();
    this.group.add(this._body);

    this._add(new THREE.SphereGeometry(0.3,  14, 10), white, 0, 0.42, 0, this._body);

    this._head = new THREE.Group();
    this._head.position.set(0, 0.78, 0.08);
    this._body.add(this._head);
    this._add(new THREE.SphereGeometry(0.23, 14, 10), white, 0, 0, 0, this._head);

    // Copete
    this._add(new THREE.SphereGeometry(0.13, 10, 8), cream,  0,     0.24, -0.04, this._head);
    this._add(new THREE.SphereGeometry(0.09, 10, 8), white, -0.06, 0.34, -0.06, this._head);
    this._add(new THREE.SphereGeometry(0.09, 10, 8), white,  0.06, 0.34, -0.06, this._head);

    // Orejas
    const makeEar = (sx: -1 | 1): THREE.Group => {
      const ear = new THREE.Group();
      ear.position.set(sx * 0.2, 0.03, -0.1);
      ear.rotation.z = sx * 0.12;
      this._head.add(ear);

      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), cream);
      outer.castShadow = true;
      ear.add(outer);

      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 10), pink);
      inner.rotation.z = sx * 0.45;
      inner.position.set(sx * 0.045, -0.01, 0.06);
      ear.add(inner);
      return ear;
    };
    this._earL = makeEar(-1);
    this._earR = makeEar(1);

    // Ojos
    for (const sx of [-1, 1] as const) {
      this._add(new THREE.SphereGeometry(0.045, 8, 8), dark,  sx * 0.09,             0.020, 0.125, this._head);
      this._add(new THREE.SphereGeometry(0.016, 6, 6), shine, sx * 0.09 + sx * 0.013, 0.035, 0.138, this._head);
    }

    this._add(new THREE.SphereGeometry(0.037, 8, 8), dark, 0, -0.035, 0.145, this._head);

    for (const sx of [-1, 1] as const)
      this._add(new THREE.SphereGeometry(0.018, 6, 6), dark, sx * 0.043, -0.075, 0.142, this._head);

    for (const sx of [-1, 1] as const)
      this._add(new THREE.SphereGeometry(0.04, 8, 8), blush, sx * 0.16, -0.01, 0.12, this._head);

    this._jaw = new THREE.Group();
    this._jaw.position.set(0, -0.095, 0.17);
    this._head.add(this._jaw);
    this._add(new THREE.BoxGeometry(0.13, 0.035, 0.08), dark, 0, 0, 0, this._jaw);
    this._add(new THREE.SphereGeometry(0.035, 8, 5), pink, 0, -0.005, 0.045, this._jaw);

    this._add(new THREE.CylinderGeometry(0.135, 0.135, 0.07, 16), red,  0, 0.605, 0.06, this._body);
    this._add(new THREE.CylinderGeometry(0.04,  0.04,  0.022, 10), gold, 0, 0.535, 0.16, this._body);

    // Patas
    const legGeo = new THREE.CylinderGeometry(0.06, 0.068, 0.34, 8);
    const pawGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const makeLeg = (lx: number, lz: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.34, lz);
      const leg = new THREE.Mesh(legGeo, white);
      leg.castShadow = true;
      leg.position.y = -0.17;
      pivot.add(leg);

      const paw = new THREE.Mesh(pawGeo, white);
      paw.castShadow = true;
      paw.position.set(0, -0.34, 0.02);
      pivot.add(paw);

      this.group.add(pivot);
      return pivot;
    };
    this._legFL = makeLeg(-0.13,  0.15);
    this._legFR = makeLeg( 0.13,  0.15);
    this._legBL = makeLeg(-0.13, -0.15);
    this._legBR = makeLeg( 0.13, -0.15);

    this._tail = new THREE.Group();
    this._tail.position.set(0, 0.58, -0.33);
    this._body.add(this._tail);
    this._add(new THREE.SphereGeometry(0.10, 10, 8), cream, 0, 0, -0.03, this._tail);
    this._add(new THREE.SphereGeometry(0.075, 8, 6), cream, 0, 0.02, -0.14, this._tail);
  }

  /** Trigger the red/white hurt-flash + knockback away from the attacker.
   *  attackerX/Z are world coords of whatever damaged Canito (optional). */
  hurt(attackerX?: number, attackerZ?: number): void {
    this._hurtTimer = Canito.HURT_DURATION;
    if (attackerX !== undefined && attackerZ !== undefined) {
      const dx = this.group.position.x - attackerX;
      const dz = this.group.position.z - attackerZ;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        this._knockX = (dx / d) * Canito.KNOCKBACK_SPEED;
        this._knockZ = (dz / d) * Canito.KNOCKBACK_SPEED;
        this._knockTimer = 0.22;
      }
    }
  }

  bark(): void {
    this._barkTimer = Canito.BARK_DURATION;
  }

  howl(): void {
    this._howlTimer = Canito.HOWL_DURATION;
    this._barkTimer = 0;
  }

  private _updateHurtFlash(dt: number): void {
    if (this._hurtTimer <= 0) return;
    this._hurtTimer -= dt;
    if (this._hurtTimer <= 0) {
      // Restore original fur colours
      for (let i = 0; i < this._hurtMats.length; i++) {
        this._hurtMats[i].color.setHex(this._hurtMatOrigColors[i]);
      }
      return;
    }
    // Strobe ~10× per second between bright red and white
    const tick = Math.floor((Canito.HURT_DURATION - this._hurtTimer) * 14);
    const isRed = (tick & 1) === 0;
    const targetHex = isRed ? 0xff2424 : 0xffffff;
    for (const m of this._hurtMats) m.color.setHex(targetHex);
  }

  private _blendRotation(obj: THREE.Object3D, x: number, z: number, amount: number, y?: number): void {
    obj.rotation.x += (x - obj.rotation.x) * amount;
    if (y !== undefined) obj.rotation.y += (y - obj.rotation.y) * amount;
    obj.rotation.z += (z - obj.rotation.z) * amount;
  }

  update(dt: number, keys: Set<string>, colliders: AABB[]): void {
    this._updateHurtFlash(dt);

    // ── Knockback: apply velocity from the last hit, decaying over time ────
    if (this._knockTimer > 0) {
      this._knockTimer -= dt;
      const p = this.group.position;
      const sx = this._knockX * dt;
      const sz = this._knockZ * dt;
      if (!this._hits(p.x + sx, p.z, colliders)) p.x += sx;
      if (!this._hits(p.x, p.z + sz, colliders)) p.z += sz;
      // Exponential decay (≈ 10% remaining per second)
      const decay = Math.pow(0.1, dt);
      this._knockX *= decay;
      this._knockZ *= decay;
    }

    const left  = keys.has('ArrowLeft')  || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    if (left)  this._yRot += this.TURN * dt;
    if (right) this._yRot -= this.TURN * dt;
    this.group.rotation.y = this._yRot;

    const fwd    = keys.has('ArrowUp')   || keys.has('KeyW');
    const bwd    = keys.has('ArrowDown') || keys.has('KeyS');
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const sprinting = sprint && fwd && !bwd;
    const turnInput = (left ? 1 : 0) - (right ? 1 : 0);
    this._turnLean += (turnInput * 0.18 - this._turnLean) * Math.min(1, dt * 8);

    if (fwd || bwd) {
      const dir   = fwd ? 1 : -0.6;
      const speed = (sprinting ? this.SPRINT_SPEED : this.SPEED) * dt * dir;
      const dx    = Math.sin(this._yRot) * speed;
      const dz    = Math.cos(this._yRot) * speed;
      const p     = this.group.position;

      if (!this._hits(p.x + dx, p.z, colliders)) p.x += dx;
      if (!this._hits(p.x, p.z + dz, colliders)) p.z += dz;

      p.x = Math.max(-950, Math.min(720, p.x));
      p.z = Math.max(-650, Math.min(550, p.z));
    }

    const walking = fwd || bwd;

    // ── Vocalisation envelopes ────────────────────────────────────────────
    // Bark: a single quick arc — head snaps, body recoils, tail flicks.
    const barkPulse = this._barkTimer > 0
      ? Math.sin((1 - this._barkTimer / Canito.BARK_DURATION) * Math.PI)
      : 0;

    // Cosmic howl: snappy attack → sustained skyward HOLD → soft release,
    // instead of a symmetric sine. A fast tremor keeps the held note alive.
    let howl = 0;
    if (this._howlTimer > 0) {
      const p = 1 - this._howlTimer / Canito.HOWL_DURATION;   // 0..1
      const attack = 0.16, release = 0.34;
      const env = p < attack ? p / attack
                : p > 1 - release ? (1 - p) / release
                : 1;
      howl = env * env * (3 - 2 * env);                       // smoothstep
    }
    this._howlOsc += dt * 40;
    const howlTremor = howl * Math.sin(this._howlOsc) * 0.05;

    // Shared pose contributions mixed into every locomotion state so bark /
    // howl read identically whether Canito is still, walking or galloping.
    // Negative head.x points the muzzle UP — the signature of a howl.
    const headVocal = -barkPulse * 0.22 - howl * 1.15 + howlTremor;
    const bodyVocal = -howl * 0.36;                  // rear back / chest up
    const earVocalX =  howl * 0.40 - barkPulse * 0.18;  // pin back on howl
    const tailVocal =  howl * 0.55;                  // tail raised & stiff

    if (walking) {
      const setLeg = (leg: THREE.Group, swing: number, lift: number, roll: number) => {
        leg.rotation.x += (swing - leg.rotation.x) * 0.58;
        leg.rotation.z += (roll - leg.rotation.z) * 0.42;
        leg.position.y += (0.34 + lift - leg.position.y) * 0.50;
      };

      if (sprinting) {
        this._phase += dt * 16.8;

        const cycle = ((this._phase / (Math.PI * 2)) % 1 + 1) % 1;
        const pulse = (center: number, width: number): number => {
          const d = Math.abs(((cycle - center + 0.5) % 1) - 0.5);
          return Math.max(0, 1 - d / width);
        };

        // Bounding gallop: front pair reaches/catches, body lifts, hind pair
        // tucks and drives. The legs are intentionally paired, not diagonal.
        const frontReach = pulse(0.06, 0.20);
        const frontLoad  = pulse(0.24, 0.17);
        const flight     = pulse(0.48, 0.24);
        const hindTuck   = pulse(0.62, 0.18);
        const hindDrive  = pulse(0.82, 0.22);
        const stretch    = Math.max(frontReach, hindDrive);

        // Bigger reach + clearer ground clearance → a punchier, less floaty run.
        const frontSwing = -0.98 * frontReach + 0.56 * frontLoad + 0.18 * flight;
        const hindSwing  = -0.70 * hindTuck  + 1.08 * hindDrive - 0.20 * flight;
        const frontLift  =  0.095 * frontReach + 0.055 * flight;
        const hindLift   =  0.095 * hindTuck   + 0.060 * flight;
        const sideRoll   = Math.sin(this._phase * 2) * 0.028 - this._turnLean * 0.18;

        setLeg(this._legFL, frontSwing, frontLift,  sideRoll);
        setLeg(this._legFR, frontSwing * 0.97, frontLift * 0.92, -sideRoll);
        setLeg(this._legBL, hindSwing, hindLift, -sideRoll * 0.75);
        setLeg(this._legBR, hindSwing * 0.97, hindLift * 0.92, sideRoll * 0.75);

        this.group.position.y = 0.015 + flight * 0.14 + hindDrive * 0.040 - frontLoad * 0.020;
        this._body.scale.z += (1 + stretch * 0.12 - flight * 0.040 - this._body.scale.z) * 0.25;
        this._body.scale.y += (1 - stretch * 0.060 + flight * 0.045 - this._body.scale.y) * 0.25;
        this._body.scale.x += (1 - stretch * 0.032 + flight * 0.022 - this._body.scale.x) * 0.25;

        const bodyLean = 0.24 + frontReach * 0.12 - frontLoad * 0.08 + bodyVocal;
        const bodyRoll = -this._turnLean + Math.sin(this._phase) * 0.045;
        this._blendRotation(this._body, bodyLean, bodyRoll, 0.28);

        this._blendRotation(
          this._head,
          -0.10 + frontReach * 0.08 - frontLoad * 0.18 + headVocal,
          -this._turnLean * 0.65 + Math.sin(this._phase * 0.7) * 0.04,
          0.34,
        );

        const earLift = -0.16 - flight * 0.22 - frontLoad * 0.08 + earVocalX;
        this._blendRotation(this._earL,  earLift, -0.24 - this._turnLean * 0.25, 0.38);
        this._blendRotation(this._earR,  earLift,  0.24 - this._turnLean * 0.25, 0.38);

        this._tail.rotation.x += (0.34 + flight * 0.28 + tailVocal - this._tail.rotation.x) * 0.30;
        this._tail.rotation.z += (Math.sin(this._phase * 1.8) * 0.50 - this._tail.rotation.z) * 0.32;
      } else {
        const pace = 7.4 * (bwd ? 0.78 : 1);
        const stride = 0.52;
        const bounce = 0.060;
        this._phase += dt * pace;

        const sw = Math.sin(this._phase);
        const swOpp = Math.sin(this._phase + Math.PI);
        // Clear paw lift so the trot reads as stepping, not sliding.
        const liftA = Math.max(0, sw) * 0.075;
        const liftB = Math.max(0, swOpp) * 0.075;
        const dirMul = bwd ? -0.72 : 1;
        // Walking/trotting keeps the familiar alternating diagonal pattern.
        setLeg(this._legFL,  sw * stride * dirMul, liftA, Math.sin(this._phase * 0.5 - 1.0) * 0.035);
        setLeg(this._legBR,  sw * stride * dirMul, liftA, Math.sin(this._phase * 0.5 + 1.0) * 0.035);
        setLeg(this._legFR, swOpp * stride * dirMul, liftB, Math.sin(this._phase * 0.5 + 1.0) * 0.035);
        setLeg(this._legBL, swOpp * stride * dirMul, liftB, Math.sin(this._phase * 0.5 - 1.0) * 0.035);

        this.group.position.y = Math.abs(Math.sin(this._phase)) * bounce;
        this._body.scale.x += (1 - this._body.scale.x) * 0.20;
        this._body.scale.y += (1 - this._body.scale.y) * 0.20;
        this._body.scale.z += (1 - this._body.scale.z) * 0.20;

        const bodyLean = (fwd ? 0.06 : -0.05) + bodyVocal;
        const bodyRoll = -this._turnLean + Math.sin(this._phase * 0.5) * 0.035;
        this._blendRotation(this._body, bodyLean, bodyRoll, 0.24);

        const headBob = Math.sin(this._phase * 1.85) * 0.055;
        this._blendRotation(
          this._head,
          -0.04 + headBob + headVocal,
          -this._turnLean * 0.65 + Math.sin(this._phase * 0.7) * 0.06,
          0.32,
        );

        const earFlap = Math.sin(this._phase * 1.8) * 0.13;
        this._blendRotation(this._earL,  earFlap + earVocalX, -0.18 - this._turnLean * 0.25, 0.35);
        this._blendRotation(this._earR, -earFlap + earVocalX,  0.18 - this._turnLean * 0.25, 0.35);

        this._tail.rotation.x += (0.16 + tailVocal - this._tail.rotation.x) * 0.25;
        this._tail.rotation.z += (Math.sin(this._phase * 1.8) * 0.42 - this._tail.rotation.z) * 0.35;
      }
    } else {
      this._phase += dt * 1.8;
      this.group.position.y = Math.sin(this._phase) * 0.013;
      for (const leg of [this._legFL, this._legFR, this._legBL, this._legBR]) {
        leg.rotation.x *= 0.88;
        leg.rotation.z *= 0.82;
        leg.position.y += (0.34 - leg.position.y) * 0.25;
      }
      this._body.scale.x += (1 - this._body.scale.x) * 0.18;
      this._body.scale.y += (1 - this._body.scale.y) * 0.18;
      this._body.scale.z += (1 - this._body.scale.z) * 0.18;
      this._blendRotation(this._body, bodyVocal, -this._turnLean * 0.45 + Math.sin(this._phase * 0.8) * 0.025, 0.14);
      this._blendRotation(
        this._head,
        Math.sin(this._phase * 0.7) * 0.035 + headVocal,
        Math.sin(this._phase * 0.55) * 0.045 - this._turnLean * 0.5,
        0.20,
      );
      this._blendRotation(this._earL,  earVocalX + Math.sin(this._phase * 1.4) * 0.05, -0.12, 0.18);
      this._blendRotation(this._earR,  earVocalX - Math.sin(this._phase * 1.4) * 0.05,  0.12, 0.18);
      this._tail.rotation.x += (0.12 + tailVocal - this._tail.rotation.x) * 0.18;
      this._tail.rotation.z += (Math.sin(this._phase * 3) * (barkPulse > 0 ? 0.45 : 0.20) - this._tail.rotation.z) * 0.18;
    }

    // Skyward lift + neck stretch while howling; a quick hop on each bark.
    this.group.position.y += barkPulse * 0.035 + howl * 0.055;
    this._head.position.y = 0.78 + howl * 0.06;

    this._jaw.rotation.x += ((barkPulse * 0.82 + howl * 0.70) - this._jaw.rotation.x) * 0.45;
    this._jaw.position.y += (-0.095 - barkPulse * 0.035 - howl * 0.030 - this._jaw.position.y) * 0.45;
    if (barkPulse > 0 || howl > 0) {
      this._tail.rotation.z += Math.sin(this._phase * 8) * (barkPulse * 0.12 + howl * 0.06);
    }

    this._barkTimer = Math.max(0, this._barkTimer - dt);
    this._howlTimer = Math.max(0, this._howlTimer - dt);
  }

  private _hits(x: number, z: number, colliders: AABB[]): boolean {
    const r = 0.4;
    for (const c of colliders)
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    return false;
  }

  getPosition(): THREE.Vector3 { return this.group.position; }
  getYRot():     number        { return this._yRot; }
  setYRot(v: number): void {
    this._yRot = v;
    this.group.rotation.y = v;
  }
}
