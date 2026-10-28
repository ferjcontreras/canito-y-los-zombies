import * as THREE from 'three';

// Armas que sueltan los autos/motos que Canito destruye con una bola de fuego.
//   metralla — bolitas chicas en ráfaga mientras se mantiene Espacio.
//   escopeta — abanico de perdigones que se abren; corto alcance.
export type WeaponKind = 'metralla' | 'escopeta';

const MAT_BOX = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, flatShading: true });
const MAT_GLOW: Record<WeaponKind, THREE.MeshBasicMaterial> = {
  metralla: new THREE.MeshBasicMaterial({ color: 0x40e0ff }),
  escopeta: new THREE.MeshBasicMaterial({ color: 0xff40c0 }),
};
const GEO_BOX  = new THREE.BoxGeometry(0.7, 0.45, 0.45);
const GEO_BALL = new THREE.SphereGeometry(0.12, 8, 6);

export class WeaponPickup {
  readonly group: THREE.Group;
  readonly kind: WeaponKind;
  private _alive = true;
  private _phase = Math.random() * Math.PI * 2;

  static readonly PICKUP_R = 1.6;

  constructor(kind: WeaponKind) {
    this.kind = kind;
    this.group = new THREE.Group();

    // Cajón de municiones con bolitas brillantes del color del arma encima:
    // en fila (metralla) o en abanico (escopeta), para leerlo de un vistazo.
    const box = new THREE.Mesh(GEO_BOX, MAT_BOX);
    box.castShadow = true;
    this.group.add(box);
    const n = kind === 'metralla' ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const ball = new THREE.Mesh(GEO_BALL, MAT_GLOW[kind]);
      if (kind === 'metralla') {
        ball.position.set(-0.24 + i * 0.16, 0.32, 0);
      } else {
        const a = (i / (n - 1) - 0.5) * 1.6;
        ball.position.set(Math.sin(a) * 0.32, 0.3 + Math.cos(a) * 0.12, 0);
      }
      this.group.add(ball);
    }

    this.group.position.y = 0.6;
  }

  get position(): THREE.Vector3 { return this.group.position; }
  get alive(): boolean          { return this._alive; }

  update(dt: number): void {
    if (!this._alive) return;
    this._phase += dt * 2.3;
    this.group.position.y = 0.6 + Math.sin(this._phase) * 0.15;
    this.group.rotation.y += dt * 1.4;
  }

  pickup(): void { this._alive = false; }
  remove(scene: THREE.Scene): void { scene.remove(this.group); }
}
