(function () {
  'use strict';

  const body = document.body;
  const root = document.documentElement;
  const scenes = Array.from(document.querySelectorAll('[data-slide]'));
  const builds = scenes.map(scene => Array.from(scene.querySelectorAll('[data-build]')));
  const allBuilds = builds.flat();
  const navigation = document.querySelector('.nav');
  const links = Array.from(document.querySelectorAll('.nav nav a[href^="#"]'));
  const controls = document.getElementById('presentation-controls');
  const start = document.getElementById('presentation-start');
  const previous = document.getElementById('presentation-prev');
  const next = document.getElementById('presentation-next');
  const exit = document.getElementById('presentation-exit');
  const fullscreen = document.getElementById('presentation-fullscreen');
  const position = document.getElementById('presentation-position');
  const announcement = document.getElementById('presentation-announcement');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const read = new WeakSet();
  let presenting = false;
  let printing = false;
  let slideIndex = 0;
  let buildIndex = 1;
  let readingPosition = { x: 0, y: 0, focus: null };
  let ownsFullscreen = false;
  let readingObserver;
  let navigationFrame = 0;

  // Nothing is hidden before an enhancement has initialized successfully.
  function animate(element, frames, duration, delay = 0) {
    if (!element || reducedMotion.matches || printing || !element.animate) return;
    try {
      const animation = element.animate(frames, {
        duration, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both'
      });
      animations.add(animation);
      const finish = () => { animations.delete(animation); animation.cancel(); };
      animation.finished.then(finish, () => animations.delete(animation));
    } catch (_) { /* A missing animation API must never hide content. */ }
  }

  function cancelAnimations() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
  }

  function reveal(block) {
    if (!block) return;
    block.classList.add('is-revealed');
    const kind = block.dataset.motion || 'title';
    if (kind === 'image') {
      animate(block, [
        { opacity: 0, transform: 'scale(.98)', clipPath: 'inset(0 0 12% 0)' },
        { opacity: 1, transform: 'scale(1)', clipPath: 'inset(0 0 0% 0)' }
      ], 550);
      return;
    }
    if (kind === 'stagger' || kind === 'flow') {
      const grouped = Array.from(block.querySelectorAll(':scope > article, :scope > li, :scope > .responsibilities > li, :scope > .device-diagram > .device-node, :scope > .cert-list > article, :scope > .resource-rows > article, :scope > .business-flow > article, :scope > .technical-choices > article, :scope > .patent-evidence > article, :scope > .management-certifications, :scope > .project-qualification, :scope > .evidence-grid > article, :scope > .workspace, :scope > .closing'));
      const items = (grouped.length ? grouped : Array.from(block.children)).filter(child => !child.hidden);
      (items.length ? items : [block]).forEach((item, index) => {
        animate(item, [
          { opacity: 0, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], 400, Math.min(index, 6) * 90);
      });
      if (kind === 'flow') {
        block.querySelectorAll('.device-connector, .workflow-connector').forEach((line, index) => {
          animate(line, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], 300, index * 150);
        });
      }
      return;
    }
    animate(block, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], 450);
  }

  function announce(message) {
    if (announcement) announcement.textContent = message;
  }

  // Every original image remains available, including inactive gallery panels.
  const media = {};
  document.querySelectorAll('img[data-asset]').forEach(image => {
    media[image.dataset.asset] = {
      src: image.getAttribute('src'), title: image.dataset.title || image.alt,
      source: image.dataset.source
    };
  });
  const dialog = document.getElementById('lightbox');
  const image = document.getElementById('lightbox-image');
  const scroller = document.getElementById('lightbox-scroll');
  const zoom = document.getElementById('lightbox-zoom');
  const source = document.getElementById('lightbox-source');
  const close = document.getElementById('lightbox-close');
  let lightboxFocus = null;
  let lightboxOverflow = '';

  function openImage(key, trigger) {
    const item = media[key];
    if (!item || !dialog || typeof dialog.showModal !== 'function') return;
    lightboxFocus = trigger;
    lightboxOverflow = body.style.overflow;
    image.onload = () => image.style.setProperty('--image-width', image.naturalWidth + 'px');
    image.src = item.src;
    image.alt = item.title;
    document.getElementById('lightbox-title').textContent = item.title;
    source.hidden = !item.source;
    if (item.source) source.href = item.source;
    else source.removeAttribute('href');
    scroller.classList.remove('zoomed');
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
    zoom.textContent = '原始尺寸';
    zoom.setAttribute('aria-pressed', 'false');
    dialog.showModal();
    body.style.overflow = 'hidden';
    animate(dialog, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'scale(1)' }], 180);
    close.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-lightbox]');
    if (trigger) openImage(trigger.dataset.lightbox, trigger);
  });
  if (dialog) {
    zoom.addEventListener('click', () => {
      const enlarged = scroller.classList.toggle('zoomed');
      zoom.textContent = enlarged ? '适应窗口' : '原始尺寸';
      zoom.setAttribute('aria-pressed', String(enlarged));
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      body.style.overflow = lightboxOverflow;
      image.removeAttribute('src');
      if (lightboxFocus && lightboxFocus.isConnected) lightboxFocus.focus({ preventScroll: true });
    });
  }

  const galleries = Array.from(document.querySelectorAll('[data-gallery]')).map(element => {
    const buttons = Array.from(element.querySelectorAll('[data-gallery-select]'));
    const panels = Array.from(element.querySelectorAll('[data-gallery-panel]'));
    const gallery = { element, buttons, panels, selected: panels[0] && panels[0].dataset.galleryPanel };
    function select(key, motion) {
      if (!panels.some(panel => panel.dataset.galleryPanel === key)) return;
      gallery.selected = key;
      panels.forEach(panel => { panel.hidden = panel.dataset.galleryPanel !== key; });
      buttons.forEach(button => {
        const selected = button.dataset.gallerySelect === key;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const selected = panels.find(panel => !panel.hidden);
      if (motion) animate(selected, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 250);
    }
    gallery.select = select;
    buttons.forEach(button => {
      const panel = panels.find(item => item.dataset.galleryPanel === button.dataset.gallerySelect);
      const original = panel && panel.querySelector('img[data-asset]');
      if (original) {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'gallery-thumb';
        thumbnail.src = original.src;
        thumbnail.alt = '';
        thumbnail.loading = 'lazy';
        thumbnail.decoding = 'async';
        thumbnail.width = original.width;
        thumbnail.height = original.height;
        button.prepend(thumbnail);
      }
      button.hidden = false;
      button.addEventListener('click', () => select(button.dataset.gallerySelect, true));
    });
    if (panels.length && buttons.length) {
      select(gallery.selected, false);
      const selector = element.querySelector('.gallery-controls');
      if (selector) selector.hidden = false;
      element.classList.add('is-enhanced');
    }
    return gallery;
  });

  function measureChrome() {
    if (navigation) root.style.setProperty('--nav', navigation.getBoundingClientRect().height + 'px');
    if (controls && !controls.hidden) root.style.setProperty('--presentation-bottom', (controls.getBoundingClientRect().height + 16) + 'px');
  }

  function updateNavigation() {
    navigationFrame = 0;
    if (printing) return;
    let active = scenes[slideIndex];
    if (!presenting) {
      const threshold = (navigation ? navigation.offsetHeight : 0) + 100;
      active = scenes.filter(scene => scene.getBoundingClientRect().top <= threshold).at(-1) || scenes[0];
    }
    links.forEach(link => {
      if (active && link.getAttribute('href') === '#' + active.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function scheduleNavigation() {
    if (!navigationFrame) navigationFrame = requestAnimationFrame(updateNavigation);
  }

  function setPending(block, pending) {
    block.classList.toggle('is-pending', pending);
    block.inert = pending;
    if (pending) block.setAttribute('aria-hidden', 'true');
    else block.removeAttribute('aria-hidden');
  }

  function showAllContent() {
    scenes.forEach(scene => { scene.hidden = false; scene.classList.remove('is-active'); });
    allBuilds.forEach(block => setPending(block, false));
  }

  function observeReading() {
    if (readingObserver) readingObserver.disconnect();
    if (presenting || printing) return;
    if (!('IntersectionObserver' in window) || reducedMotion.matches) {
      allBuilds.forEach(block => { read.add(block); block.classList.add('is-revealed'); });
      return;
    }
    readingObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || presenting || printing) return;
        if (!read.has(entry.target)) { read.add(entry.target); reveal(entry.target); }
        readingObserver.unobserve(entry.target);
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' });
    allBuilds.filter(block => !read.has(block)).forEach(block => readingObserver.observe(block));
  }

  function updateControls() {
    const count = builds[slideIndex].length;
    previous.disabled = slideIndex === 0 && buildIndex === 1;
    next.disabled = slideIndex === scenes.length - 1 && buildIndex === count;
    next.textContent = next.disabled ? '演示结束' : buildIndex < count ? '下一步' : '下一页';
    position.textContent = (slideIndex + 1) + ' / ' + scenes.length;
    position.setAttribute('aria-label', '第 ' + (slideIndex + 1) + ' 页，共 ' + scenes.length + ' 页，第 ' + buildIndex + ' 步，共 ' + count + ' 步');
    body.dataset.slideIndex = String(slideIndex + 1);
    body.dataset.buildIndex = String(buildIndex);
    announce((scenes[slideIndex].dataset.title || '工作汇报') + '，第 ' + (slideIndex + 1) + ' 页，第 ' + buildIndex + ' 步');
  }

  function scrollToBuild(block) {
    const scene = scenes[slideIndex];
    const rect = block.getBoundingClientRect();
    const visible = scene.getBoundingClientRect();
    if (rect.bottom > visible.bottom - 20 || rect.top < visible.top) {
      scene.scrollTo({
        top: Math.max(0, scene.scrollTop + rect.top - visible.top - 24),
        behavior: reducedMotion.matches ? 'instant' : 'smooth'
      });
    }
  }

  function showScene(index, step = 1, motion = true, direction = 1) {
    cancelAnimations();
    const changed = slideIndex !== index;
    slideIndex = Math.max(0, Math.min(scenes.length - 1, index));
    buildIndex = Math.max(1, Math.min(builds[slideIndex].length, step));
    scenes.forEach((scene, sceneIndex) => {
      const active = sceneIndex === slideIndex;
      scene.hidden = !active;
      scene.classList.toggle('is-active', active);
      builds[sceneIndex].forEach((block, blockIndex) => setPending(block, active && blockIndex >= buildIndex));
    });
    const scene = scenes[slideIndex];
    if (changed || buildIndex === 1) scene.scrollTop = 0;
    measureChrome();
    updateControls();
    updateNavigation();
    const block = builds[slideIndex][buildIndex - 1];
    if (motion) {
      if (changed) animate(scene.querySelector('.scene-inner') || scene, [
        { opacity: 0, transform: 'translateX(' + (24 * direction) + 'px)' },
        { opacity: 1, transform: 'translateX(0)' }
      ], 420);
      reveal(block);
    }
    if (buildIndex > 1) requestAnimationFrame(() => { if (presenting && !printing) scrollToBuild(block); });
  }

  function startPresentation(trigger) {
    if (presenting || !scenes.length) return;
    readingPosition = { x: window.scrollX, y: window.scrollY, focus: trigger || document.activeElement };
    presenting = true;
    cancelAnimations();
    if (readingObserver) readingObserver.disconnect();
    controls.hidden = false;
    body.classList.add('is-presenting');
    start.setAttribute('aria-pressed', 'true');
    slideIndex = 0;
    showScene(0);
    next.focus({ preventScroll: true });
  }

  function stopPresentation() {
    if (!presenting) return;
    presenting = false;
    cancelAnimations();
    body.classList.remove('is-presenting');
    controls.hidden = true;
    start.setAttribute('aria-pressed', 'false');
    showAllContent();
    delete body.dataset.slideIndex;
    delete body.dataset.buildIndex;
    if (ownsFullscreen && document.fullscreenElement === root) {
      document.exitFullscreen().catch(() => {});
    }
    ownsFullscreen = false;
    const focus = readingPosition.focus;
    if (focus && focus.isConnected) focus.focus({ preventScroll: true });
    const behavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(readingPosition.x, readingPosition.y);
    requestAnimationFrame(() => {
      root.style.scrollBehavior = behavior;
      if (!presenting) { observeReading(); updateNavigation(); }
    });
    announce('已退出演示，返回阅读位置');
  }

  function advance() {
    if (!presenting) return;
    const count = builds[slideIndex].length;
    if (buildIndex < count) showScene(slideIndex, buildIndex + 1);
    else if (slideIndex < scenes.length - 1) showScene(slideIndex + 1);
  }

  function retreat() {
    if (!presenting) return;
    if (buildIndex > 1) showScene(slideIndex, buildIndex - 1, true, -1);
    else if (slideIndex > 0) showScene(slideIndex - 1, builds[slideIndex - 1].length, true, -1);
  }

  function updateFullscreen() {
    fullscreen.textContent = document.fullscreenElement === root ? '退出全屏' : '全屏';
    fullscreen.setAttribute('aria-pressed', String(document.fullscreenElement === root));
    if (!document.fullscreenElement) ownsFullscreen = false;
    measureChrome();
  }

  // Presentation is optional; a malformed scene leaves the reading page intact.
  if (scenes.length && builds.every(items => items.length) && controls && start && previous && next && exit && fullscreen && position) {
    start.hidden = false;
    start.setAttribute('aria-pressed', 'false');
    start.addEventListener('click', () => startPresentation(start));
    document.querySelectorAll('[data-presentation-start]').forEach(button => {
      button.hidden = false;
      button.addEventListener('click', () => startPresentation(button));
    });
    previous.addEventListener('click', retreat);
    next.addEventListener('click', advance);
    exit.addEventListener('click', stopPresentation);
    fullscreen.hidden = !document.fullscreenEnabled || !root.requestFullscreen;
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === root) await document.exitFullscreen();
        else { await root.requestFullscreen(); ownsFullscreen = true; }
      } catch (_) { announce('当前浏览器未允许全屏，可以继续使用演示模式'); }
      updateFullscreen();
    });
    document.addEventListener('fullscreenchange', updateFullscreen);
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog && dialog.open) {
      event.preventDefault();
      event.stopPropagation();
      dialog.close();
      return;
    }
    if (!presenting || printing || (dialog && dialog.open)) return;
    if (event.key === 'Escape') { event.preventDefault(); stopPresentation(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const interactive = target.closest('button, a, summary, [role="button"]');
    if (interactive && (!controls.contains(interactive) || event.key === ' ')) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
      event.preventDefault(); advance();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
      event.preventDefault(); retreat();
    }
  });

  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const id = anchor.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    const scene = target.closest('[data-slide]');
    if (presenting && scene) {
      event.preventDefault();
      showScene(scenes.indexOf(scene));
      return;
    }
    if (scene) {
      cancelAnimations();
      builds[scenes.indexOf(scene)].forEach(block => {
        read.add(block); block.classList.add('is-revealed'); setPending(block, false);
        if (readingObserver) readingObserver.unobserve(block);
      });
    }
  });

  function motionPreferenceChanged() {
    cancelAnimations();
    if (!presenting) observeReading();
  }
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', motionPreferenceChanged);
  else reducedMotion.addListener(motionPreferenceChanged);

  window.addEventListener('beforeprint', () => {
    printing = true;
    cancelAnimations();
    if (readingObserver) readingObserver.disconnect();
    body.classList.add('is-printing');
    body.classList.remove('is-presenting');
    showAllContent();
    galleries.forEach(gallery => gallery.panels.forEach(panel => { panel.hidden = false; }));
    if (controls) controls.hidden = true;
  });
  window.addEventListener('afterprint', () => {
    printing = false;
    body.classList.remove('is-printing');
    galleries.forEach(gallery => gallery.select(gallery.selected, false));
    if (presenting) {
      body.classList.add('is-presenting');
      controls.hidden = false;
      showScene(slideIndex, buildIndex, false);
    } else observeReading();
    measureChrome();
    updateNavigation();
  });

  window.addEventListener('scroll', scheduleNavigation, { passive: true });
  window.addEventListener('resize', () => { measureChrome(); scheduleNavigation(); });
  if ('ResizeObserver' in window) {
    const chromeObserver = new ResizeObserver(measureChrome);
    if (navigation) chromeObserver.observe(navigation);
    if (controls) chromeObserver.observe(controls);
  }
  measureChrome();
  updateNavigation();
  observeReading();
})();
