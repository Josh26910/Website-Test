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
  // Shared with js/network-graph.js so the graph's motion matches the rest of the site.
  window.Recall = { EASE: EASE };

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
