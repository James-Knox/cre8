/*
 * app.js — wires the UI to the modules and owns the project state.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'cre8.project.v1';
  const $ = (id) => document.getElementById(id);

  // ---- State ----------------------------------------------------------------
  let project = load() || Model.createProject(16, 16);
  let loadedImage = null; // last imported HTMLImageElement

  const editor = new Editor($('editor'), () => project, onEdit);
  const player = new Animation.Player($('preview'), () => project);

  // ---- Persistence ----------------------------------------------------------
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Model.serialize(project)));
    } catch (e) {
      /* storage full / disabled — non-fatal */
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Model.deserialize(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function onEdit() {
    save();
    refreshFrames();
    refreshExport();
    player.renderStatic();
  }

  // ---- Palette --------------------------------------------------------------
  function buildPalette() {
    const wrap = $('palette');
    wrap.innerHTML = '';
    Palette.colors.forEach((c) => {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (c.i === editor.color ? ' sel' : '');
      sw.style.background = c.hex;
      sw.title = c.i + ' · ' + c.name;
      sw.addEventListener('click', () => setColor(c.i));
      wrap.appendChild(sw);
    });
    updateCurrentSwatch();
  }
  function setColor(i) {
    editor.color = i;
    [...$('palette').children].forEach((el, k) =>
      el.classList.toggle('sel', k === i)
    );
    updateCurrentSwatch();
  }
  function updateCurrentSwatch() {
    $('currentSwatch').style.background = Palette.hexOf(editor.color);
    $('currentName').textContent = editor.color + ' · ' + Palette.nameOf(editor.color);
  }
  editor.onPick = setColor; // eyedropper feeds back into the UI

  // ---- Tools ----------------------------------------------------------------
  $('toolGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.tool');
    if (!btn) return;
    editor.tool = btn.dataset.tool;
    [...$('toolGrid').children].forEach((el) =>
      el.classList.toggle('active', el === btn)
    );
  });

  $('mirrorChk').addEventListener('change', (e) => (editor.mirrorX = e.target.checked));
  $('gridChk').addEventListener('change', (e) => {
    editor.showGrid = e.target.checked;
    editor.render();
  });
  $('onionChk').addEventListener('change', (e) => {
    editor.onionSkin = e.target.checked;
    editor.render();
  });

  // ---- Size / New -----------------------------------------------------------
  $('sizeSelect').addEventListener('change', (e) => {
    const n = parseInt(e.target.value, 10);
    Model.resize(project, n, n);
    editor.resizeCanvas();
    onEdit();
  });

  $('newBtn').addEventListener('click', () => {
    if (!confirm('Start a new project? This clears the current frames.')) return;
    const n = project.w;
    project = Model.createProject(n, n);
    editor.resizeCanvas();
    syncControls();
    onEdit();
  });

  // ---- Frames ---------------------------------------------------------------
  function refreshFrames() {
    const strip = $('framesStrip');
    strip.innerHTML = '';
    project.frames.forEach((f, i) => {
      const c = document.createElement('canvas');
      c.width = project.w;
      c.height = project.h;
      c.className = 'frame-thumb' + (i === project.active ? ' active' : '');
      const ctx = c.getContext('2d');
      paintFrameTo(ctx, f);
      c.addEventListener('click', () => {
        project.active = i;
        editor.render();
        refreshFrames();
        refreshExport();
        player.renderStatic();
      });
      strip.appendChild(c);
    });
    $('frameLabel').textContent = `${project.active + 1} / ${project.frames.length}`;
  }

  function paintFrameTo(ctx, f) {
    for (let y = 0; y < project.h; y++) {
      for (let x = 0; x < project.w; x++) {
        const v = f[y * project.w + x];
        if (v === Model.TRANSPARENT) continue;
        ctx.fillStyle = Palette.hexOf(v);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  $('addFrameBtn').addEventListener('click', () => {
    Model.addFrame(project, false);
    editor.render();
    onEdit();
  });
  $('dupFrameBtn').addEventListener('click', () => {
    Model.addFrame(project, true);
    editor.render();
    onEdit();
  });
  $('delFrameBtn').addEventListener('click', () => {
    Model.deleteFrame(project);
    editor.render();
    onEdit();
  });
  $('prevFrameBtn').addEventListener('click', () => {
    project.active = (project.active - 1 + project.frames.length) % project.frames.length;
    editor.render();
    refreshFrames();
    refreshExport();
  });
  $('nextFrameBtn').addEventListener('click', () => {
    project.active = (project.active + 1) % project.frames.length;
    editor.render();
    refreshFrames();
    refreshExport();
  });

  // ---- Playback -------------------------------------------------------------
  $('playBtn').addEventListener('click', () => {
    if (player.playing) {
      player.stop();
      $('playBtn').textContent = '▶ Play';
      player.renderStatic();
    } else {
      player.start();
      $('playBtn').textContent = '⏸ Stop';
    }
  });
  $('fpsInput').addEventListener('change', (e) => {
    project.fps = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 6));
    save();
  });

  // ---- Import ---------------------------------------------------------------
  $('imgInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      loadedImage = await Importer.loadImage(file);
      $('applyImgBtn').disabled = false;
      $('imgStatus').textContent = `Loaded ${file.name} (${loadedImage.width}×${loadedImage.height}). Tune options, then convert.`;
    } catch (err) {
      $('imgStatus').textContent = 'Could not load that image.';
    }
  });

  $('applyImgBtn').addEventListener('click', () => {
    if (!loadedImage) return;
    const frame = Importer.convert(loadedImage, project.w, project.h, {
      fit: $('fitSelect').value,
      brightness: parseInt($('brightRng').value, 10),
      contrast: parseInt($('contrastRng').value, 10),
      dither: $('ditherChk').checked,
    });
    project.frames[project.active] = frame;
    editor.render();
    onEdit();
    toast('Image converted to PICO-8 pixels');
  });

  // ---- Animation suggestions ------------------------------------------------
  document.querySelectorAll('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fn = Animation.Suggest[btn.dataset.suggest];
      if (!fn) return;
      const frames = fn(project);
      if (!frames || !frames.length) return;
      project.frames = frames;
      project.active = 0;
      editor.render();
      onEdit();
      toast(`Generated ${frames.length} frames`);
    });
  });

  // ---- Export ---------------------------------------------------------------
  function refreshExport() {
    $('placementNotes').textContent = Exporter.placementNotes(project);
  }

  $('copyGfxBtn').addEventListener('click', () => {
    const text = Exporter.gfxSection(project);
    $('exportOut').value = text;
    copy(text, 'Copied __gfx__ block');
  });
  $('copyHexBtn').addEventListener('click', () => {
    const text = Exporter.frameHex(project, project.active);
    $('exportOut').value = text;
    copy(text, 'Copied frame hex');
  });
  $('pngBtn').addEventListener('click', async () => {
    const blob = await Exporter.sheetPng(project, 1);
    Exporter.triggerDownload(blob, 'cre8-sheet.png');
    toast('Downloaded 128×128 PNG sheet');
  });

  function copy(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast(msg),
        () => toast('Copied to the box below')
      );
    } else {
      $('exportOut').select();
      toast('Selected — press Ctrl/Cmd+C');
    }
  }

  // ---- Toast ----------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---- Sync controls to loaded project --------------------------------------
  function syncControls() {
    const opt = [...$('sizeSelect').options].find(
      (o) => parseInt(o.value, 10) === project.w
    );
    if (opt) $('sizeSelect').value = String(project.w);
    $('fpsInput').value = project.fps;
    $('mirrorChk').checked = editor.mirrorX;
    $('gridChk').checked = editor.showGrid;
    $('onionChk').checked = editor.onionSkin;
  }

  // ---- Boot -----------------------------------------------------------------
  function boot() {
    buildPalette();
    syncControls();
    editor.resizeCanvas();
    refreshFrames();
    refreshExport();
    player.renderStatic();
  }
  window.addEventListener('resize', () => editor.resizeCanvas());
  boot();
})();
