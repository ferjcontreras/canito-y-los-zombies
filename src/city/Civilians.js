// Civiles aterrados (modelos low-poly CC0 animados) que escapan de los zombies.
// Cuando un zombie ALCANZA a uno, no lo convierte al toque: lo AGARRA y queda
// sosteniéndolo con una cuenta regresiva de 10 s sobre la cabeza. Si Canito mata
// a ese zombie antes de 0 → la persona se SALVA (recompensa). Si no → se
// transforma en zombie.
import * as THREE from 'three';
const COL_HALF = 0.45;
const FAR = { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 };
const DANGER = 46; // ven un zombie a esta distancia → huyen aterrados
const GRAB_RANGE = 1.7;
const GRAB_TIME = 10; // segundos para rescatarlo antes de convertirse
const FLEE_MULT = 2.2;
// ── Cartelito de cuenta regresiva (sprite que mira a la cámara) ──────────────
const _numMat = new Map();
function numberMaterial(n) {
    const cached = _numMat.get(n);
    if (cached)
        return cached;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.beginPath();
    c.arc(64, 64, 56, 0, Math.PI * 2);
    c.fillStyle = n <= 3 ? 'rgba(200,24,24,0.94)' : 'rgba(24,22,26,0.82)';
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = n <= 3 ? '#ffd2d2' : '#ff5a4a';
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = 'bold 78px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(n), 64, 72);
    const t = new THREE.CanvasTexture(cv);
    const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
    _numMat.set(n, m);
    return m;
}
export class CivilianManager {
    civs = [];
    _cols = [];
    constructor(scene, count, spawn, models) {
        for (let i = 0; i < count; i++) {
            const model = models[(Math.random() * models.length) | 0];
            const inst = model.create();
            const [x, z] = spawn();
            inst.group.position.set(x, 0, z);
            scene.add(inst.group);
            const col = { minX: x - COL_HALF, maxX: x + COL_HALF, minZ: z - COL_HALF, maxZ: z + COL_HALF };
            this._cols.push(col);
            this.civs.push({
                inst, x, z, tx: x, tz: z, state: 'flee', scared: false, anim: 'idle',
                speed: 1.6 + Math.random() * 0.8, grabBy: null, grabT: 0, sprite: null, lastSec: -1, col,
            });
        }
    }
    colliders() { return this._cols; }
    /** Mata civiles vivos en el radio (atropello de autos). */
    killArea(x, z, r) {
        let n = 0;
        for (let i = this.civs.length - 1; i >= 0; i--) {
            const c = this.civs[i];
            if (Math.hypot(c.x - x, c.z - z) < r) {
                if (c.grabBy)
                    c.grabBy.grabbing = false;
                Object.assign(c.col, FAR);
                c.inst.group.parent?.remove(c.inst.group);
                this.civs.splice(i, 1);
                n++;
            }
        }
        return n;
    }
    /** El civil vivo (no agarrado) más cercano — para que los zombies lo cacen. */
    nearest(x, z) {
        let best = Infinity, bx = 0, bz = 0, found = false;
        for (const c of this.civs) {
            if (c.state === 'grabbed')
                continue;
            const d = Math.hypot(c.x - x, c.z - z);
            if (d < best) {
                best = d;
                bx = c.x;
                bz = c.z;
                found = true;
            }
        }
        return found ? { x: bx, z: bz, d: best } : null;
    }
    positions(out) {
        for (const c of this.civs)
            if (c.state !== 'grabbed')
                out.push({ x: c.x, z: c.z });
    }
    _anim(c, name) {
        if (c.anim === name)
            return;
        c.anim = name;
        c.inst.play(name);
    }
    /** Actualiza los civiles. Devuelve dónde nacen zombies (convertidos). `onSave`
     *  se llama al rescatar a una persona (recompensa). */
    update(dt, zombies, colliders, scene, px = 0, pz = 0, onSave) {
        const born = [];
        const now = performance.now();
        const CULL2 = 175 * 175;
        for (let i = this.civs.length - 1; i >= 0; i--) {
            const c = this.civs[i];
            // ── Agarrado: forcejea con la cuenta regresiva ──────────────────────────
            if (c.state === 'grabbed') {
                const z = c.grabBy;
                if (!z || !z.alive) {
                    if (c.sprite) {
                        c.inst.group.remove(c.sprite);
                        c.sprite = null;
                    }
                    c.inst.group.rotation.z = 0;
                    c.inst.group.position.y = 0;
                    c.state = 'flee';
                    c.grabBy = null;
                    onSave?.(c.x, c.z);
                    continue;
                }
                c.grabT -= dt;
                const sec = Math.max(0, Math.ceil(c.grabT));
                if (sec !== c.lastSec && c.sprite) {
                    c.sprite.material = numberMaterial(sec);
                    c.lastSec = sec;
                }
                c.inst.group.position.set(c.x, 0.1, c.z);
                c.inst.group.rotation.z = Math.sin(now * 0.03) * 0.22; // forcejeo
                this._anim(c, 'idle');
                if (c.inst.group.visible)
                    c.inst.update(dt);
                if (c.grabT <= 0) {
                    born.push([c.x, c.z]);
                    z.grabbing = false;
                    if (c.sprite)
                        c.inst.group.remove(c.sprite);
                    scene.remove(c.inst.group);
                    Object.assign(c.col, FAR);
                    this.civs.splice(i, 1);
                }
                continue;
            }
            // ── Culling: civiles lejos del jugador se congelan e invisibilizan ──────
            const ddx = c.x - px, ddz = c.z - pz;
            if (ddx * ddx + ddz * ddz > CULL2) {
                let gz = null, gd = Infinity;
                for (const z of zombies) {
                    if (!z.alive || z.grabbing)
                        continue;
                    const d = Math.hypot(z.position.x - c.x, z.position.z - c.z);
                    if (d < gd) {
                        gd = d;
                        gz = z;
                    }
                }
                if (gz && gd < GRAB_RANGE)
                    this._grab(c, gz);
                if (c.inst.group.visible)
                    c.inst.group.visible = false;
                continue;
            }
            if (!c.inst.group.visible)
                c.inst.group.visible = true;
            // ── Zombie más cercano (vivo) ───────────────────────────────────────────
            let nz = null, nd = Infinity, nzx = 0, nzz = 0;
            for (const z of zombies) {
                if (!z.alive)
                    continue;
                const d = Math.hypot(z.position.x - c.x, z.position.z - c.z);
                if (d < nd) {
                    nd = d;
                    nz = z;
                    nzx = z.position.x;
                    nzz = z.position.z;
                }
            }
            if (nz && nd < GRAB_RANGE && !nz.grabbing) {
                this._grab(c, nz);
                continue;
            }
            c.scared = !!nz && nd < DANGER;
            if (c.scared) {
                const ax = c.x - nzx, az = c.z - nzz, ad = Math.hypot(ax, az) || 1;
                c.tx = c.x + (ax / ad) * 16;
                c.tz = c.z + (az / ad) * 16;
            }
            // ── Movimiento (aterrado: siempre en pánico) ────────────────────────────
            const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
            if (d < 0.6) {
                if (!c.scared) {
                    c.tx = c.x + (Math.random() - 0.5) * 30;
                    c.tz = c.z + (Math.random() - 0.5) * 30;
                }
                this._anim(c, 'idle');
            }
            else {
                const spd = c.speed * (c.scared ? FLEE_MULT : 1.3) * dt;
                const ux = dx / d, uz = dz / d;
                const nx = c.x + ux * spd, nz2 = c.z + uz * spd;
                if (!this._hits(nx, c.z, colliders))
                    c.x = nx;
                if (!this._hits(c.x, nz2, colliders))
                    c.z = nz2;
                c.inst.group.rotation.y = Math.atan2(ux, uz);
                this._anim(c, c.scared ? 'run' : 'walk');
            }
            c.inst.group.position.set(c.x, 0, c.z);
            c.inst.update(dt); // sólo para los cercanos
            c.col.minX = c.x - COL_HALF;
            c.col.maxX = c.x + COL_HALF;
            c.col.minZ = c.z - COL_HALF;
            c.col.maxZ = c.z + COL_HALF;
        }
        return born;
    }
    _grab(c, z) {
        c.state = 'grabbed';
        c.grabBy = z;
        c.grabT = GRAB_TIME;
        z.grabbing = true;
        const spr = new THREE.Sprite(numberMaterial(GRAB_TIME));
        spr.scale.set(1.4, 1.4, 1);
        spr.position.set(0, 2.4, 0);
        c.inst.group.add(spr);
        c.sprite = spr;
        c.lastSec = GRAB_TIME;
    }
    _hits(x, z, colliders) {
        const r = 0.4;
        for (const c of colliders)
            if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ)
                return true;
        return false;
    }
}
