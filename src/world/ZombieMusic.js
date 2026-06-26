// Música procedural de terror/acción para el juego de zombies — generada en
// vivo con WebAudio (sin archivos, libre de derechos). La menor, ~96 BPM:
// drone grave constante, bajo pulsante, kick, redoblante de ruido, pads en
// menor y notas de tensión con eco. La intensidad (0..1) sube en combate:
// más percusión, hi-hats y leads.
//
// Usa un scheduler con "lookahead" (el patrón estándar de WebAudio) para que el
// tempo sea estable sin depender del framerate.
// La menor: i – VI – VII – i  (Am – F – G – Am), 1 acorde por compás.
const CHORDS = [
    { bass: 110.00, pad: [110.00, 130.81, 164.81] }, // Am  (A C E)
    { bass: 87.31, pad: [87.31, 110.00, 130.81] }, // F   (F A C)
    { bass: 98.00, pad: [98.00, 123.47, 146.83] }, // G   (G B D)
    { bass: 110.00, pad: [110.00, 130.81, 164.81] }, // Am
];
// Escala de La menor natural (octava alta) para las notas de tensión
const LEAD = [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0];
// ── Tema: "Canto a Mendoza" ("Mendoza, tierra del sol y del buen vino") ──────
// RECONSTRUCCIÓN de mejor esfuerzo de la melodía del estribillo, llevada a LA
// MENOR para el clima de terror. `d` = semitonos desde La3 (220 Hz); null = rest.
// `b` = duración en tiempos. Corregir acá las notas que suenen mal.
const THEME_BASE = 220; // A3
const THEME = [
    // "Men-do-za"
    { d: 7, b: 1 }, { d: 8, b: 0.5 }, { d: 7, b: 1.5 },
    { d: null, b: 0.5 },
    // "tie-rra del sol"
    { d: 5, b: 0.5 }, { d: 3, b: 0.5 }, { d: 5, b: 0.5 }, { d: 7, b: 2 },
    { d: null, b: 1 },
    // "y del buen vi-no"
    { d: 8, b: 0.5 }, { d: 7, b: 0.5 }, { d: 5, b: 1 }, { d: 3, b: 1 }, { d: 0, b: 2 },
    { d: null, b: 2 },
];
export class ZombieMusic {
    ctx = null;
    master;
    musicGain; // master de música (toggle con M)
    synthBus; // mezcla de la música procedural
    trackGain; // pista real (si existe music.mp3)
    trackLP;
    delay;
    noiseBuf;
    trackLoaded = false;
    trackUrl = 'audio/music.mp3';
    playing = false;
    enabled = true;
    timer = null;
    BPM = 96;
    stepDur = 0; // duración de una semicorchea
    nextTime = 0;
    step = 0;
    bar = 0;
    melIdx = 0;
    melTime = 0;
    intensity = 0; // 0..1, lo sube el juego en combate
    intensityTarget = 0;
    // ── arranque (requiere gesto del usuario) ────────────────────────────────
    unlock() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended')
                this.ctx.resume();
            return;
        }
        const Ctor = window.AudioContext
            ?? window.webkitAudioContext;
        const ctx = new Ctor();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(ctx.destination);
        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = this.enabled ? 0.5 : 0.0;
        this.musicGain.connect(this.master);
        // Dos buses bajo el master de música: el sintetizado y la pista real.
        this.synthBus = ctx.createGain();
        this.synthBus.gain.value = 0.68; // mezcla procedural
        this.synthBus.connect(this.musicGain);
        // Pista real (music.mp3) → filtro que se abre en combate → master de música
        this.trackLP = ctx.createBiquadFilter();
        this.trackLP.type = 'lowpass';
        this.trackLP.frequency.value = 1600;
        this.trackGain = ctx.createGain();
        this.trackGain.gain.value = 0.0; // sube si carga el archivo
        this.trackLP.connect(this.trackGain).connect(this.musicGain);
        // eco para los leads de tensión
        this.delay = ctx.createDelay(0.6);
        this.delay.delayTime.value = 0.32;
        const fb = ctx.createGain();
        fb.gain.value = 0.34;
        this.delay.connect(fb).connect(this.delay);
        this.delay.connect(this.synthBus);
        // buffer de ruido (redoblante / hats)
        const len = ctx.sampleRate;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++)
            d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this._buildDrone();
        this.stepDur = (60 / this.BPM) / 4; // semicorchea
        this.nextTime = ctx.currentTime + 0.1;
        this.melTime = this.nextTime;
        this.playing = true;
        this.timer = window.setInterval(() => this._scheduler(), 25);
        void this._tryLoadTrack();
    }
    // Si existe public/audio/music.mp3 (p.ej. la pista de Udio), la usa en lugar
    // de la música procedural, con un cross-fade.
    async _tryLoadTrack() {
        const ctx = this.ctx;
        try {
            const res = await fetch(this.trackUrl);
            if (!res.ok)
                return;
            const audio = await ctx.decodeAudioData(await res.arrayBuffer());
            const src = ctx.createBufferSource();
            src.buffer = audio;
            src.loop = true;
            src.connect(this.trackLP);
            src.start();
            this.trackLoaded = true;
            const now = ctx.currentTime;
            this.synthBus.gain.setTargetAtTime(0.0, now, 0.8); // baja lo procedural
            this.trackGain.gain.setTargetAtTime(1.0, now, 0.8); // sube la pista real
        }
        catch { /* sin archivo o no decodificable: queda la música procedural */ }
    }
    setEnabled(on) {
        this.enabled = on;
        if (this.ctx)
            this.musicGain.gain.setTargetAtTime(on ? 0.5 : 0.0, this.ctx.currentTime, 0.2);
    }
    toggle() { this.setEnabled(!this.enabled); return this.enabled; }
    /** El juego sube esto cuando hay peligro (zombies cerca, jefes vivos). */
    setIntensity(v) { this.intensityTarget = Math.max(0, Math.min(1, v)); }
    // ── drone grave constante ─────────────────────────────────────────────────
    _buildDrone() {
        const ctx = this.ctx;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 220;
        lp.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.value = 0.16;
        lp.connect(g).connect(this.synthBus);
        for (const f of [55, 82.41]) { // A1 + E2
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.connect(lp);
            o.start();
        }
        // LFO de "respiración" sobre el cutoff
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;
        const lg = ctx.createGain();
        lg.gain.value = 80;
        lfo.connect(lg).connect(lp.frequency);
        lfo.start();
    }
    // ── scheduler ──────────────────────────────────────────────────────────────
    _scheduler() {
        if (!this.ctx)
            return;
        const ctx = this.ctx;
        // suavizar la intensidad
        this.intensity += (this.intensityTarget - this.intensity) * 0.08;
        // Con pista real: no sintetizamos; sólo modulamos el filtro (apagado/lejano
        // cuando hay calma, brillante en combate).
        if (this.trackLoaded) {
            this.trackLP.frequency.setTargetAtTime(650 + this.intensity * 9000, ctx.currentTime, 0.3);
            return;
        }
        if (!this.playing)
            return;
        while (this.nextTime < ctx.currentTime + 0.12) {
            this._step(this.step, this.bar % CHORDS.length, this.nextTime);
            this.nextTime += this.stepDur;
            this.step++;
            if (this.step >= 16) {
                this.step = 0;
                this.bar++;
            }
        }
        // Melodía del "Canto a Mendoza" (tema principal)
        const beat = 60 / this.BPM;
        while (this.melTime < ctx.currentTime + 0.12) {
            const note = THEME[this.melIdx];
            if (note.d !== null) {
                const f = THEME_BASE * Math.pow(2, note.d / 12);
                this._melody(this.melTime, f, note.b * beat * 0.92);
            }
            this.melTime += note.b * beat;
            this.melIdx = (this.melIdx + 1) % THEME.length;
        }
    }
    // ── voz del tema: triángulo + seno detunado, vibrato, eco (fantasmal) ──────
    _melody(t, freq, dur) {
        const ctx = this.ctx;
        const o1 = ctx.createOscillator();
        o1.type = 'triangle';
        o1.frequency.value = freq;
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = freq;
        o2.detune.value = -7;
        // vibrato
        const vib = ctx.createOscillator();
        vib.type = 'sine';
        vib.frequency.value = 5.2;
        const vibg = ctx.createGain();
        vibg.gain.value = freq * 0.013;
        vib.connect(vibg);
        vibg.connect(o1.frequency);
        vibg.connect(o2.frequency);
        vib.start(t);
        vib.stop(t + dur + 0.1);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1100 + this.intensity * 1900;
        const g = ctx.createGain();
        const lvl = 0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(lvl, t + 0.06);
        g.gain.setValueAtTime(lvl, t + Math.max(0.1, dur - 0.14));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o1.connect(lp);
        o2.connect(lp);
        lp.connect(g);
        g.connect(this.synthBus);
        g.connect(this.delay); // eco
        o1.start(t);
        o2.start(t);
        o1.stop(t + dur + 0.05);
        o2.stop(t + dur + 0.05);
    }
    _step(step, chordIdx, t) {
        const ch = CHORDS[chordIdx];
        const I = this.intensity;
        // Kick en tiempos 1 y 3
        if (step === 0 || step === 8)
            this._kick(t);
        // Redoblante (ruido) en 2 y 4 — más fuerte con intensidad
        if (step === 4 || step === 12)
            this._noise(t, 0.12 + I * 0.22, 0.18, 1200);
        // Hi-hats en las semicorcheas impares cuando hay tensión
        if (I > 0.35 && step % 2 === 1)
            this._noise(t, 0.04 + I * 0.06, 0.05, 6000);
        // Bajo pulsante en corcheas
        if (step % 2 === 0) {
            const accent = step % 4 === 0 ? 1 : 0.7;
            this._bass(t, ch.bass, (0.13 + I * 0.12) * accent);
        }
        // Pad en menor al inicio de cada compás
        if (step === 0)
            this._pad(t, ch.pad, (60 / this.BPM) * 4 * 0.95);
        // Nota de tensión (con eco): sólo en pleno combate, para no tapar el tema.
        if (I > 0.6 && (step === 6 || step === 10) && Math.random() < I * 0.2) {
            const f = LEAD[(Math.random() * LEAD.length) | 0] * (Math.random() < 0.3 ? 2 : 1);
            this._lead(t, f, 0.05 + I * 0.06);
        }
    }
    // ── voces ────────────────────────────────────────────────────────────────
    _kick(t) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sine';
        const g = ctx.createGain();
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
        o.connect(g).connect(this.synthBus);
        o.start(t);
        o.stop(t + 0.22);
    }
    _bass(t, freq, level) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 380 + this.intensity * 900;
        lp.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(lp).connect(g).connect(this.synthBus);
        o.start(t);
        o.stop(t + 0.2);
    }
    _noise(t, level, dur, hp) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        src.playbackRate.value = 1 + Math.random() * 0.3;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = hp;
        const g = ctx.createGain();
        g.gain.setValueAtTime(level, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(this.synthBus);
        src.start(t);
        src.stop(t + dur + 0.02);
    }
    _pad(t, freqs, dur) {
        const ctx = this.ctx;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900 + this.intensity * 700;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.4); // ataque lento
        g.gain.setValueAtTime(0.05, t + dur - 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        lp.connect(g).connect(this.synthBus);
        for (const fr of freqs) {
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = fr * 2; // octava media
            o.detune.value = (Math.random() - 0.5) * 8; // coro leve
            o.connect(lp);
            o.start(t);
            o.stop(t + dur + 0.05);
        }
    }
    _lead(t, freq, level) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(level, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g);
        g.connect(this.synthBus);
        g.connect(this.delay); // eco
        o.start(t);
        o.stop(t + 0.55);
    }
}
