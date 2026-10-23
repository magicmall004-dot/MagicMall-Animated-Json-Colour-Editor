/**
 * tlottie-player.js
 * JavaScript wrapper for the tlottie WebAssembly renderer.
 *
 * API surface the WASM exports (C ABI, no wasm-bindgen):
 *   tlottie_alloc(len)                         → ptr
 *   tlottie_free(ptr, len)
 *   tlottie_new(json_ptr, json_len)             → inst
 *   tlottie_new_with_options(...)               → inst
 *   tlottie_drop(inst)
 *   tlottie_width(inst)                         → u32
 *   tlottie_height(inst)                        → u32
 *   tlottie_frame_rate(inst)                    → f32
 *   tlottie_frame_count(inst)                   → u32
 *   tlottie_render(inst, frame, w, h, aa)       → *const u8 (RGBA)
 *   tlottie_render_with_options(inst,f,w,h,aa,tol) → *const u8
 */

'use strict';

/* ─── singleton loader ──────────────────────────────────────────── */

const _state = {
  /** @type {WebAssembly.Exports|null} */
  exports: null,
  /** @type {WebAssembly.Memory|null} */
  memory: null,
  ready: false,
  failed: false,
  /** @type {Promise<boolean>|null} */
  loading: null,
};

/**
 * Load tlottie.wasm once.  Subsequent calls return the same promise.
 * @param {string} [wasmUrl='tlottie.wasm']
 * @returns {Promise<boolean>} true if loaded successfully
 */
export async function loadTlottie(wasmUrl = 'tlottie.wasm') {
  if (_state.ready)  return true;
  if (_state.failed) return false;
  if (_state.loading) return _state.loading;

  _state.loading = (async () => {
    try {
      let result;
      // instantiateStreaming requires the correct MIME type (application/wasm).
      // Fallback for servers that serve .wasm as octet-stream.
      try {
        result = await WebAssembly.instantiateStreaming(fetch(wasmUrl), {});
      } catch (_) {
        const buf = await fetch(wasmUrl).then(r => r.arrayBuffer());
        result = await WebAssembly.instantiate(buf, {});
      }
      _state.exports = result.instance.exports;
      _state.memory  = /** @type {WebAssembly.Memory} */ (_state.exports.memory);
      _state.ready   = true;
      console.info('[tlottie] WASM loaded ✓');
      return true;
    } catch (e) {
      _state.failed = true;
      console.warn('[tlottie] WASM load failed — falling back to lottie-web', e);
      return false;
    }
  })();

  return _state.loading;
}

/** True after loadTlottie() resolves successfully. */
export function isTlottieReady() { return _state.ready; }

/* ─── low-level helpers ─────────────────────────────────────────── */

function exp() {
  if (!_state.exports) throw new Error('tlottie not loaded');
  return _state.exports;
}
function mem() { return /** @type {WebAssembly.Memory} */ (_state.memory); }

/**
 * Copy bytes into WASM memory, call fn(ptr, len), then free.
 * Returns the function result.
 */
function withWasmBytes(bytes, fn) {
  const e = exp();
  const len = bytes.length;
  const ptr = e.tlottie_alloc(len);
  if (!ptr) throw new Error('tlottie_alloc returned null (OOM?)');
  new Uint8Array(mem().buffer, ptr, len).set(bytes);
  try {
    return fn(ptr, len);
  } finally {
    e.tlottie_free(ptr, len);
  }
}

/* ─── TlottieInstance ───────────────────────────────────────────── */

/**
 * A parsed Lottie composition managed by tlottie.
 * Create via TlottiePlayer.parse() — do not construct directly.
 */
class TlottieInstance {
  /** @param {number} ptr - raw WASM pointer */
  constructor(ptr) {
    this._ptr = ptr;
  }

  get isAlive() { return this._ptr !== 0; }

  get width()      { return this.isAlive ? exp().tlottie_width(this._ptr)       : 0; }
  get height()     { return this.isAlive ? exp().tlottie_height(this._ptr)      : 0; }
  get frameRate()  { return this.isAlive ? exp().tlottie_frame_rate(this._ptr)  : 30; }
  get frameCount() { return this.isAlive ? exp().tlottie_frame_count(this._ptr) : 0; }
  get duration()   { return this.frameCount / (this.frameRate || 30); }

  /**
   * Render one frame.  Returns a Uint8ClampedArray view (RGBA, un-premultiplied)
   * into WASM memory.  The view is invalidated by the next render() call or
   * by destroy() — copy it before then (ImageData constructor does this).
   *
   * @param {number} frame  - float frame index (e.g. 0, 0.5, 1 …)
   * @param {number} width  - canvas pixel width
   * @param {number} height - canvas pixel height
   * @param {boolean} [antialias=true]
   * @returns {Uint8ClampedArray|null}
   */
  render(frame, width, height, antialias = true) {
    if (!this.isAlive) return null;
    const ptr = exp().tlottie_render(
      this._ptr,
      frame,
      width >>> 0,
      height >>> 0,
      antialias ? 1 : 0,
    );
    if (!ptr) return null;
    return new Uint8ClampedArray(mem().buffer, ptr, width * height * 4);
  }

  /** Free the underlying WASM allocation. */
  destroy() {
    if (this.isAlive) {
      exp().tlottie_drop(this._ptr);
      this._ptr = 0;
    }
  }
}

/* ─── TlottiePlayer ─────────────────────────────────────────────── */

/**
 * High-level animated canvas player backed by tlottie WASM.
 *
 * Usage:
 *   const player = new TlottiePlayer(canvasEl);
 *   await player.load(jsonBytesOrString);
 *   player.play();
 */
export class TlottiePlayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {boolean} [opts.antialias=true]
   * @param {boolean} [opts.loop=true]
   * @param {boolean} [opts.autoplay=true]
   * @param {function(number,number):void} [opts.onFrame]  - cb(currentFrame, totalFrames)
   * @param {function():void} [opts.onComplete]
   */
  constructor(canvas, opts = {}) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.antialias = opts.antialias  ?? true;
    this.loop      = opts.loop       ?? true;
    this.autoplay  = opts.autoplay   ?? true;
    this.onFrame   = opts.onFrame    ?? null;
    this.onComplete = opts.onComplete ?? null;

    /** @type {TlottieInstance|null} */
    this._inst    = null;
    this._rafId   = null;
    this._playing = false;
    this._frame   = 0;      // logical float frame
    this._lastTs  = null;   // RAF timestamp
    this._speed   = 1.0;
    this._destroyed = false;
  }

  /* ── public getters ── */
  get isPlaying()  { return this._playing; }
  get currentFrame(){ return this._frame; }
  get frameCount() { return this._inst?.frameCount ?? 0; }
  get frameRate()  { return this._inst?.frameRate  ?? 30; }
  get duration()   { return this._inst?.duration   ?? 0; }
  get naturalWidth() { return this._inst?.width ?? 0; }
  get naturalHeight(){ return this._inst?.height ?? 0; }

  /**
   * Parse and display a Lottie JSON.
   * @param {Uint8Array|string|object} json
   * @returns {boolean} false if parsing failed
   */
  load(json) {
    let bytes;
    if (typeof json === 'string') {
      bytes = new TextEncoder().encode(json);
    } else if (json instanceof Uint8Array) {
      bytes = json;
    } else {
      bytes = new TextEncoder().encode(JSON.stringify(json));
    }

    let inst;
    try {
      const ptr = withWasmBytes(bytes, (ptr, len) =>
        exp().tlottie_new(ptr, len)
      );
      if (!ptr) {
        console.warn('[tlottie] parse returned null — invalid Lottie JSON?');
        return false;
      }
      inst = new TlottieInstance(ptr);
    } catch (e) {
      console.warn('[tlottie] parse error', e);
      return false;
    }

    // replace old instance
    this._stop();
    this._inst?.destroy();
    this._inst = inst;
    this._frame = 0;
    this._lastTs = null;

    // size canvas to animation's native size (CSS will scale it)
    this._sizeCanvas();
    this._renderFrame(0);

    if (this.autoplay) this.play();
    return true;
  }

  /**
   * Re-parse updated JSON (e.g. after colour edits) without resetting playback.
   * @param {Uint8Array|string|object} json
   */
  reload(json) {
    const wasPlaying = this._playing;
    const frame = this._frame;
    if (this.load(json)) {
      // restore position
      this._frame = Math.min(frame, this.frameCount - 1);
      this._renderFrame(this._frame);
      if (!wasPlaying) this.pause();
    }
  }

  play() {
    if (this._playing || !this._inst || this._destroyed) return;
    this._playing = true;
    this._lastTs  = null;
    this._rafId   = requestAnimationFrame(ts => this._tick(ts));
  }

  pause() {
    this._stop();
    this._playing = false;
  }

  /** Seek to a specific frame (float allowed). */
  seekTo(frame) {
    this._frame = Math.max(0, Math.min(frame, this.frameCount - 1));
    this._renderFrame(this._frame);
  }

  /** @param {number} speed  e.g. 0.5 = half speed, 2 = double */
  setSpeed(speed) { this._speed = speed; }

  /** Destroy this player and free WASM memory. */
  destroy() {
    this._stop();
    this._inst?.destroy();
    this._inst = null;
    this._destroyed = true;
  }

  /* ── private ── */

  _stop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._playing = false;
  }

  _sizeCanvas() {
    if (!this._inst) return;
    const w = this._inst.width  || 512;
    const h = this._inst.height || 512;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
    }
  }

  _renderFrame(frame) {
    if (!this._inst || !this.ctx) return;
    const { width: w, height: h } = this.canvas;
    if (w === 0 || h === 0) return;

    const rgba = this._inst.render(frame, w, h, this.antialias);
    if (!rgba) return;

    // ImageData constructor copies the bytes out of WASM memory
    const imageData = new ImageData(rgba.slice(), w, h);
    this.ctx.putImageData(imageData, 0, 0);

    this.onFrame?.(Math.round(frame), this.frameCount);
  }

  _tick(ts) {
    if (!this._playing || this._destroyed) return;

    if (this._lastTs === null) this._lastTs = ts;
    const elapsed = (ts - this._lastTs) / 1000; // seconds
    this._lastTs = ts;

    const fps = this.frameRate || 30;
    this._frame += elapsed * fps * this._speed;

    const total = this.frameCount;

    if (this._frame >= total) {
      if (this.loop) {
        this._frame = this._frame % total;
      } else {
        this._frame = total - 1;
        this._renderFrame(this._frame);
        this.onFrame?.(Math.round(this._frame), total);
        this.onComplete?.();
        this._playing = false;
        this._rafId = null;
        return;
      }
    }

    this._renderFrame(this._frame);
    this._rafId = requestAnimationFrame(ts2 => this._tick(ts2));
  }
}
