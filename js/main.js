(function () {
  var page = document.getElementById('page');
  var loader = document.getElementById('loader');
  var counterEl = document.getElementById('loaderCount');

  var hasGSAP = typeof gsap !== 'undefined';
  var hasScrollTrigger = typeof ScrollTrigger !== 'undefined';
  var hasLenis = typeof Lenis !== 'undefined';

  if (hasGSAP && hasScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  var EASE = 'power3.out';

  function revealPage() {
    if (page) page.style.opacity = '1';
    if (hasGSAP) {
      gsap.fromTo(page, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: EASE });
    }
  }

  function finishLoader() {
    if (!loader) { revealPage(); return; }
    if (hasGSAP) {
      gsap.to(loader, {
        yPercent: -100,
        duration: 0.9,
        ease: 'power4.inOut',
        onComplete: function () {
          loader.style.display = 'none';
        }
      });
      revealPage();
    } else {
      loader.style.display = 'none';
      revealPage();
    }
  }

  // Progress counter (cosmetic minimum-duration loader)
  var progress = 0;
  var interval = setInterval(function () {
    progress += Math.random() * 22 + 8;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      setTimeout(finishLoader, 220);
    }
    if (counterEl) counterEl.textContent = Math.floor(progress) + '%';
  }, 130);

  // Safety net: never let the loader trap the page
  setTimeout(function () {
    if (loader && loader.style.display !== 'none') finishLoader();
  }, 2600);

  // Smooth scroll (Lenis)
  if (hasLenis) {
    var lenis = new Lenis({
      duration: 1.1,
      easing: function (t) { return 1 - Math.pow(1 - t, 3); },
      smoothWheel: true
    });
    if (hasGSAP && hasScrollTrigger) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
    }
  }

  // ---------- Interactive network ----------
  (function initNetwork() {
    var svg = document.getElementById('networkSvg');
    if (!svg) return;

    function mulberry32(a) {
      return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    var rand = mulberry32(42);

    var W = 640, H = 420;
    var HUB_DEFS = [
      { label: 'ECON 201', x: 140, y: 125 },
      { label: 'BIO 110', x: 480, y: 105 },
      { label: 'CHEM 204', x: 160, y: 305 },
      { label: 'PSYC 101', x: 495, y: 310 }
    ];
    var ACTIONS = ['+3 questions', 'New session', 'Score shared', 'Bank updated', 'Streak kept', 'Room opened', 'Round finished'];

    var nodes = [];
    var hubIds = [];
    HUB_DEFS.forEach(function (h) {
      var hubId = nodes.length;
      nodes.push({ id: hubId, x: h.x, y: h.y, isHub: true, hub: null, label: h.label });
      hubIds.push(hubId);

      var branchCount = 4 + Math.floor(rand() * 3);
      for (var b = 0; b < branchCount; b++) {
        var angle = (b / branchCount) * Math.PI * 2 + rand() * 0.6;
        var radius = 62 + rand() * 30;
        var bx = Math.max(26, Math.min(W - 26, h.x + Math.cos(angle) * radius));
        var by = Math.max(26, Math.min(H - 26, h.y + Math.sin(angle) * radius));
        nodes.push({
          id: nodes.length, x: bx, y: by, isHub: false, hub: hubId,
          label: ACTIONS[Math.floor(rand() * ACTIONS.length)]
        });
      }
    });

    var edgeSet = {};
    var edges = [];
    function addEdge(a, b) {
      var key = a < b ? a + '-' + b : b + '-' + a;
      if (edgeSet[key]) return;
      edgeSet[key] = true;
      edges.push({ a: a, b: b, custom: false });
    }
    nodes.forEach(function (n) {
      if (!n.isHub) addEdge(n.hub, n.id);
    });

    var NS = 'http://www.w3.org/2000/svg';
    var edgeLayer = document.createElementNS(NS, 'g');
    var arrowLayer = document.createElementNS(NS, 'g');
    var nodeLayer = document.createElementNS(NS, 'g');
    var labelLayer = document.createElementNS(NS, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(arrowLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(labelLayer);

    function drawEdge(e) {
      var a = nodes[e.a], b = nodes[e.b];
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('class', 'net-edge' + (e.custom ? ' is-custom' : ''));
      edgeLayer.appendChild(line);
      e.el = line;
    }
    edges.forEach(drawEdge);

    var nodeEls = {};
    var labelEls = {};
    nodes.forEach(function (n) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'net-node' + (n.isHub ? ' is-hub' : ''));
      g.setAttribute('data-id', n.id);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', n.isHub
        ? n.label + ' topic — press Enter to see everything connected to it'
        : n.label + ', part of ' + nodes[n.hub].label + ' — press Enter to see its link, or select another dot to connect them');

      var glow = document.createElementNS(NS, 'circle');
      glow.setAttribute('class', 'glow');
      glow.setAttribute('cx', n.x); glow.setAttribute('cy', n.y); glow.setAttribute('r', n.isHub ? 16 : 10);
      g.appendChild(glow);

      var ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'ring');
      ring.setAttribute('cx', n.x); ring.setAttribute('cy', n.y); ring.setAttribute('r', n.isHub ? 11 : 8);
      g.appendChild(ring);

      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'dot');
      dot.setAttribute('cx', n.x); dot.setAttribute('cy', n.y);
      dot.setAttribute('r', n.isHub ? 7 : 3.5);
      g.appendChild(dot);

      nodeLayer.appendChild(g);
      nodeEls[n.id] = g;

      var text = document.createElementNS(NS, 'text');
      text.setAttribute('class', 'net-label' + (n.isHub ? ' is-hub-label' : ''));
      text.setAttribute('x', n.x);
      text.setAttribute('y', n.isHub ? n.y - 18 : n.y - 12);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = n.label;
      labelLayer.appendChild(text);
      labelEls[n.id] = text;
    });

    // Flying arrow markers, one per hub -> branch edge
    var arrowsByHub = {};
    edges.forEach(function (e) {
      var hub = nodes[e.a].isHub ? nodes[e.a] : (nodes[e.b].isHub ? nodes[e.b] : null);
      if (!hub || e.custom) return;
      var branch = hub.id === e.a ? nodes[e.b] : nodes[e.a];
      var angleDeg = Math.atan2(branch.y - hub.y, branch.x - hub.x) * (180 / Math.PI);

      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'net-arrow');
      g.setAttribute('transform', 'translate(' + hub.x + ',' + hub.y + ') rotate(' + angleDeg + ')');
      var poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', '-5,-3 5,0 -5,3');
      g.appendChild(poly);
      arrowLayer.appendChild(g);

      if (hasGSAP) {
        var tween = gsap.to(g, {
          x: branch.x, y: branch.y, duration: 1 + rand() * 0.4,
          ease: 'power1.inOut', repeat: -1, paused: true
        });
        (arrowsByHub[hub.id] = arrowsByHub[hub.id] || []).push({ el: g, tween: tween });
      }
    });

    function neighborsOf(id) {
      return edges.filter(function (e) { return e.a === id || e.b === id; });
    }

    function stopArrows(hubId) {
      (arrowsByHub[hubId] || []).forEach(function (a) {
        a.tween.pause(0);
        a.el.classList.remove('is-active');
      });
    }
    function playArrows(hubId) {
      (arrowsByHub[hubId] || []).forEach(function (a) {
        a.el.classList.add('is-active');
        a.tween.restart();
      });
    }

    function clearHighlight() {
      Object.keys(nodeEls).forEach(function (id) { nodeEls[id].classList.remove('is-lit', 'is-dim'); });
      edges.forEach(function (e) { e.el.classList.remove('is-lit', 'is-dim'); });
      Object.keys(labelEls).forEach(function (id) { labelEls[id].classList.remove('is-visible'); });
      hubIds.forEach(stopArrows);
    }

    function highlight(id) {
      var node = nodes[id];
      var connectedIds = {};
      connectedIds[id] = true;
      neighborsOf(id).forEach(function (e) { connectedIds[e.a] = true; connectedIds[e.b] = true; });

      Object.keys(nodeEls).forEach(function (nid) {
        var lit = connectedIds[nid];
        nodeEls[nid].classList.toggle('is-lit', !!lit);
        nodeEls[nid].classList.toggle('is-dim', !lit);
      });
      edges.forEach(function (e) {
        var lit = e.a === id || e.b === id;
        e.el.classList.toggle('is-lit', lit);
        e.el.classList.toggle('is-dim', !lit);
      });
      Object.keys(labelEls).forEach(function (nid) {
        labelEls[nid].classList.toggle('is-visible', !!connectedIds[nid]);
      });

      hubIds.forEach(function (hid) {
        if (node.isHub && hid === id) playArrows(hid); else stopArrows(hid);
      });
    }

    var selected = null;

    nodeLayer.addEventListener('pointerover', function (ev) {
      var g = ev.target.closest('.net-node');
      if (!g || selected !== null) return;
      highlight(Number(g.getAttribute('data-id')));
    });
    nodeLayer.addEventListener('pointerout', function (ev) {
      if (selected !== null) return;
      if (!ev.target.closest('.net-node')) return;
      clearHighlight();
    });

    // Keyboard equivalents of hover (focus) and click (Enter/Space)
    nodeLayer.addEventListener('focusin', function (ev) {
      var g = ev.target.closest('.net-node');
      if (!g || selected !== null) return;
      highlight(Number(g.getAttribute('data-id')));
    });
    nodeLayer.addEventListener('focusout', function (ev) {
      if (selected !== null) return;
      if (!ev.target.closest('.net-node')) return;
      clearHighlight();
    });
    nodeLayer.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
      var g = ev.target.closest('.net-node');
      if (!g) return;
      ev.preventDefault();
      g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    nodeLayer.addEventListener('click', function (ev) {
      var g = ev.target.closest('.net-node');
      if (!g) return;
      var id = Number(g.getAttribute('data-id'));

      if (selected === null) {
        selected = id;
        g.classList.add('is-selected');
        highlight(id);
        return;
      }
      if (selected === id) {
        g.classList.remove('is-selected');
        selected = null;
        clearHighlight();
        return;
      }
      addEdge(selected, id);
      var newEdge = edges[edges.length - 1];
      newEdge.custom = true;
      drawEdge(newEdge);

      nodeEls[selected].classList.remove('is-selected');
      selected = null;
      clearHighlight();
    });

    var resetBtn = document.getElementById('networkReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        for (var k = edges.length - 1; k >= 0; k--) {
          if (edges[k].custom) {
            edges[k].el.remove();
            edges.splice(k, 1);
          }
        }
        edgeSet = {};
        edges.forEach(function (e) { edgeSet[e.a < e.b ? e.a + '-' + e.b : e.b + '-' + e.a] = true; });
        if (selected !== null) { nodeEls[selected].classList.remove('is-selected'); selected = null; }
        clearHighlight();
      });
    }

    if (hasGSAP) {
      var glows = svg.querySelectorAll('.net-node.is-hub .glow');
      for (var gi = 0; gi < glows.length; gi++) {
        gsap.to(glows[gi], {
          opacity: 0.4, duration: 2.2 + (gi % 3), repeat: -1, yoyo: true, ease: 'sine.inOut', delay: gi * 0.3
        });
      }
      gsap.to(svg, {
        rotate: 1.1, transformOrigin: '50% 50%', duration: 6, repeat: -1, yoyo: true, ease: 'sine.inOut'
      });
    }
  })();

  if (!hasGSAP) return;

  // Hero entrance
  gsap.set('.reveal-up, .reveal-scale', { opacity: 0 });

  var heroTl = gsap.timeline({ delay: 1.15, defaults: { ease: EASE } });
  heroTl.to('.hero .reveal-up', {
    opacity: 1, y: 0, duration: 0.9, stagger: 0.09
  }, 0)
  .fromTo('.hero .reveal-up', { y: 26 }, { y: 0, duration: 0.9, stagger: 0.09, ease: EASE }, 0)
  .fromTo('.hero-visual', { opacity: 0, y: 34, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: EASE }, 0.15);

  // Scroll-triggered reveals for everything below the hero
  if (hasScrollTrigger) {
    var items = gsap.utils.toArray('.reveal-up:not(.hero .reveal-up), .reveal-scale:not(.hero-visual)');
    items.forEach(function (el) {
      gsap.fromTo(el,
        { opacity: 0, y: 28 },
        {
          opacity: 1, y: 0, duration: 0.85, ease: EASE,
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });

    // Stagger the step cards together
    gsap.utils.toArray('.steps').forEach(function (group) {
      var cards = group.querySelectorAll('.step');
      gsap.fromTo(cards, { opacity: 0, y: 30 }, {
        opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: EASE,
        scrollTrigger: { trigger: group, start: 'top 85%' }
      });
    });

    // Scroll-driven quiz deck fan
    var deckCards = gsap.utils.toArray('.deck-card');
    if (deckCards.length) {
      var deckTl = gsap.timeline({
        scrollTrigger: {
          trigger: '.deck',
          start: 'top top',
          end: '+=2200',
          pin: true,
          scrub: 1
        }
      });
      deckCards.forEach(function (card, i) {
        var dir = i - (deckCards.length - 1) / 2;
        deckTl.to(card, {
          x: dir * 140,
          y: -Math.abs(dir) * 20,
          rotate: dir * 9,
          duration: 1
        }, i * 0.2);
      });
    }
  }
})();
