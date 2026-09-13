
/* ══════════════════════════════════════════════════════════════
   TLOTTIE INTEGRATION PATCH
   Replaces the lottie-web preview canvas with the tlottie WASM
   renderer when tlottie.wasm is available next to index.html.
   Falls back to lottie-web transparently on failure.
   ══════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── state ── */
  let tlottiePlayer = null;   // TlottiePlayer instance or null
  let tlottieActive = false;  // true when tlottie is rendering the preview
  let tlottieReady  = false;  // true after WASM loaded OK
  let tlottieCanvas = null;   // <canvas> element

  /* ── create canvas inside canvasWrap ── */
  function injectCanvas() {
    const wrap = document.getElementById('canvasWrap');
    if (!wrap || document.getElementById('tlottie-canvas')) return;
    const cv = document.createElement('canvas');
    cv.id = 'tlottie-canvas';
    cv.style.cssText = [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'object-fit:contain',
      'display:none',
      'image-rendering:auto',
    ].join(';');
    wrap.appendChild(cv);
    tlottieCanvas = cv;
  }

  /* ── load WASM ── */
  async function initTlottie() {
    try {
      const { loadTlottie, TlottiePlayer, isTlottieReady } = await import('./tlottie-player.js');
      const ok = await loadTlottie('tlottie.wasm');
      if (!ok) return;
      tlottieReady = true;

      injectCanvas();

      tlottiePlayer = new TlottiePlayer(tlottieCanvas, {
        antialias: true,
        loop: true,
        autoplay: false,
        onFrame(frame, total) {
          // keep the existing scrubber + counter in sync
          if (!window.sliderDragging) {
            const fs = document.getElementById('frameSlider');
            const fl = document.getElementById('frameLabel');
            if (fs) fs.value = frame;
            if (fl) fl.textContent = frame;
          }
        },
      });

      // patch the indicator badge
      setRendererBadge('tlottie');
      console.info('[tlottie] Player ready ✓');
    } catch (e) {
      console.warn('[tlottie] init failed, using lottie-web', e);
    }
  }

  /* ── show which renderer is active ── */
  function setRendererBadge(mode) {
    let badge = document.getElementById('renderer-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'renderer-badge';
      badge.style.cssText = 'font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;margin-left:6px;letter-spacing:.04em;';
      const info = document.getElementById('animInfo');
      if (info) info.parentNode.insertBefore(badge, info.nextSibling);
    }
    if (mode === 'tlottie') {
      badge.textContent = 'TLOTTIE';
      badge.style.background = 'rgba(16,185,129,.15)';
      badge.style.color = '#10b981';
      badge.style.border = '1px solid rgba(16,185,129,.3)';
    } else {
      badge.textContent = 'LOTTIE-WEB';
      badge.style.background = 'rgba(11,132,255,.12)';
      badge.style.color = '#0b84ff';
      badge.style.border = '1px solid rgba(11,132,255,.22)';
    }
  }

  /* ── switch between renderers ── */
  function activateTlottie(show) {
    tlottieActive = show;
    const animDiv = document.getElementById('anim');
    if (tlottieCanvas) tlottieCanvas.style.display = show ? 'block' : 'none';
    if (animDiv)       animDiv.style.display        = show ? 'none' : 'block';
    setRendererBadge(show ? 'tlottie' : 'lottie-web');
  }

  /* ── patch reloadAnim ── */
  const _originalReloadAnim = window.reloadAnim || function(){};

  window.reloadAnim = function patchedReloadAnim() {
    // always run lottie-web for color extraction + BA mode
    _originalReloadAnim();

    if (!tlottieReady || !tlottiePlayer || !window.animData) {
      activateTlottie(false);
      return;
    }

    try {
      const jsonBytes = new TextEncoder().encode(JSON.stringify(window.animData));
      const ok = tlottiePlayer.load(jsonBytes);
      if (!ok) { activateTlottie(false); return; }

      activateTlottie(true);

      // sync play state
      if (!window.playerPaused) {
        tlottiePlayer.play();
      } else {
        tlottiePlayer.pause();
        const f = parseFloat(document.getElementById('frameSlider')?.value || '0');
        tlottiePlayer.seekTo(f);
      }
    } catch (e) {
      console.warn('[tlottie] reloadAnim error', e);
      activateTlottie(false);
    }
  };

  /* ── patch play/pause button ── */
  document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('playPauseBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!tlottieActive || !tlottiePlayer) return;
        // tlottie mirrors the playerPaused flag (toggled before our listener fires)
        setTimeout(() => {
          window.playerPaused ? tlottiePlayer.pause() : tlottiePlayer.play();
        }, 0);
      }, true); // capture phase: runs after original listener
    }
  });

  /* ── patch scrubber ── */
  document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('frameSlider');
    if (slider) {
      slider.addEventListener('input', () => {
        if (!tlottieActive || !tlottiePlayer) return;
        tlottiePlayer.seekTo(parseFloat(slider.value));
      });
    }
  });

  /* ── speed control (new feature) ── */
  window.tlottieSetSpeed = function(speed) {
    if (tlottiePlayer) tlottiePlayer.setSpeed(speed);
  };

  /* ── background color control (new feature) ── */
  window.tlottieSetBg = function(color) {
    if (tlottieCanvas) tlottieCanvas.style.background = color || 'transparent';
  };

  /* ── add speed + bg controls to the player bar ── */
  function injectPlayerControls() {
    const playerBar = document.querySelector('.player-bar');
    if (!playerBar || document.getElementById('tl-speed-wrap')) return;

    // speed selector
    const speedWrap = document.createElement('div');
    speedWrap.id = 'tl-speed-wrap';
    speedWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';
    speedWrap.innerHTML = `
      <span style="font-size:10px;color:var(--text2);font-weight:600;white-space:nowrap;">Speed</span>
      <select id="tl-speed-sel" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-family:var(--font-body);">
        <option value="0.25">0.25×</option>
        <option value="0.5">0.5×</option>
        <option value="1" selected>1×</option>
        <option value="1.5">1.5×</option>
        <option value="2">2×</option>
      </select>`;
    document.getElementById('tl-speed-sel')?.remove(); // guard
    playerBar.appendChild(speedWrap);
    document.getElementById('tl-speed-sel').addEventListener('change', e => {
      window.tlottieSetSpeed(parseFloat(e.target.value));
    });

    // background picker
    const bgWrap = document.createElement('div');
    bgWrap.id = 'tl-bg-wrap';
    bgWrap.title = 'Preview background';
    bgWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';
    bgWrap.innerHTML = `
      <span style="font-size:10px;color:var(--text2);font-weight:600;white-space:nowrap;">BG</span>
      <div style="display:flex;gap:3px;">
        <button data-bg="transparent" title="Transparent" style="width:22px;height:22px;border-radius:5px;border:1.5px solid var(--border);cursor:pointer;background:repeating-conic-gradient(#aaa 0 25%,#fff 0 50%) 0/10px 10px;flex-shrink:0;" class="tl-bg-btn active-bg"></button>
        <button data-bg="#ffffff" title="White" style="width:22px;height:22px;border-radius:5px;border:1.5px solid var(--border);cursor:pointer;background:#fff;flex-shrink:0;" class="tl-bg-btn"></button>
        <button data-bg="#000000" title="Black" style="width:22px;height:22px;border-radius:5px;border:1.5px solid var(--border);cursor:pointer;background:#000;flex-shrink:0;" class="tl-bg-btn"></button>
        <button data-bg="#1e2a3a" title="Telegram Dark" style="width:22px;height:22px;border-radius:5px;border:1.5px solid var(--border);cursor:pointer;background:#1e2a3a;flex-shrink:0;" class="tl-bg-btn"></button>
        <button data-bg="#f0f0f0" title="Telegram Light" style="width:22px;height:22px;border-radius:5px;border:1.5px solid var(--border);cursor:pointer;background:#f0f0f0;flex-shrink:0;" class="tl-bg-btn"></button>
      </div>`;
    playerBar.appendChild(bgWrap);

    bgWrap.querySelectorAll('.tl-bg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bgWrap.querySelectorAll('.tl-bg-btn').forEach(b => b.style.outline = '');
        btn.style.outline = '2px solid var(--blue)';
        window.tlottieSetBg(btn.dataset.bg === 'transparent' ? '' : btn.dataset.bg);
      });
    });
  }

  /* ── init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectCanvas();
      injectPlayerControls();
      initTlottie();
    });
  } else {
    injectCanvas();
    injectPlayerControls();
    initTlottie();
  }

})();
