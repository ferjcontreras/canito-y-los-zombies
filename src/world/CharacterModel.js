// Carga un personaje glTF animado (skinned) una sola vez y crea instancias
// clonadas, cada una con su AnimationMixer. Reusa geometría/materiales.
//
// Modelos: personajes low-poly CC0 de Quaternius (vía poly.pizza). Su rig se
// llama "CharacterArmature" y los clips vienen como "CharacterArmature|Walk",
// etc. — los indexamos por el sufijo (idle/walk/run).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
export class CharacterModel {
    template;
    clips = new Map();
    fitScale = 1;
    footOffset = 0;
    loaded = false;
    /** Carga el glTF y lo auto-escala a `targetHeight` metros (pies al piso). */
    async load(url, targetHeight = 1.8) {
        const gltf = await new GLTFLoader().loadAsync(url);
        this.template = gltf.scene;
        this.template.traverse(o => { if (o.isMesh)
            o.castShadow = true; });
        for (const clip of gltf.animations) {
            const key = clip.name.split('|').pop().toLowerCase(); // "CharacterArmature|Walk" → "walk"
            this.clips.set(key, clip);
        }
        // Actualizar matrices ANTES de medir, si no la bbox ignora la escala interna
        // del glTF y los personajes salen gigantes.
        this.template.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.template);
        const h = box.max.y - box.min.y || 1;
        this.fitScale = targetHeight / h;
        this.footOffset = -box.min.y * this.fitScale;
        this.loaded = true;
    }
    /** Crea una instancia. `yaw` corrige la orientación si el "frente" no es +Z. */
    create(yaw = 0) {
        const model = cloneSkeleton(this.template);
        model.scale.setScalar(this.fitScale);
        model.position.y = this.footOffset;
        model.rotation.y = yaw;
        const group = new THREE.Group();
        group.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const actions = new Map();
        for (const n of ['idle', 'walk', 'run']) {
            const clip = this.clips.get(n);
            if (clip)
                actions.set(n, mixer.clipAction(clip));
        }
        let current = null;
        const play = (name, fade = 0.25) => {
            const a = actions.get(name);
            if (!a || a === current)
                return;
            a.reset().setEffectiveWeight(1).fadeIn(fade).play();
            if (current)
                current.fadeOut(fade);
            current = a;
        };
        play('idle', 0);
        return { group, play, update: (dt) => mixer.update(dt) };
    }
}
