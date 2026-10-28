import * as THREE from 'three';
const MAT_BOX = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, flatShading: true });
const MAT_GLOW = {
    metralla: new THREE.MeshBasicMaterial({ color: 0x40e0ff }),
    escopeta: new THREE.MeshBasicMaterial({ color: 0xff40c0 }),
};
const GEO_BOX = new THREE.BoxGeometry(0.7, 0.45, 0.45);
const GEO_BALL = new THREE.SphereGeometry(0.12, 8, 6);
export class WeaponPickup {
    group;
    kind;
    _alive = true;
    _phase = Math.random() * Math.PI * 2;
    static PICKUP_R = 1.6;
    constructor(kind) {
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
            }
            else {
                const a = (i / (n - 1) - 0.5) * 1.6;
                ball.position.set(Math.sin(a) * 0.32, 0.3 + Math.cos(a) * 0.12, 0);
            }
            this.group.add(ball);
        }
        this.group.position.y = 0.6;
    }
    get position() { return this.group.position; }
    get alive() { return this._alive; }
    update(dt) {
        if (!this._alive)
            return;
        this._phase += dt * 2.3;
        this.group.position.y = 0.6 + Math.sin(this._phase) * 0.15;
        this.group.rotation.y += dt * 1.4;
    }
    pickup() { this._alive = false; }
    remove(scene) { scene.remove(this.group); }
}
