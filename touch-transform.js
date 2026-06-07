/* touch-transform.js — Android/iOS touch: move, pinch-scale, 2-finger rotate */
import { state, dom } from './state.js';
import { saveSnapshot } from './utils.js';
import { renderPreviewSilent } from './preview.js';

/* ── Helpers to read/write static or first-keyframe values ── */
function getKV(prop) {
    if (!prop) return null;
    return prop.a === 1 && Array.isArray(prop.k) ? prop.k[0]?.s : prop.k;
}
function setKV(prop, val) {
    if (!prop) return;
    if (prop.a === 1 && Array.isArray(prop.k)) {
        prop.k.forEach(kf => { if (kf.s) kf.s = Array.isArray(val) ? [...val] : [val]; });
    } else {
        prop.k = Array.isArray(val) ? [...val] : val;
    }
}
function getKVScalar(prop) {
    if (!prop) return 0;
    if (prop.a === 1 && Array.isArray(prop.k)) return prop.k[0]?.s?.[0] ?? prop.k[0] ?? 0;
    return Array.isArray(prop.k) ? prop.k[0] : prop.k ?? 0;
}
function setKVScalar(prop, val) {
    if (!prop) return;
    if (prop.a === 1 && Array.isArray(prop.k)) {
        prop.k.forEach(kf => { if (kf.s) kf.s[0] = val; if (kf.e) kf.e[0] = val; });
    } else { prop.k = val; }
}

/* ── Geometry helpers ── */
function dist(a, b) {
    const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.sqrt(dx*dx + dy*dy);
}
function angle(a, b) {
    return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;
}
function selectedEntries() {
    return [...(state.selectedLayerIndices||new Set())]
        .map(i => state.flatLayers[i])
        .filter(e => e?.layer?.ks);
}

/* ── Touch state ── */
const T = {
    active: false, mode: 'none',
    snapped: false,
    startX: 0, startY: 0,
    startPositions: [],
    startDist: 0, startAngle: 0,
    startScales: [], startRotations: [],
};

export function initTouchTransform() {
    const player = dom.lottiePlayer || document.getElementById('lottie-player');
    if (!player) { console.warn('[touch-transform] lottiePlayer not found'); return; }

    player.addEventListener('touchstart',  onStart,  { passive: false });
    player.addEventListener('touchmove',   onMove,   { passive: false });
    player.addEventListener('touchend',    onEnd,    { passive: false });
    player.addEventListener('touchcancel', onEnd,    { passive: false });
}

function onStart(e) {
    if (!state.lottieData || !state.selectedLayerIndices?.size) return;
    e.preventDefault();

    if (!T.snapped) { saveSnapshot(); T.snapped = true; }
    T.active = true;

    const entries = selectedEntries();

    if (e.touches.length === 1) {
        T.mode   = 'move';
        T.startX = e.touches[0].clientX;
        T.startY = e.touches[0].clientY;
        T.startPositions = entries.map(en => {
            const p = getKV(en.layer.ks.p) || [0, 0, 0];
            return { en, x: p[0], y: p[1] };
        });
    } else {
        T.mode       = 'pinch';
        T.startDist  = dist(e.touches[0], e.touches[1]);
        T.startAngle = angle(e.touches[0], e.touches[1]);
        T.startScales = entries.map(en => {
            const sc = getKV(en.layer.ks.s) || [100, 100, 100];
            return { en, sx: sc[0], sy: sc[1], sz: sc[2] || 100 };
        });
        T.startRotations = entries.map(en => ({
            en, r: getKVScalar(en.layer.ks.r) || 0,
        }));
    }

    if (state.anim && state.isPlaying) state.anim.pause();
}

function onMove(e) {
    if (!T.active) return;
    e.preventDefault();

    // Get preview canvas scale so movement maps correctly
    const previewEl = dom.lottiePlayer || document.getElementById('lottie-player');
    const scaleX = previewEl ? (state.lottieData?.w || 512) / previewEl.offsetWidth  : 1;
    const scaleY = previewEl ? (state.lottieData?.h || 512) / previewEl.offsetHeight : 1;

    if (T.mode === 'move' && e.touches.length >= 1) {
        const dx = (e.touches[0].clientX - T.startX) * scaleX;
        const dy = (e.touches[0].clientY - T.startY) * scaleY;
        T.startPositions.forEach(({ en, x, y }) => {
            if (!en.layer.ks.p) return;
            setKV(en.layer.ks.p, [Math.round(x + dx), Math.round(y + dy), 0]);
        });
        renderPreviewSilent({ stopPlayback: false });

    } else if (T.mode === 'pinch' && e.touches.length >= 2) {
        const d = dist(e.touches[0], e.touches[1]);
        const a = angle(e.touches[0], e.touches[1]);
        const ratio = T.startDist > 0 ? d / T.startDist : 1;
        const dAngle = a - T.startAngle;

        T.startScales.forEach(({ en, sx, sy, sz }) => {
            if (!en.layer.ks.s) en.layer.ks.s = { a: 0, k: [100, 100, 100] };
            setKV(en.layer.ks.s, [
                Math.round(sx * ratio * 10) / 10,
                Math.round(sy * ratio * 10) / 10,
                sz,
            ]);
        });
        T.startRotations.forEach(({ en, r }) => {
            if (!en.layer.ks.r) en.layer.ks.r = { a: 0, k: 0 };
            setKVScalar(en.layer.ks.r, Math.round((r + dAngle) * 10) / 10);
        });
        renderPreviewSilent({ stopPlayback: false });
    }
}

function onEnd(e) {
    if (!T.active) return;
    if (e.touches.length === 0) {
        T.active = false; T.mode = 'none'; T.snapped = false;
        if (state.anim && state.isPlaying) state.anim.play();
    } else if (e.touches.length === 1 && T.mode === 'pinch') {
        // Dropped one finger, switch back to move
        T.mode   = 'move';
        T.startX = e.touches[0].clientX;
        T.startY = e.touches[0].clientY;
        T.startPositions = selectedEntries().map(en => {
            const p = getKV(en.layer.ks.p) || [0, 0, 0];
            return { en, x: p[0], y: p[1] };
        });
    }
}
