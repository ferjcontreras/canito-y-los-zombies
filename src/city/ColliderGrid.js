export class ColliderGrid {
    _cell;
    _cells;
    _dynamic = [];
    /** `share` reusa el índice estático de otro grid (ver `view`). */
    constructor(cell = 16, share) {
        this._cell = cell;
        this._cells = share ?? new Map();
    }
    // Clave de celda empaquetada en un entero (el mundo cabe holgado en ±4096).
    static _key(ix, iz) {
        return (ix + 4096) * 8192 + (iz + 4096);
    }
    /** Indexa colliders que NO se mueven. */
    addStatic(list) {
        const cs = this._cell;
        for (const ab of list) {
            if (ab.minX > 1e5)
                continue; // collider "apagado" (auto explotado)
            const ix1 = Math.floor(ab.maxX / cs), iz1 = Math.floor(ab.maxZ / cs);
            for (let ix = Math.floor(ab.minX / cs); ix <= ix1; ix++) {
                for (let iz = Math.floor(ab.minZ / cs); iz <= iz1; iz++) {
                    const k = ColliderGrid._key(ix, iz);
                    const b = this._cells.get(k);
                    if (b)
                        b.push(ab);
                    else
                        this._cells.set(k, [ab]);
                }
            }
        }
        return this;
    }
    /** Agrega una capa de colliders móviles (se recorre entera en cada consulta). */
    addDynamic(list) { this._dynamic.push(list); return this; }
    /** Otra vista del MISMO índice estático, con capas dinámicas extra. */
    view(...dynamic) {
        const g = new ColliderGrid(this._cell, this._cells);
        for (const d of this._dynamic)
            g._dynamic.push(d);
        for (const d of dynamic)
            g._dynamic.push(d);
        return g;
    }
    /** ¿El cuadrado de lado 2r centrado en (x,z) pisa algún collider? */
    hits(x, z, r) {
        const minX = x - r, maxX = x + r, minZ = z - r, maxZ = z + r;
        const cs = this._cell;
        const ix1 = Math.floor(maxX / cs), iz1 = Math.floor(maxZ / cs);
        for (let ix = Math.floor(minX / cs); ix <= ix1; ix++) {
            for (let iz = Math.floor(minZ / cs); iz <= iz1; iz++) {
                const b = this._cells.get(ColliderGrid._key(ix, iz));
                if (!b)
                    continue;
                for (const c of b)
                    if (maxX > c.minX && minX < c.maxX && maxZ > c.minZ && minZ < c.maxZ)
                        return true;
            }
        }
        for (const list of this._dynamic)
            for (const c of list)
                if (maxX > c.minX && minX < c.maxX && maxZ > c.minZ && minZ < c.maxZ)
                    return true;
        return false;
    }
    /** Candidatos alrededor de (x,z) dentro de `r`, volcados en `out` (que se
     *  vacía primero). Sirve para hacer varias pruebas seguidas — el paso de
     *  colisión por eje — sin recorrer el grid cada vez. Puede repetir un
     *  collider que abarque varias celdas: para pruebas booleanas da igual. */
    near(x, z, r, out) {
        out.length = 0;
        const minX = x - r, maxX = x + r, minZ = z - r, maxZ = z + r;
        const cs = this._cell;
        const ix1 = Math.floor(maxX / cs), iz1 = Math.floor(maxZ / cs);
        for (let ix = Math.floor(minX / cs); ix <= ix1; ix++) {
            for (let iz = Math.floor(minZ / cs); iz <= iz1; iz++) {
                const b = this._cells.get(ColliderGrid._key(ix, iz));
                if (!b)
                    continue;
                for (const c of b)
                    if (maxX > c.minX && minX < c.maxX && maxZ > c.minZ && minZ < c.maxZ)
                        out.push(c);
            }
        }
        for (const list of this._dynamic)
            for (const c of list)
                if (maxX > c.minX && minX < c.maxX && maxZ > c.minZ && minZ < c.maxZ)
                    out.push(c);
        return out;
    }
}
