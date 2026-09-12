import * as THREE from 'three';
import type { AABB } from './Canito';

// Proyectiles que lanzan los gauchos zombis "bailarines": empanadas mendocinas
// y mates calientes. Vuelan en arco y chocan contra los edificios (la cobertura
// sirve), igual que el resto de los proyectiles.
const MAT_DOUGH  = new THREE.MeshLambertMaterial({ color: 0xd8a24a, flatShading: true }); // masa dorada
const MAT_DOUGH2 = new THREE.MeshLambertMaterial({ color: 0xc4863a, flatShading: true }); // repulgue tostado
const MAT_GOURD  = new THREE.MeshLambertMaterial({ color: 0x5a3820, flatShading: true }); // calabaza
const MAT_YERBA  = new THREE.MeshLambertMaterial({ color: 0x5f7a34, flatShading: true }); // yerba
const MAT_METAL  = new THREE.MeshLambertMaterial({ color: 0xb8bcc4, flatShading: true }); // bombilla

export type SnackKind = 'empanada' | 'mate';

export class GauchoSnack {
  readonly group: THREE.Group;
  readonly damage: number;
  private _vel: THREE.Vector3;
  private _life = 3.0;
  private _alive = true;
  private _spin = new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 7);

  static readonly RADIUS       = 0.5;
  static readonly GRAVITY      = 13;
  static readonly BLOCK_HEIGHT = 8;

  constructor(origin: THREE.Vector3, vel: THREE.Vector3, kind: SnackKind) {
    this.group = new THREE.Group();
    this.group.position.copy(origin);
    this._vel = vel.clone();

    if (kind === 'empanada') {
      this.damage = 2;
      // Cuerpo: media luna achatada de masa dorada
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), MAT_DOUGH);
      body.scale.set(1.15, 0.5, 0.82);
      this.group.add(body);
      // Repulgue: bolitas a lo largo del borde curvo
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), MAT_DOUGH2);
        b.position.set(Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.16);
        this.group.add(b);
      }
    } else {
      this.damage = 3;
      // Calabaza (mate)
      const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 7), MAT_GOURD);
      gourd.scale.set(1, 1.15, 1);
      this.group.add(gourd);
      // Yerba asomando arriba
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.05, 8), MAT_YERBA);
      top.position.y = 0.15;
      this.group.add(top);
      // Bombilla inclinada
      const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6), MAT_METAL);
      bomb.position.set(0.07, 0.22, 0);
      bomb.rotation.z = 0.5;
      this.group.add(bomb);
    }

    this.group.traverse(m => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).castShadow = true; });
  }

  get position(): THREE.Vector3 { return this.group.position; }
  get alive(): boolean          { return this._alive; }

  update(dt: number, colliders: AABB[] = []): void {
    if (!this._alive) return;
    const p = this.group.position;
    p.x += this._vel.x * dt;
    p.y += this._vel.y * dt;
    p.z += this._vel.z * dt;
    this._vel.y -= GauchoSnack.GRAVITY * dt;
    this.group.rotation.x += this._spin.x * dt;
    this.group.rotation.z += this._spin.z * dt;

    if (p.y < GauchoSnack.BLOCK_HEIGHT) {
      for (const c of colliders) {
        if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) { this._alive = false; break; }
      }
    }
    this._life -= dt;
    if (this._life <= 0 || p.y < 0.1) this._alive = false;
  }

  kill(): void { this._alive = false; }
  remove(scene: THREE.Scene): void { scene.remove(this.group); }
}
