// Interactive drill-down topic graph for the #network section.
//
// Physics: d3-force. Entrance motion (node pop-in, edge draw-in, pulses): GSAP,
// layered on top of the simulation rather than driving it.
//
// Design decisions (see docs/network-graph-plan.md §9):
// - Opening a topic only ever adds to the map ("keeps growing", Obsidian-style).
//   Nothing collapses on click; "Reset graph" is the one way back to the start.
//   This keeps the physics story simple — every click is a new node or edge
//   popping in — and avoids subtrees vanishing out from under keyboard focus.
// - The old "click two dots to link them" feature stays, but behind an explicit
//   "Draw your own link" mode, since a plain click now means "open this topic".
//   Your own links are dashed accent lines so they never read as authored ones.
(function initNetworkGraph() {
  var svgEl = document.getElementById('networkSvg');
  if (!svgEl) return;
  var stage = svgEl.closest('.network-stage');
  var statusEl = document.getElementById('networkStatus');
  var hintEl = document.getElementById('networkHint');
  var resetBtn = document.getElementById('networkReset');
  var linkBtn = document.getElementById('networkLinkMode');

  if (typeof d3 === 'undefined' || !window.GRAPH_NODES) {
    if (stage) stage.classList.add('is-unavailable');
    if (hintEl) hintEl.textContent = "The interactive demo couldn't load. Try refreshing the page.";
    return;
  }

  var hasGSAP = typeof gsap !== 'undefined';
  var EASE = (window.Recall && window.Recall.EASE) || 'power3.out';
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !hasGSAP || !!(motionQuery && motionQuery.matches); }

  // ---------- content index ----------
  var DATA = {};
  var CHILDREN = {};
  var ROOT_ID = null;
  window.GRAPH_NODES.forEach(function (d) {
    DATA[d.id] = d;
    CHILDREN[d.id] = [];
    if (d.kind === 'root') ROOT_ID = d.id;
  });
  window.GRAPH_NODES.forEach(function (d) {
    (d.parents || []).forEach(function (p) { if (CHILDREN[p]) CHILDREN[p].push(d.id); });
  });

  var SIZE = { root: 9, course: 7, topic: 5, leaf: 3.5 };
  var LINK_DIST = { root: 115, course: 78, topic: 62, leaf: 62 }; // keyed by the parent's kind
  var CHARGE = { root: -320, course: -360, topic: -210, leaf: -150 };
  var MIN_K = 0.3, MAX_K = 2.4, FIT_MAX_K = 1.35;

  // ---------- live state ----------
  var nodes = [];
  var nodeById = {};
  var links = [];
  var linkByKey = {};
  var expanded = {};
  var linkMode = false;
  var selected = null;
  var hoverId = null;
  var autoFit = true;
  var dragging = false;
  var W = 640, H = 420;

  function linkKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  function sizeOf(n) { return SIZE[n.data.kind] || SIZE.leaf; }
  function canOpen(id) { return !expanded[id] && CHILDREN[id].length > 0; }

  // ---------- DOM ----------
  var NS = 'http://www.w3.org/2000/svg';
  var svg = d3.select(svgEl);
  var viewport = svg.append('g').attr('class', 'net-viewport');
  var edgeLayer = viewport.append('g').attr('class', 'net-edges').node();
  var nodeLayer = viewport.append('g').attr('class', 'net-nodes').node();

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function createNodeEl(n, insertAfter) {
    var r = sizeOf(n);
    var g = el('g', { 'class': 'net-node is-' + n.data.kind, 'data-id': n.id, tabindex: '0', role: 'button' });
    var body = el('g', { 'class': 'net-node-body' }, g);
    n.hit = el('circle', { 'class': 'hit', r: Math.max(r + 8, 15) }, body);
    el('circle', { 'class': 'glow', r: r + 7 }, body);
    el('circle', { 'class': 'more', r: r + 4 }, body);
    el('circle', { 'class': 'ring', r: r + 4 }, body);
    el('circle', { 'class': 'dot', r: r }, body);
    var text = el('text', { 'class': 'net-label', y: r + 3, dy: '0.85em', 'text-anchor': 'middle' }, body);
    text.textContent = n.data.label;

    // Insert right after the node that revealed it so Tab goes parent -> children.
    if (insertAfter && insertAfter.parentNode === nodeLayer) {
      nodeLayer.insertBefore(g, insertAfter.nextSibling);
    } else {
      nodeLayer.appendChild(g);
    }
    n.el = g;
    n.body = body;
    d3.select(g).datum(n).call(drag);
    return g;
  }

  function createLinkEl(l) {
    l.el = el('line', { 'class': 'net-edge' + (l.custom ? ' is-custom' : '') }, edgeLayer);
  }

  // ---------- simulation ----------
  var degree = {};
  var sim = d3.forceSimulation()
    .force('link', d3.forceLink()
      .distance(function (l) { return l.custom ? 150 : (LINK_DIST[l.source.data.kind] || 62); })
      .strength(function (l) {
        if (l.custom) return 0.05;
        return 0.8 / Math.min(degree[l.source.id] || 1, degree[l.target.id] || 1);
      }))
    .force('charge', d3.forceManyBody()
      .strength(function (n) { return CHARGE[n.data.kind] || -150; })
      .distanceMax(460))
    .force('collide', d3.forceCollide()
      .radius(function (n) { return sizeOf(n) + 12; })
      .strength(0.85))
    .force('labels', labelCollide())
    .force('x', d3.forceX(0).strength(0.03))
    .force('y', d3.forceY(0).strength(0.055))
    .alphaDecay(0.03)
    .velocityDecay(0.36)
    .on('tick', render)
    .stop();

  // Circles can't model wide text labels, so nodes also push apart when the
  // box around "dot + label underneath" overlaps a neighbour's box.
  var LABEL_PX = { root: 12.5, course: 12, topic: 10.5, leaf: 10.5 };
  var labelScale = 1; // the --u label counter-scale, kept in sync by applyTransform()
  function labelBox(n) {
    var r = sizeOf(n);
    var px = (LABEL_PX[n.data.kind] || 10.5) * labelScale;
    n.boxScale = labelScale;
    var top = -r - 4, bottom = r + 5 + px * 1.25;
    n.hw = Math.max(n.data.label.length * px * 0.31, r + 4) + 5;
    n.hh = (bottom - top) / 2 + 2;
    n.cy = (top + bottom) / 2;
  }
  function labelCollide() {
    var list = [];
    function force() {
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.boxScale !== labelScale) labelBox(a);
        for (var j = i + 1; j < list.length; j++) {
          var b = list[j];
          if (b.boxScale !== labelScale) labelBox(b);
          var dx = (b.x + b.vx) - (a.x + a.vx);
          var dy = (b.y + b.vy + b.cy) - (a.y + a.vy + a.cy);
          var ox = a.hw + b.hw - Math.abs(dx);
          var oy = a.hh + b.hh - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          // Separate along whichever axis needs the smaller move.
          if (ox < oy) {
            var px = ox * 0.25 * (dx < 0 ? -1 : 1);
            a.vx -= px; b.vx += px;
          } else {
            var py = oy * 0.25 * (dy < 0 ? -1 : 1);
            a.vy -= py; b.vy += py;
          }
        }
      }
    }
    force.initialize = function (ns) { list = ns; list.forEach(labelBox); };
    return force;
  }

  function syncSim() {
    degree = {};
    links.forEach(function (l) {
      if (l.custom) return;
      degree[l.source.id] = (degree[l.source.id] || 0) + 1;
      degree[l.target.id] = (degree[l.target.id] || 0) + 1;
    });
    sim.nodes(nodes);
    sim.force('link').links(links);
  }

  // Wake the simulation so the whole map reflows. Reduced motion: settle
  // off-screen and jump straight to the resting layout.
  function reheat(alpha) {
    if (reducedMotion()) {
      sim.stop();
      sim.alpha(1);
      for (var i = 0; i < 300; i++) sim.tick();
      render();
      fitNow();
      return;
    }
    sim.alpha(Math.max(sim.alpha(), alpha)).restart();
    startFitLoop();
  }

  function r2(v) { return Math.round(v * 100) / 100; }

  function renderLink(l) {
    var s = l.source, t = l.target, p = l.progress;
    l.el.setAttribute('x1', r2(s.x));
    l.el.setAttribute('y1', r2(s.y));
    l.el.setAttribute('x2', r2(s.x + (t.x - s.x) * p));
    l.el.setAttribute('y2', r2(s.y + (t.y - s.y) * p));
  }

  function render() {
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].el.setAttribute('transform', 'translate(' + r2(nodes[i].x) + ',' + r2(nodes[i].y) + ')');
    }
    links.forEach(renderLink);
  }

  // ---------- adding things ----------
  function addNode(id, from, index, total) {
    var n = { id: id, data: DATA[id], x: 0, y: 0 };
    if (from) {
      // Pop out of the parent, nudged away from the centre so children bloom outward.
      var base = Math.atan2(from.y, from.x);
      var angle = (from.x === 0 && from.y === 0)
        ? (index / Math.max(total, 1)) * Math.PI * 2
        : base + (index - (total - 1) / 2) * 0.5;
      n.x = from.x + Math.cos(angle) * 6;
      n.y = from.y + Math.sin(angle) * 6;
    }
    if (id === ROOT_ID) { n.fx = 0; n.fy = 0; }
    nodes.push(n);
    nodeById[id] = n;
    createNodeEl(n, from && from.lastChildEl ? from.lastChildEl : (from ? from.el : null));
    if (from) from.lastChildEl = n.el;
    return n;
  }

  function addLink(a, b, custom) {
    var key = linkKey(a.id, b.id);
    var existing = linkByKey[key];
    if (existing) {
      // An authored edge supersedes one you drew yourself between the same pair.
      if (existing.custom && !custom) {
        existing.custom = false;
        existing.el.classList.remove('is-custom');
        existing.source = a; existing.target = b;
      }
      return null;
    }
    var l = { source: a, target: b, custom: !!custom, progress: 1, key: key };
    links.push(l);
    linkByKey[key] = l;
    createLinkEl(l);
    return l;
  }

  function animateIn(newNodes, newLinks) {
    if (reducedMotion()) return;
    newNodes.forEach(function (n, i) {
      var s = { v: 0.15, o: 0 };
      n.body.setAttribute('transform', 'scale(0.15)');
      n.body.style.opacity = '0';
      gsap.to(s, {
        v: 1, o: 1, duration: 0.55, delay: 0.08 + i * 0.06, ease: EASE,
        onUpdate: function () {
          n.body.setAttribute('transform', 'scale(' + s.v + ')');
          n.body.style.opacity = s.o;
        },
        onComplete: function () {
          n.body.removeAttribute('transform');
          n.body.style.opacity = '';
        }
      });
    });
    newLinks.forEach(function (l, i) {
      l.progress = 0;
      renderLink(l);
      gsap.to(l, {
        progress: 1, duration: 0.5, delay: i * 0.06, ease: EASE,
        onUpdate: function () { renderLink(l); }
      });
    });
  }

  function pulse(n) {
    if (reducedMotion()) return;
    var s = { v: 1 };
    gsap.to(s, {
      v: 1.35, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out',
      onUpdate: function () { n.body.setAttribute('transform', 'scale(' + s.v + ')'); },
      onComplete: function () { n.body.removeAttribute('transform'); }
    });
  }

  function glowPulse(n) {
    if (reducedMotion() || n.data.kind !== 'course') return;
    var glow = n.el.querySelector('.glow');
    gsap.to(glow, { opacity: 0.4, duration: 2.2 + (nodes.indexOf(n) % 3), repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }

  // ---------- open a topic ----------
  function open(id, viaKeyboard) {
    var parent = nodeById[id];
    var kids = CHILDREN[id];
    var newNodes = [], newLinks = [], alreadyThere = [];
    expanded[id] = true;
    parent.lastChildEl = null;

    kids.forEach(function (cid, i) {
      var child = nodeById[cid];
      if (!child) {
        child = addNode(cid, parent, i, kids.length);
        newNodes.push(child);
      } else {
        alreadyThere.push(child);
      }
      var l = addLink(parent, child, false);
      if (l) newLinks.push(l);
    });

    syncSim();
    animateIn(newNodes, newLinks);
    newNodes.forEach(glowPulse);
    reheat(0.9);
    refreshAll();

    var msg = [];
    if (newNodes.length) {
      msg.push('Revealed ' + plural(newNodes.length, 'topic') + ' under ' + parent.data.label + ': ' +
        listJoin(newNodes.map(label)) + '.');
    }
    if (alreadyThere.length) {
      msg.push((newNodes.length ? 'Also linked to ' : parent.data.label + ' links to ') +
        listJoin(alreadyThere.map(label)) + ', already on the map.');
    }
    announce(msg.join(' '));

    if (viaKeyboard && newNodes.length) newNodes[0].el.focus({ preventScroll: true });
  }

  function activate(id, viaKeyboard) {
    if (linkMode) { linkClick(id); return; }
    var n = nodeById[id];
    if (canOpen(id)) { open(id, viaKeyboard); return; }
    // Nothing left to reveal: give it a nudge and read out what it touches.
    pulse(n);
    reheat(0.2);
    var nb = neighbors(id).map(label);
    announce(n.data.label + (nb.length ? ' connects to ' + listJoin(nb) + '.' : ' has no connections yet.'));
  }

  // ---------- your own links ----------
  function setLinkMode(on) {
    linkMode = on;
    if (!on) clearSelection();
    stage.classList.toggle('is-linking', on);
    if (linkBtn) {
      linkBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      linkBtn.textContent = on ? 'Done linking' : 'Draw your own link';
    }
    if (hintEl) hintEl.textContent = on ? HINT_LINK : HINT_DEFAULT;
    refreshAll();
    announce(on
      ? 'Link mode on. Choose two topics to connect them. Press Escape when you are done.'
      : 'Link mode off. Selecting a topic opens it again.');
  }

  function clearSelection() {
    if (selected !== null && nodeById[selected]) nodeById[selected].el.classList.remove('is-selected');
    selected = null;
  }

  function linkClick(id) {
    var n = nodeById[id];
    if (selected === null) {
      selected = id;
      n.el.classList.add('is-selected');
      highlight(id);
      refreshAll();
      announce(n.data.label + ' selected. Choose another topic to link it to.');
      return;
    }
    if (selected === id) {
      clearSelection();
      clearHighlight();
      refreshAll();
      announce('Selection cleared.');
      return;
    }
    var a = nodeById[selected];
    var existing = linkByKey[linkKey(a.id, n.id)];
    clearSelection();
    if (existing) {
      clearHighlight();
      refreshAll();
      announce(a.data.label + ' and ' + n.data.label + ' are already connected.');
      return;
    }
    var l = addLink(a, n, true);
    syncSim();
    animateIn([], [l]);
    reheat(0.35);
    highlight(n.id);
    refreshAll();
    announce('Linked ' + a.data.label + ' and ' + n.data.label + '.');
  }

  // ---------- highlight (hover / focus) ----------
  function neighbors(id) {
    var out = [];
    links.forEach(function (l) {
      if (l.source.id === id) out.push(l.target);
      else if (l.target.id === id) out.push(l.source);
    });
    return out;
  }

  function highlight(id) {
    var lit = {};
    lit[id] = true;
    neighbors(id).forEach(function (m) { lit[m.id] = true; });
    nodes.forEach(function (n) {
      n.el.classList.toggle('is-lit', !!lit[n.id]);
      n.el.classList.toggle('is-dim', !lit[n.id]);
    });
    links.forEach(function (l) {
      var on = l.source.id === id || l.target.id === id;
      l.el.classList.toggle('is-lit', on);
      l.el.classList.toggle('is-dim', !on);
      if (on) l.el.classList.toggle('is-reverse', l.target.id === id);
    });
  }

  function clearHighlight() {
    nodes.forEach(function (n) { n.el.classList.remove('is-lit', 'is-dim'); });
    links.forEach(function (l) { l.el.classList.remove('is-lit', 'is-dim', 'is-reverse'); });
  }

  function restoreHighlight() {
    if (selected !== null) highlight(selected);
    else if (hoverId !== null && nodeById[hoverId]) highlight(hoverId);
    else clearHighlight();
  }

  // ---------- labels & announcements ----------
  function label(n) { return n.data.label; }
  function plural(count, word) { return count + ' ' + word + (count === 1 ? '' : 's'); }
  function listJoin(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function describe(n) {
    var parts = [n.data.label + (n.data.kind === 'course' ? ' course' : '')];
    var nb = neighbors(n.id).map(label);
    if (nb.length) parts.push('Connected to ' + listJoin(nb));
    if (linkMode) {
      if (selected === n.id) parts.push('Selected. Press Enter to cancel the link');
      else if (selected !== null) parts.push('Press Enter to link it to ' + nodeById[selected].data.label);
      else parts.push('Press Enter to start a link from it');
    } else if (canOpen(n.id)) {
      var pending = CHILDREN[n.id].filter(function (c) { return !nodeById[c]; }).length;
      var onMap = CHILDREN[n.id].length - pending;
      if (pending) parts.push('Press Enter to reveal ' + plural(pending, 'more topic'));
      else parts.push('Press Enter to link it to ' + plural(onMap, 'topic') + ' already on the map');
    }
    return parts.join('. ') + '.';
  }

  function refreshAll() {
    nodes.forEach(function (n) {
      n.el.classList.toggle('has-more', canOpen(n.id));
      n.el.classList.toggle('is-open', !!expanded[n.id]);
      n.el.setAttribute('aria-label', describe(n));
    });
  }

  var announceTimer = null;
  function announce(msg) {
    if (!statusEl || !msg) return;
    statusEl.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () { statusEl.textContent = msg; }, 60);
  }

  // ---------- zoom / pan / fit ----------
  // Plain wheel scrolls the page (no scroll-jacking); Ctrl/Cmd + wheel or a
  // trackpad pinch zooms. On touch, one finger scrolls the page and two fingers
  // pinch/pan the graph. Mouse drag on empty space pans.
  var zoom = d3.zoom()
    .scaleExtent([MIN_K, MAX_K])
    .filter(function (ev) {
      if (ev.type === 'wheel') return ev.ctrlKey || ev.metaKey;
      if (ev.type === 'touchstart') return ev.touches.length > 1;
      return !ev.button;
    })
    .on('zoom', function (ev) {
      // Only a gesture that actually moved the view takes over from auto-fit.
      // (d3-zoom also emits for a plain click, and for the mouse events a
      // browser synthesises after a tap on a node.)
      var t = ev.transform, prev = lastTransform;
      if (ev.sourceEvent && (Math.abs(t.k - prev.k) > 1e-3 || Math.abs(t.x - prev.x) > 0.5 || Math.abs(t.y - prev.y) > 0.5)) {
        autoFit = false;
      }
      applyTransform(t);
    });
  svg.call(zoom).on('dblclick.zoom', null);
  svgEl.style.touchAction = 'pan-x pan-y';

  var lastTransform = d3.zoomIdentity;
  function applyTransform(t) {
    lastTransform = t;
    viewport.attr('transform', t.toString());
    // Keep labels readable when zoomed out, and not huge when zoomed in.
    var u = Math.max(0.75, Math.min(1.9, 1 / t.k));
    labelScale = Math.round(u * 20) / 20; // coarse steps so boxes aren't rebuilt every frame
    svgEl.style.setProperty('--u', u.toFixed(3));
    nodes.forEach(function (n) { n.hit.setAttribute('r', r2(Math.max(sizeOf(n) + 8, 15) * u)); });
  }

  function fitTransform() {
    if (!nodes.length) return d3.zoomIdentity;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach(function (n) {
      var half = Math.max(24, n.data.label.length * 3.3);
      x0 = Math.min(x0, n.x - half); x1 = Math.max(x1, n.x + half);
      y0 = Math.min(y0, n.y - 16); y1 = Math.max(y1, n.y + 30);
    });
    var pad = 24;
    var k = Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0), FIT_MAX_K);
    k = Math.max(MIN_K, k);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return d3.zoomIdentity.translate(-cx * k, -cy * k).scale(k);
  }

  function fitNow() {
    svg.call(zoom.transform, fitTransform());
  }

  var fitFrame = null;
  function startFitLoop() {
    if (fitFrame !== null || !autoFit) return;
    fitFrame = requestAnimationFrame(stepFit);
  }
  function stepFit() {
    fitFrame = null;
    if (!autoFit) return;
    if (dragging) { fitFrame = requestAnimationFrame(stepFit); return; }
    var cur = d3.zoomTransform(svgEl);
    var tgt = fitTransform();
    var a = 0.1;
    var k = cur.k + (tgt.k - cur.k) * a;
    var x = cur.x + (tgt.x - cur.x) * a;
    var y = cur.y + (tgt.y - cur.y) * a;
    var settled = Math.abs(tgt.k - cur.k) < 0.002 && Math.abs(tgt.x - cur.x) < 0.5 && Math.abs(tgt.y - cur.y) < 0.5;
    svg.call(zoom.transform, settled ? tgt : d3.zoomIdentity.translate(x, y).scale(k));
    if (!settled || sim.alpha() > sim.alphaMin()) fitFrame = requestAnimationFrame(stepFit);
  }

  function zoomBy(factor) {
    autoFit = false;
    if (reducedMotion()) svg.call(zoom.scaleBy, factor);
    else svg.transition().duration(320).ease(d3.easeCubicOut).call(zoom.scaleBy, factor);
  }
  function refit() {
    autoFit = true;
    if (reducedMotion()) fitNow(); else startFitLoop();
  }

  function resize() {
    var w = Math.round(svgEl.clientWidth) || 640;
    var h = Math.round(svgEl.clientHeight) || 420;
    if (w === W && h === H) return;
    W = w; H = h;
    svgEl.setAttribute('viewBox', (-W / 2) + ' ' + (-H / 2) + ' ' + W + ' ' + H);
    // A wide stage lets the graph spread sideways; a tall phone stage, downwards.
    sim.force('x').strength(0.03 * Math.min(1.6, Math.max(0.6, 640 / W)));
    sim.force('y').strength(0.055 * Math.min(1.6, Math.max(0.6, 420 / H)));
    if (autoFit) { if (reducedMotion() || !sim.alpha() || sim.alpha() < sim.alphaMin()) fitNow(); else startFitLoop(); }
  }

  // ---------- drag ----------
  var drag = d3.drag()
    .clickDistance(5)
    .on('start', function (ev, n) {
      dragging = true;
      if (!ev.active) sim.alphaTarget(0.25).restart();
      n.fx = n.x; n.fy = n.y;
    })
    .on('drag', function (ev, n) { n.fx = ev.x; n.fy = ev.y; })
    .on('end', function (ev, n) {
      dragging = false;
      if (!ev.active) sim.alphaTarget(0);
      if (n.id !== ROOT_ID) { n.fx = null; n.fy = null; }
      else { n.fx = 0; n.fy = 0; }
      startFitLoop();
    });

  // ---------- events ----------
  function nodeFromEvent(ev) {
    var g = ev.target.closest && ev.target.closest('.net-node');
    return g ? g.getAttribute('data-id') : null;
  }

  nodeLayer.addEventListener('pointerover', function (ev) {
    var id = nodeFromEvent(ev);
    if (id === null) return;
    hoverId = id;
    if (selected === null) highlight(id);
  });
  nodeLayer.addEventListener('pointerout', function (ev) {
    var id = nodeFromEvent(ev);
    if (id === null) return;
    var to = ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('.net-node');
    if (to && to.getAttribute('data-id') === id) return;
    hoverId = null;
    restoreHighlight();
  });
  nodeLayer.addEventListener('focusin', function (ev) {
    var id = nodeFromEvent(ev);
    if (id === null) return;
    hoverId = id;
    if (selected === null) highlight(id);
  });
  nodeLayer.addEventListener('focusout', function (ev) {
    if (nodeFromEvent(ev) === null) return;
    hoverId = null;
    restoreHighlight();
  });
  nodeLayer.addEventListener('click', function (ev) {
    var id = nodeFromEvent(ev);
    if (id === null) return;
    // detail === 0 means the click came from the keyboard (or assistive tech).
    activate(id, ev.detail === 0);
  });
  nodeLayer.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    var id = nodeFromEvent(ev);
    if (id === null) return;
    ev.preventDefault();
    activate(id, true);
  });
  svgEl.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' || !linkMode) return;
    if (selected !== null) { clearSelection(); restoreHighlight(); refreshAll(); announce('Selection cleared.'); }
    else setLinkMode(false);
  });

  if (linkBtn) linkBtn.addEventListener('click', function () { setLinkMode(!linkMode); });
  if (resetBtn) resetBtn.addEventListener('click', function () { reset(true); });

  var zoomBtns = stage.querySelectorAll('[data-zoom]');
  for (var zb = 0; zb < zoomBtns.length; zb++) {
    zoomBtns[zb].addEventListener('click', function () {
      var action = this.getAttribute('data-zoom');
      if (action === 'in') zoomBy(1.35);
      else if (action === 'out') zoomBy(1 / 1.35);
      else refit();
    });
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(svgEl);
  } else {
    window.addEventListener('resize', resize);
  }

  var HINT_DEFAULT = hintEl ? hintEl.textContent : '';
  var HINT_LINK = 'Link mode: choose two topics to draw your own connection between them. Press Escape or "Done linking" to go back to opening topics.';

  // ---------- start / reset ----------
  function reset(announceIt) {
    if (hasGSAP) {
      links.forEach(function (l) { gsap.killTweensOf(l); });
      nodes.forEach(function (n) { gsap.killTweensOf(n.el.querySelector('.glow')); });
    }
    sim.stop();
    edgeLayer.textContent = '';
    nodeLayer.textContent = '';
    nodes = []; nodeById = {}; links = []; linkByKey = {}; expanded = {};
    selected = null; hoverId = null;
    if (linkMode) {
      linkMode = false;
      stage.classList.remove('is-linking');
      if (linkBtn) { linkBtn.setAttribute('aria-pressed', 'false'); linkBtn.textContent = 'Draw your own link'; }
      if (hintEl) hintEl.textContent = HINT_DEFAULT;
    }

    var root = addNode(ROOT_ID, null, 0, 1);
    expanded[ROOT_ID] = true;
    var courses = CHILDREN[ROOT_ID];
    courses.forEach(function (cid, i) {
      var a = (i / courses.length) * Math.PI * 2 - Math.PI * 0.75;
      var c = addNode(cid, null, i, courses.length);
      c.x = Math.cos(a) * 110; c.y = Math.sin(a) * 80;
      addLink(root, c, false);
      glowPulse(c);
    });
    syncSim();
    // Settle the opening layout before anyone sees it.
    sim.alpha(1);
    for (var i = 0; i < 240; i++) sim.tick();
    render();
    refreshAll();
    autoFit = true;
    fitNow();
    if (announceIt) announce('Graph reset to your ' + plural(courses.length, 'course') + '.');
  }

  resize();
  reset(false);
})();
