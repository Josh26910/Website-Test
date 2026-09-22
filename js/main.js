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

    var W = 640, H = 420, COUNT = 22, ACCENT = 5;
    var nodes = [];
    for (var i = 0; i < COUNT; i++) {
      nodes.push({ id: i, x: 40 + rand() * (W - 80), y: 40 + rand() * (H - 80), accent: false });
    }
    var accentIdx = [];
    while (accentIdx.length < ACCENT) {
      var idx = Math.floor(rand() * COUNT);
      if (accentIdx.indexOf(idx) === -1) { accentIdx.push(idx); nodes[idx].accent = true; }
    }

    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

    var edgeSet = {};
    var edges = [];
    function addEdge(a, b) {
      var key = a < b ? a + '-' + b : b + '-' + a;
      if (edgeSet[key]) return;
      edgeSet[key] = true;
      edges.push({ a: a, b: b, custom: false });
    }
    nodes.forEach(function (n) {
      var others = nodes.filter(function (m) { return m.id !== n.id; })
        .sort(function (p, q) { return dist(n, p) - dist(n, q); });
      addEdge(n.id, others[0].id);
      addEdge(n.id, others[1].id);
    });

    var NS = 'http://www.w3.org/2000/svg';
    var edgeLayer = document.createElementNS(NS, 'g');
    var nodeLayer = document.createElementNS(NS, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

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
    nodes.forEach(function (n) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'net-node' + (n.accent ? ' is-accent' : ''));
      g.setAttribute('data-id', n.id);

      var glow = document.createElementNS(NS, 'circle');
      glow.setAttribute('class', 'glow');
      glow.setAttribute('cx', n.x); glow.setAttribute('cy', n.y); glow.setAttribute('r', 13);
      g.appendChild(glow);

      var ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'ring');
      ring.setAttribute('cx', n.x); ring.setAttribute('cy', n.y); ring.setAttribute('r', 9);
      g.appendChild(ring);

      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'dot');
      dot.setAttribute('cx', n.x); dot.setAttribute('cy', n.y);
      dot.setAttribute('r', n.accent ? 5.5 : 3.5);
      g.appendChild(dot);

      nodeLayer.appendChild(g);
      nodeEls[n.id] = g;
    });

    function neighborsOf(id) {
      return edges.filter(function (e) { return e.a === id || e.b === id; });
    }

    function clearHighlight() {
      Object.keys(nodeEls).forEach(function (id) { nodeEls[id].classList.remove('is-lit', 'is-dim'); });
      edges.forEach(function (e) { e.el.classList.remove('is-lit', 'is-dim'); });
    }

    function highlight(id) {
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
      var glows = svg.querySelectorAll('.net-node.is-accent .glow');
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
