// Flicx Interactive Experience Engine for Kaira
(function() {
  // --- 1. Dynamic Featured Hero Carousel Engine (Movies & TV Shows) ---
  const dynamicHeroCache = { movie: null, tv: null };
  let currentHeroSlides = [];
  let currentSlideIndex = 0;
  let heroTimer = null;
  let isPaused = false;
  const slideDuration = 7000;

  // Known rich overviews map for top releases
  const OVERVIEWS = {
    'the-odyssey-2026': "After the Trojan War, Odysseus faces a dangerous voyage back to Ithaca, meeting creatures like the Cyclops Polyphemus, Sirens, and Calypso along the way.",
    'spider-man-brand-new-day-2026': "Peter Parker navigates life as a street-level hero in New York City while confronting emerging underworld threats and balancing his dual identity.",
    'resident-evil-2026': "A biological outbreak unravels a shadowy conspiracy as elite survivors navigate treacherous quarantine zones infested with deadly viral horrors.",
    'heart-of-the-beast-2026': "After a harrowing plane crash, Special Forces veteran James Belmont and his combat dog, Odin, find themselves stranded deep in the Alaskan wilderness.",
    'obsession-2026': "An intense psychological thriller following a high-stakes entanglement where hidden secrets and obsession collide with devastating consequences.",
    'mutiny-2026': "After his billionaire boss is murdered, Cole Reed is framed for the crime and embarks on a high-octane quest across continents to expose an international conspiracy.",
    'project-hail-mary-2026': "Ryland Grace is the sole survivor on a desperate, last-chance mission—and if he fails, humanity and the Earth itself will perish.",
    'hope-2026': "In the desolate outskirts of a remote harbor town, an enigmatic discovery sends shockwaves through a fragile community.",
    'the-mentalist-2008': "Patrick Jane, a former celebrity psychic medium, uses his razor sharp skills of observation and expertise at reading people to solve serious crimes with the California Bureau of Investigation.",
    'dexter-resurrection-2025': "Dexter Morgan returns to navigate new dark trials in New York City, balancing his twisted instincts with a father's protective duty.",
    'the-lord-of-the-rings-the-rings-of-power-2022': "Beginning in a time of relative peace, an ensemble cast of characters confront the re-emergence of evil in Middle-earth.",
    'avatar-seven-havens-2026': "In a newly awakened era of elemental balance, heroes across the Seven Havens unite to protect an ancient power from total collapse.",
    'visionquest-2026': "White Vision explores the truth of his identity and newfound humanity while confronting adversaries determined to weaponize his core.",
    'campus-drivers-2026': "A spirited ensemble drama following four university students navigating love, speed, rivalries, and life on and off the campus track."
  };

  async function fetchDynamicHeroReleases(isTv) {
    const cacheKey = isTv ? 'tv' : 'movie';
    if (dynamicHeroCache[cacheKey]) {
      return dynamicHeroCache[cacheKey];
    }

    try {
      const endpoint = isTv ? '/api/trending?kind=tv' : '/api/trending?kind=movie';
      const browseEndpoint = isTv ? '/api/browse?kind=show&sort=release_date' : '/api/browse?kind=movie&sort=release_date';

      const [trendingRes, browseRes] = await Promise.all([
        fetch(endpoint).then(r => r.json()).catch(() => null),
        fetch(browseEndpoint).then(r => r.json()).catch(() => null)
      ]);

      const candidates = [];
      const seen = new Set();

      if (trendingRes?.lists?.week) {
        for (const item of trendingRes.lists.week) {
          if (!seen.has(item.slug)) {
            candidates.push(item);
            seen.add(item.slug);
          }
        }
      }

      if (browseRes?.films) {
        for (const item of browseRes.films) {
          if (!seen.has(item.slug)) {
            candidates.push(item);
            seen.add(item.slug);
          }
        }
      }

      if (trendingRes?.lists?.day) {
        for (const item of trendingRes.lists.day) {
          if (!seen.has(item.slug)) {
            candidates.push(item);
            seen.add(item.slug);
          }
        }
      }

      // Sort by newest release year first, then rating
      candidates.sort((a, b) => {
        const yA = Number(a.year) || 0;
        const yB = Number(b.year) || 0;
        if (yA !== yB) return yB - yA;
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      });

      const topReleases = candidates.slice(0, 6);
      const formatted = topReleases.map(f => {
        let logoAspect = 2.5;
        if (f.logo && f.logo.box && f.logo.w && f.logo.h) {
          const [left, top, right, bottom] = f.logo.box;
          const w = right - left;
          const h = bottom - top;
          if (w > 0 && h > 0) {
            logoAspect = Number(((w * f.logo.w) / (h * f.logo.h)).toFixed(4));
          }
        }

        const mins = f.runtime ? Number(f.runtime) : 120;
        const runtimeStr = isTv
          ? (mins <= 20 ? `${mins} Seasons` : '1 Season')
          : `${Math.floor(mins / 60)}h ${mins % 60}m`;

        return {
          id: f.id,
          slug: f.slug,
          title: f.title,
          year: f.year || 2026,
          rating: f.rating ? Number(f.rating).toFixed(1) : '8.4',
          runtime: runtimeStr,
          genres: f.genres && f.genres.length > 0 ? f.genres : ['Action', 'Drama'],
          tag: f.year >= 2026 ? 'New release 2026' : (isTv ? 'Trending series' : 'Trending this week'),
          still: f.still || `https://s.fli.cx/a/background/medium/${f.id}/img`,
          logo: f.logo ? `https://s.fli.cx/a/logo/medium/${f.id}/img` : null,
          logoAspect: logoAspect,
          backdropTone: f.backdropTone || '#1f2933',
          tone: f.tone || '#5d341e',
          overview: OVERVIEWS[f.slug] || `${f.title} (${f.year || 2026}) - An acclaimed ${f.genres ? f.genres.join(' and ') : 'cinematic'} release streaming now on Flicx.`,
          watchUrl: `/watch/${f.slug}`,
          detailUrl: isTv ? `/tv/${f.slug}` : `/movie/${f.slug}`
        };
      });

      if (formatted.length > 0) {
        dynamicHeroCache[cacheKey] = formatted;
        return formatted;
      }
    } catch (err) {
      console.warn('Failed to fetch dynamic hero releases:', err);
    }

    return null;
  }

  async function initHeroCarousel() {
    const path = window.location.pathname;
    const cleanPath = path.split('?')[0].replace(/\/$/, '') || '/';
    const isTvBrowse = cleanPath === '/tv';
    const isHome = cleanPath === '/' || cleanPath === '/index.html';
    if (!isHome && !isTvBrowse) {
      if (heroTimer) {
        clearInterval(heroTimer);
        heroTimer = null;
      }
      return;
    }
    const isTv = isTvBrowse;

    const heroEl = document.querySelector('.hero');
    const stage = document.querySelector('.hero-stage');
    if (!heroEl || !stage) return;

    // Clear any previous timer
    if (heroTimer) {
      clearInterval(heroTimer);
      heroTimer = null;
    }

    // 1. Fetch live dynamic releases (e.g. 2026 latest releases)
    const dynamicReleases = await fetchDynamicHeroReleases(isTv);
    const slides = dynamicReleases && dynamicReleases.length > 0 ? dynamicReleases : [
      {
        slug: "the-odyssey-2026",
        title: "The Odyssey",
        id: "tt33764258",
        still: "https://s.fli.cx/t/original/dZI4Ek4qc2Fib2G1zFkGhKKuc6j.jpg",
        logo: "https://s.fli.cx/a/logo/medium/tt33764258/img",
        logoAspect: 2.58,
        tag: "New release 2026",
        rating: "8.4",
        year: 2026,
        runtime: "2h 53m",
        genres: ["Action", "Adventure", "Drama"],
        overview: OVERVIEWS["the-odyssey-2026"],
        watchUrl: "/watch/the-odyssey-2026",
        detailUrl: "/movie/the-odyssey-2026",
        backdropTone: "#1f2933",
        tone: "#5d341e"
      }
    ];

    currentHeroSlides = slides;
    currentSlideIndex = 0;

    // 2. Populate .hero-media with multi-slide structure for authentic hero-cross animations
    const heroMedia = stage.querySelector('.hero-media');
    if (heroMedia) {
      heroMedia.innerHTML = slides.map((s, idx) => `
        <div class="hero-slide" data-slide-idx="${idx}" data-state="${idx === 0 ? 'active' : 'idle'}" ${idx === 0 ? 'data-animate=""' : ''} style="background: ${s.backdropTone};">
          <img src="${s.still}" alt="" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${idx === 0 ? 'high' : 'low'}" draggable="false" style="object-fit:cover;object-position:50% 20%;width:100%;height:100%;" />
        </div>
      `).join('');
    }

    // 3. Populate .hero-switch-bars with dynamic buttons (both desktop and mobile!)
    const switchBarsContainers = stage.querySelectorAll('.hero-switch-bars');
    switchBarsContainers.forEach(container => {
      container.innerHTML = slides.map((s, idx) => `
        <button type="button" aria-label="${idx + 1} of ${slides.length}: ${s.title}" class="hero-switch-bar" ${idx === 0 ? 'aria-current="true"' : ''} data-index="${idx}">
          <span>${idx === 0 ? '<span class="hero-switch-fill hero-clock"></span>' : ''}</span>
        </button>
      `).join('');

      // Wire click handlers on switcher bars
      container.querySelectorAll('.hero-switch-bar').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetIdx = parseInt(btn.getAttribute('data-index'), 10);
          if (!isNaN(targetIdx) && targetIdx !== currentSlideIndex) {
            renderSlide(targetIdx, true);
          }
        };
      });
    });

    // 4. Render Slide Function with authentic Flicx transitions
    function renderSlide(index, animate = true) {
      const prevIndex = currentSlideIndex;
      currentSlideIndex = index;
      const data = slides[index];
      if (!data) return;

      // A. Slide Crossfade (hero-cross)
      if (heroMedia) {
        const allSlides = heroMedia.querySelectorAll('.hero-slide');
        allSlides.forEach((slide, sIdx) => {
          if (sIdx === index) {
            slide.setAttribute('data-state', 'active');
            if (animate) {
              slide.setAttribute('data-animate', '');
            } else {
              slide.removeAttribute('data-animate');
            }
          } else if (sIdx === prevIndex && animate) {
            slide.setAttribute('data-state', 'leaving');
            slide.removeAttribute('data-animate');
          } else {
            slide.setAttribute('data-state', 'idle');
            slide.removeAttribute('data-animate');
          }
        });
      }

      // B. Update Hero Copy
      const copyGroup = stage.querySelector('.hero-copy [role="group"][aria-roledescription="slide"]');
      if (copyGroup) {
        copyGroup.setAttribute('aria-label', `${index + 1} of ${slides.length}`);
        copyGroup.style.opacity = '1';
      }

      // Title & Logo
      const logoSpan = stage.querySelector('.title-logo');
      const h2Heading = stage.querySelector('.hero-copy h2:not(.sr-only)');
      if (logoSpan) {
        if (data.logo) {
          logoSpan.style.display = 'block';
          logoSpan.style.setProperty('--logo-aspect', String(data.logoAspect));
          logoSpan.style.aspectRatio = String(data.logoAspect);
          logoSpan.innerHTML = `
            <img alt="${data.title}" src="${data.logo}" class="fade-in" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 14px rgba(0,0,0,0.6));" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='block';" />
            <h2 class="text-3xl md:text-5xl font-black text-fg tracking-tight" style="display:none;margin:0;line-height:1.1;">${data.title}</h2>
          `;
        } else {
          logoSpan.style.display = 'none';
          if (h2Heading) {
            h2Heading.style.display = 'block';
            h2Heading.textContent = data.title;
          } else {
            const h2 = document.createElement('h2');
            h2.className = 'text-3xl md:text-5xl font-black text-fg tracking-tight';
            h2.style.cssText = 'margin:0;line-height:1.1;filter:drop-shadow(0 2px 14px rgba(0,0,0,0.6));';
            h2.textContent = data.title;
            logoSpan.parentNode.insertBefore(h2, logoSpan);
          }
        }
      }

      const titleSr = stage.querySelector('.hero-copy h2.sr-only');
      if (titleSr) titleSr.textContent = data.title;

      const counterSr = stage.querySelector('.hero-copy p.sr-only');
      if (counterSr) counterSr.textContent = `${isTv ? 'Show' : 'Film'} ${index + 1} of ${slides.length}: ${data.title}`;

      // Facts badges
      const factsUl = stage.querySelector('.hero-copy ul.facts');
      if (factsUl) {
        factsUl.innerHTML = `
          <li class="badge badge-accent">${data.tag}</li>
          ${data.rating ? `<li class="badge">★ ${data.rating}</li>` : ''}
          <li class="badge">${data.year}</li>
          <li class="badge">${data.runtime}</li>
          ${data.genres.map(g => `<li class="badge"><a href="/genres/${g.toLowerCase()}" class="hover:underline">${g}</a></li>`).join('')}
        `;
      }

      // Overview
      const overview = stage.querySelector('.hero-overview');
      if (overview) overview.textContent = data.overview;

      // Action buttons
      const playBtn = stage.querySelector('.hero-actions a.btn-primary, .capsule-btn-play');
      if (playBtn) playBtn.href = data.watchUrl;

      const detailsBtn = stage.querySelector('.hero-actions a[href*="/movie/"], .hero-actions a[href*="/tv/"], a.capsule-btn[title="Details"]');
      if (detailsBtn) {
        detailsBtn.href = data.detailUrl;
        detailsBtn.setAttribute('title', `Details for ${data.title}`);
      }

      const addBtn = stage.querySelector('.hero-actions button[data-watchlist-button]');
      if (addBtn) {
        addBtn.setAttribute('data-title-slug', data.slug);
        addBtn.setAttribute('data-title-id', data.id);
        addBtn.setAttribute('data-title', data.title);
        const inLibrary = typeof isInWatchlist === 'function' ? isInWatchlist(data.slug) : false;
        if (typeof updateWatchlistButton === 'function') {
          updateWatchlistButton(addBtn, inLibrary, data.title);
        } else {
          addBtn.setAttribute('aria-pressed', inLibrary ? 'true' : 'false');
          addBtn.setAttribute('title', inLibrary ? 'In your library' : 'Add to library');
          addBtn.setAttribute('aria-label', `${inLibrary ? 'In your library' : 'Add to library'}: ${data.title}`);
        }
      }

      // C. Switcher Bars & Hero Clock across ALL containers (both desktop and mobile)
      switchBarsContainers.forEach(container => {
        const bars = container.querySelectorAll('.hero-switch-bar');
        bars.forEach((bar, bIdx) => {
          if (bIdx === index) {
            bar.setAttribute('aria-current', 'true');
            bar.innerHTML = '<span><span class="hero-switch-fill hero-clock"></span></span>';
            const fill = bar.querySelector('.hero-switch-fill');
            if (fill) {
              fill.addEventListener('animationend', () => {
                if (!isPaused && document.documentElement.getAttribute('data-motion') !== 'reduce') {
                  if (heroTimer) {
                    clearTimeout(heroTimer);
                    heroTimer = null;
                  }
                  renderSlide((currentSlideIndex + 1) % slides.length, true);
                }
              }, { once: true });
            }
          } else {
            bar.removeAttribute('aria-current');
            bar.innerHTML = '<span></span>';
          }
        });
      });

      // JavaScript fallback timer ensures the slideshow ALWAYS advances every 9 seconds
      if (heroTimer) {
        clearTimeout(heroTimer);
        heroTimer = null;
      }
      if (!isPaused) {
        heroTimer = setTimeout(() => {
          if (!isPaused && !heroEl.hasAttribute('data-paused')) {
            renderSlide((currentSlideIndex + 1) % slides.length, true);
          }
        }, slideDuration);
      }

      // Ambient lighting update
      const ambient = document.querySelector('.ambient');
      if (ambient && data.backdropTone) {
        ambient.style.setProperty('--ambient-bg', data.backdropTone);
      }
      if (heroEl && data.tone) {
        heroEl.style.setProperty('--accent', data.tone);
      }
    }

    // 5. Pause / Resume Buttons (both desktop and mobile)
    const pauseBtns = stage.querySelectorAll('.hero-pause, .hero-switch .capsule-btn');
    const pauseSvgPlay = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:1rem;height:1rem;"><polygon points="6,4 20,12 6,20"></polygon></svg>';
    const pauseSvgPause = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:1rem;height:1rem;"><rect x="5.5" y="4" width="4.6" height="16" rx="1.4"></rect><rect x="13.9" y="4" width="4.6" height="16" rx="1.4"></rect></svg>';

    function updatePauseButtons() {
      pauseBtns.forEach(btn => {
        btn.innerHTML = isPaused ? pauseSvgPlay : pauseSvgPause;
        btn.setAttribute('aria-label', isPaused ? 'Resume slideshow' : 'Pause slideshow');
        btn.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
      });
    }

    pauseBtns.forEach(pauseBtn => {
      pauseBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        isPaused = !isPaused;
        updatePauseButtons();
        if (isPaused) {
          heroEl.setAttribute('data-paused', '');
          if (heroTimer) {
            clearTimeout(heroTimer);
            heroTimer = null;
          }
        } else {
          heroEl.removeAttribute('data-paused');
          renderSlide(currentSlideIndex, false);
        }
      };
    });
    updatePauseButtons();

    // Hover pauses/resumes ONLY when directly over switch capsules
    const switchCapsules = stage.querySelectorAll('.hero-switch');
    switchCapsules.forEach(capsule => {
      capsule.addEventListener('mouseenter', () => {
        heroEl.setAttribute('data-paused', '');
        if (heroTimer) {
          clearTimeout(heroTimer);
          heroTimer = null;
        }
      });
      capsule.addEventListener('mouseleave', () => {
        if (!isPaused) {
          heroEl.removeAttribute('data-paused');
          if (heroTimer) clearTimeout(heroTimer);
          heroTimer = setTimeout(() => {
            if (!isPaused && !heroEl.hasAttribute('data-paused')) {
              renderSlide((currentSlideIndex + 1) % slides.length, true);
            }
          }, slideDuration);
        }
      });
    });

    // Initial render
    renderSlide(0, false);
  }

  // --- 2. Authentic OG Flicx Video Player & Star Servers ---
  function initWatchPlayer() {
    const path = window.location.pathname;
    if (!path.startsWith('/watch/')) return;

    // 1. Ensure authentic Flicx stylesheets are loaded
    if (!document.querySelector('link[href*="0svyhf-62ag72.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/_next/static/chunks/0svyhf-62ag72.css';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[href*="0u-qimbv7y_v5.css"]')) {
      const link2 = document.createElement('link');
      link2.rel = 'stylesheet';
      link2.href = '/_next/static/chunks/0u-qimbv7y_v5.css';
      document.head.appendChild(link2);
    }

    // 2. Load HLS.js script if not present
    if (!window.Hls && !document.querySelector('script[src*="hls.min.js"]')) {
      const hlsScript = document.createElement('script');
      hlsScript.src = '/hls.min.js';
      document.head.appendChild(hlsScript);
    }

    // 3. Extract slug and optional season/episode
    const parts = path.replace(/^\/watch\//, '').replace(/\/$/, '').split('/');
    const titleSlug = parts[0];
    let season = 1;
    let episode = 1;

    if (parts.length > 1) {
      const match = parts[1].match(/s(\d+)e(\d+)/i);
      if (match) {
        season = parseInt(match[1], 10);
        episode = parseInt(match[2], 10);
      }
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('s')) season = parseInt(urlParams.get('s'), 10) || 1;
      if (urlParams.has('e')) episode = parseInt(urlParams.get('e'), 10) || 1;
    }

    // 4. Locate or create .watch-root
    let watchRoot = document.querySelector('.watch-root');
    if (!watchRoot) {
      watchRoot = document.createElement('div');
      watchRoot.className = 'watch-root';
      document.body.prepend(watchRoot);
    }

    watchRoot.innerHTML = '<div class="watch-wait" style="background:#000;width:100%;height:100dvh;display:flex;align-items:center;justify-content:center;color:#fff;"><div class="fx-spinner" style="width:2.5rem;height:2.5rem;border:3px solid rgba(255,255,255,0.2);border-top-color:var(--color-flare, #f59e0b);border-radius:50%;animation:spin 0.8s linear infinite;"></div></div>';

    // 5. Fetch title details and OG Flicx sources
    fetch(`/api/title?slug=${encodeURIComponent(titleSlug)}`)
      .then(r => r.json())
      .catch(() => ({
        slug: titleSlug,
        title: titleSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        year: '2026',
        id: 'tt7526136'
      }))
      .then(titleInfo => {
        const isShow = titleInfo.runtime && (titleInfo.runtime.includes('Season') || titleInfo.runtime.includes('Series') || titleInfo.kind === 'show' || parts.length > 1);
        const imdbId = titleInfo.imdbId || titleInfo.id || 'tt7526136';

        // Query original Flicx sources API
        const sourcesUrl = `/api/sources/${imdbId}${isShow ? `?s=${season}&e=${episode}` : ''}`;
        fetch(sourcesUrl)
          .then(r => r.json())
          .catch(() => null)
          .then(sourcesData => {
            let serverList = [];
            if (sourcesData && Array.isArray(sourcesData.sources) && sourcesData.sources.length > 0) {
              // Deduplicate and filter authentic sources from fli.cx
              serverList = sourcesData.sources.filter(s => s && s.name && s.src);
            }

            // Fallback to authentic Flicx Star Servers if sources are empty or unreleased
            if (serverList.length === 0) {
              serverList = [
                { name: "Flicx", kind: "hls", src: `https://s.fli.cx/s/${imdbId}.m3u8`, group: "dedicated", has: true, quality: "4K" },
                { name: "Vega", kind: "hls", src: `https://s.fli.cx/s/vega-${imdbId}.m3u8`, group: "external", has: true, quality: "4K" },
                { name: "Sirius", kind: "hls", src: `https://s.fli.cx/s/sirius-${imdbId}.m3u8`, group: "external", has: true, quality: "4K" },
                { name: "Rigel", kind: "hls", src: `https://s.fli.cx/s/rigel-${imdbId}.m3u8`, group: "external", has: true, quality: "1080p" },
                { name: "Altair", kind: "hls", src: `https://s.fli.cx/s/altair-${imdbId}.m3u8`, group: "external", has: true, quality: "1080p" },
                { name: "Aldebaran", kind: "hls", src: `https://s.fli.cx/s/aldebaran-${imdbId}.m3u8`, group: "external", has: true, quality: "4K" }
              ];
            }

            renderPlayer(titleInfo, serverList, isShow, season, episode, imdbId);
          });
      });

    // 6. Render Authentic OG Flicx Video Player
    function renderPlayer(titleInfo, servers, isShow, season, episode, imdbId) {
      const cleanTitle = titleInfo.title || titleSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const yearStr = titleInfo.year || '';
      const backUrl = isShow ? `/tv/${titleSlug}` : `/movie/${titleSlug}`;

      let savedServerName = 'Flicx';
      try { savedServerName = localStorage.getItem('flicx:player:server') || 'Flicx'; } catch(e){}
      let currentServerIndex = servers.findIndex(s => s.name === savedServerName);
      if (currentServerIndex === -1) currentServerIndex = 0;
      let currentServer = servers[currentServerIndex];

      watchRoot.innerHTML = `
        <div class="watch-stage" style="background:#000;width:100%;height:100dvh;position:fixed;top:0;left:0;z-index:9999;user-select:none;">
          <div class="fx-player fx-theme" style="--fx-aspect:1.7777777777777777;width:100%;height:100%;background:#000;position:relative;overflow:hidden;" data-fx-page="">
            
            <!-- Video Stage -->
            <div class="fx-video-wrap" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;">
              <video id="flicx-video" class="fx-video" playsinline crossorigin="anonymous" style="width:100%;height:100%;object-fit:contain;background:#000;display:block;"></video>
              <div id="flicx-buffering" class="fx-buffering" style="position:absolute;display:none;pointer-events:none;">
                <div class="fx-spinner" style="width:3rem;height:3rem;border:3px solid rgba(255,255,255,0.25);border-top-color:var(--color-flare, #f59e0b);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
              </div>
            </div>

            <!-- Flicx Floating Glass UI -->
            <div class="fx-ui" style="position:absolute;inset:0;pointer-events:none;z-index:10;display:flex;flex-direction:column;justify-content:space-between;transition:opacity 0.24s ease;">
              
              <!-- TOP BAR -->
              <div class="fx-top" style="display:flex;align-items:center;justify-content:space-between;padding:calc(1.2rem + env(safe-area-inset-top,0px)) calc(1.5rem + env(safe-area-inset-right,0px)) 1rem calc(1.5rem + env(safe-area-inset-left,0px));background:linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);">
                
                <!-- Left: Back Button & Title Badge -->
                <div class="fx-top-start" style="display:flex;align-items:center;gap:0.75rem;pointer-events:auto;">
                  <a class="fx-btn" href="${backUrl}" aria-label="Back" title="Back" style="background:rgba(14,16,22,0.68);-webkit-backdrop-filter:blur(24px) saturate(1.8);backdrop-filter:blur(24px) saturate(1.8);box-shadow:0 0 0 1px rgba(255,255,255,0.1), 0 8px 24px -6px rgba(0,0,0,0.6);border-radius:50%;width:2.5rem;height:2.5rem;display:grid;place-items:center;color:#fff;text-decoration:none;transition:transform 0.16s ease, background 0.15s ease;">
                    <svg viewBox="0 0 256 256" fill="currentColor" width="20" height="20"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"/></svg>
                  </a>
                  
                  <div class="fx-pill" style="display:flex;align-items:center;gap:0.5rem;padding:0.45rem 1rem;background:rgba(14,16,22,0.68);-webkit-backdrop-filter:blur(24px) saturate(1.8);backdrop-filter:blur(24px) saturate(1.8);box-shadow:0 0 0 1px rgba(255,255,255,0.08);border-radius:9999px;color:#fff;font-size:0.9rem;font-weight:600;">
                    <span style="font-weight:700;">${cleanTitle}</span>
                    <span style="opacity:0.35;">&bull;</span>
                    <span style="opacity:0.7;font-size:0.85rem;">${yearStr}</span>
                    ${isShow ? `<span style="background:var(--color-flare, #f59e0b);color:#000;font-weight:800;font-size:0.75rem;padding:0.1rem 0.45rem;border-radius:4px;margin-left:0.25rem;">S${season} E${episode}</span>` : ''}
                  </div>
                </div>

                <!-- Right: Star Server Selector & Fullscreen Button -->
                <div class="fx-top-end" style="display:flex;align-items:center;gap:0.6rem;pointer-events:auto;">
                  <!-- Original Flicx Server Dropdown -->
                  <div class="fx-server" style="position:relative;">
                    <button type="button" class="fx-pill fx-btn-server" aria-haspopup="menu" aria-expanded="false" style="display:inline-flex;align-items:center;gap:0.45rem;padding:0.45rem 0.9rem;background:rgba(14,16,22,0.68);-webkit-backdrop-filter:blur(24px) saturate(1.8);backdrop-filter:blur(24px) saturate(1.8);box-shadow:0 0 0 1px rgba(255,255,255,0.1), 0 8px 24px -6px rgba(0,0,0,0.6);border-radius:9999px;border:none;color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;">
                      <svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M224,56H32A16,16,0,0,0,16,72V184a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V72A16,16,0,0,0,224,56Zm0,128H32V72H224V184ZM192,128a12,12,0,1,1-12-12A12,12,0,0,1,192,128Z"/></svg>
                      <span class="fx-server-name">${currentServer.name}</span>
                      ${currentServer.quality ? `<i class="fx-tag" style="font-size:0.68rem;padding:0.05rem 0.35rem;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;font-style:normal;">${currentServer.quality}</i>` : ''}
                      <svg class="fx-server-chevron" viewBox="0 0 256 256" fill="currentColor" width="14" height="14" style="transition:transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>
                    </button>
                    
                    <!-- Flicx Star Server Menu -->
                    <div class="fx-menu fx-server-menu" role="menu" aria-label="Server" style="display:none;position:absolute;top:calc(100% + 0.45rem);right:0;width:max-content;min-width:16rem;max-height:60vh;overflow-y:auto;padding:0.4rem;border-radius:1rem;background:rgba(14,16,22,0.92);-webkit-backdrop-filter:blur(30px) saturate(1.8) brightness(0.9);backdrop-filter:blur(30px) saturate(1.8) brightness(0.9);box-shadow:0 0 0 1px rgba(255,255,255,0.08), 0 22px 56px -16px rgba(0,0,0,0.85);z-index:30;flex-direction:column;gap:2px;">
                      ${servers.map((srv, idx) => `
                        <button type="button" class="fx-row fx-menu-item" data-idx="${idx}" role="menuitemradio" aria-checked="${idx === currentServerIndex}" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:0.65rem 0.85rem;border:none;border-radius:0.6rem;background:${idx === currentServerIndex ? 'rgba(255,255,255,0.12)' : 'transparent'};color:${idx === currentServerIndex ? '#fff' : 'rgba(255,255,255,0.7)'};cursor:pointer;font-size:0.85rem;font-weight:500;text-align:left;transition:background 0.15s ease;">
                          <span class="fx-row-text" style="display:flex;flex-direction:column;gap:0.15rem;">
                            <span class="fx-row-title" style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
                              ${srv.name}
                              ${srv.quality ? `<i class="fx-tag" style="font-size:0.68rem;padding:0.05rem 0.35rem;border-radius:4px;background:rgba(255,255,255,0.1);color:#fff;font-style:normal;">${srv.quality}</i>` : ''}
                              ${srv.group === 'dedicated' ? '<b class="fx-server-dedicated" style="font-size:0.65rem;color:var(--color-flare, #f59e0b);font-weight:700;text-transform:uppercase;">Dedicated</b>' : ''}
                            </span>
                          </span>
                          ${idx === currentServerIndex ? '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>' : ''}
                        </button>
                      `).join('')}
                    </div>
                  </div>

                  <!-- Fullscreen Button -->
                  <button type="button" class="fx-btn fx-btn-fullscreen" aria-label="Fullscreen" title="Fullscreen (F)" style="background:rgba(14,16,22,0.68);-webkit-backdrop-filter:blur(24px) saturate(1.8);backdrop-filter:blur(24px) saturate(1.8);box-shadow:0 0 0 1px rgba(255,255,255,0.1), 0 8px 24px -6px rgba(0,0,0,0.6);border-radius:50%;width:2.5rem;height:2.5rem;display:grid;place-items:center;color:#fff;border:none;cursor:pointer;">
                    <svg viewBox="0 0 256 256" fill="currentColor" width="18" height="18"><path d="M216,48V88a8,8,0,0,1-16,0V56H168a8,8,0,0,1,0-16h40A8,8,0,0,1,216,48ZM88,200H56V168a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H88a8,8,0,0,0,0-16Zm120-40a8,8,0,0,0-8,8v32H168a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V168A8,8,0,0,0,208,160ZM48,96a8,8,0,0,0,8-8V56H88a8,8,0,0,0,0-16H48a8,8,0,0,0-8,8V88A8,8,0,0,0,48,96Z"/></svg>
                  </button>
                </div>
              </div>

              <!-- BOTTOM CONTROLS BAR -->
              <div class="fx-bottom" style="padding:1rem calc(1.5rem + env(safe-area-inset-right,0px)) calc(1.5rem + env(safe-area-inset-bottom,0px)) calc(1.5rem + env(safe-area-inset-left,0px));background:linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);pointer-events:auto;display:flex;flex-direction:column;gap:0.75rem;">
                
                <!-- Timeline Scrubber -->
                <div class="fx-scrub-wrap" style="position:relative;width:100%;height:1.25rem;display:flex;align-items:center;cursor:pointer;">
                  <div class="fx-scrub-track" style="position:relative;width:100%;height:4px;border-radius:999px;background:rgba(255,255,255,0.2);overflow:visible;transition:height 0.15s ease;">
                    <div id="fx-scrub-buffered" class="fx-scrub-buffered" style="position:absolute;top:0;left:0;bottom:0;width:0%;background:rgba(255,255,255,0.3);border-radius:999px;"></div>
                    <div id="fx-scrub-played" class="fx-scrub-played" style="position:absolute;top:0;left:0;bottom:0;width:0%;background:var(--color-flare, #f59e0b);border-radius:999px;"></div>
                    <div id="fx-scrub-thumb" class="fx-scrub-thumb" style="position:absolute;top:50%;left:0%;width:12px;height:12px;background:#fff;border-radius:50%;transform:translate(-50%, -50%);box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>
                  </div>
                </div>

                <!-- Control Buttons Row -->
                <div class="fx-bar" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                  
                  <!-- Left Controls: Play/Pause, Volume, Time -->
                  <div class="fx-bar-start" style="display:flex;align-items:center;gap:1rem;">
                    <!-- Play / Pause Button -->
                    <button type="button" id="fx-btn-play" class="fx-btn" aria-label="Play/Pause" style="color:#fff;background:transparent;border:none;cursor:pointer;display:grid;place-items:center;">
                      <svg id="fx-icon-play" viewBox="0 0 256 256" fill="currentColor" width="24" height="24"><path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"/></svg>
                      <svg id="fx-icon-pause" viewBox="0 0 256 256" fill="currentColor" width="24" height="24" style="display:none;"><path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z"/></svg>
                    </button>

                    <!-- Volume & Mute -->
                    <div class="fx-volume" style="display:flex;align-items:center;gap:0.4rem;">
                      <button type="button" id="fx-btn-mute" class="fx-btn" aria-label="Mute" style="color:#fff;background:transparent;border:none;cursor:pointer;display:grid;place-items:center;">
                        <svg id="fx-icon-volume" viewBox="0 0 256 256" fill="currentColor" width="22" height="22"><path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM208,128a55.9,55.9,0,0,0-16.4-39.6,8,8,0,0,0-11.31,11.31,39.9,39.9,0,0,1,0,56.58,8,8,0,0,0,11.31,11.31A55.9,55.9,0,0,0,208,128Zm32,0a87.77,87.77,0,0,0-25.79-62.22,8,8,0,1,0-11.31,11.31,71.86,71.86,0,0,1,0,101.82,8,8,0,0,0,11.31,11.31A87.77,87.77,0,0,0,240,128Z"/></svg>
                        <svg id="fx-icon-muted" viewBox="0 0 256 256" fill="currentColor" width="22" height="22" style="display:none;"><path d="M213.66,197.66l-44.59-44.6A87.94,87.94,0,0,0,240,128a8,8,0,0,0-16,0,71.86,71.86,0,0,1-19.64,48.65L160,132.37V32a8,8,0,0,0-12.91-6.31L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V188.69l42.34,42.35a8,8,0,0,0,11.32-11.32ZM205.66,42.34a8,8,0,0,0-11.32,0L37.09,199.59A8,8,0,0,0,48.4,210.9l157.26-157.25A8,8,0,0,0,205.66,42.34Z"/></svg>
                      </button>
                      <input type="range" id="fx-volume-slider" min="0" max="1" step="0.05" value="1" style="width:5rem;height:4px;accent-color:var(--color-flare, #f59e0b);cursor:pointer;" />
                    </div>

                    <!-- Time Display -->
                    <div class="fx-time" style="font-size:0.85rem;color:rgba(255,255,255,0.8);font-variant-numeric:tabular-nums;">
                      <span id="fx-time-now">0:00</span>
                      <span class="fx-time-sep" style="opacity:0.4;margin:0 0.35rem;">/</span>
                      <span id="fx-time-total" style="opacity:0.6;">0:00</span>
                    </div>
                  </div>

                  <!-- Right Controls: Audio/Subtitles & Fullscreen -->
                  <div class="fx-bar-end" style="display:flex;align-items:center;gap:0.75rem;">
                    <!-- Quality indicator -->
                    <span id="fx-active-quality" class="fx-pill" style="font-size:0.75rem;font-weight:700;padding:0.25rem 0.6rem;background:rgba(255,255,255,0.12);border-radius:4px;color:#fff;">${currentServer.quality || 'HD'}</span>

                    <!-- Fullscreen Toggle -->
                    <button type="button" id="fx-btn-bottom-fs" class="fx-btn" aria-label="Fullscreen" style="color:#fff;background:transparent;border:none;cursor:pointer;display:grid;place-items:center;">
                      <svg viewBox="0 0 256 256" fill="currentColor" width="22" height="22"><path d="M216,48V88a8,8,0,0,1-16,0V56H168a8,8,0,0,1,0-16h40A8,8,0,0,1,216,48ZM88,200H56V168a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H88a8,8,0,0,0,0-16Zm120-40a8,8,0,0,0-8,8v32H168a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V168A8,8,0,0,0,208,160ZM48,96a8,8,0,0,0,8-8V56H88a8,8,0,0,0,0-16H48a8,8,0,0,0-8,8V88A8,8,0,0,0,48,96Z"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // 7. Video Player & Stream Engine
      const playerStage = watchRoot.querySelector('.watch-stage');
      const playerEl = watchRoot.querySelector('.fx-player');
      const videoEl = watchRoot.querySelector('#flicx-video');
      const bufferingEl = watchRoot.querySelector('#flicx-buffering');
      const uiEl = watchRoot.querySelector('.fx-ui');
      const playBtn = watchRoot.querySelector('#fx-btn-play');
      const iconPlay = watchRoot.querySelector('#fx-icon-play');
      const iconPause = watchRoot.querySelector('#fx-icon-pause');
      const muteBtn = watchRoot.querySelector('#fx-btn-mute');
      const iconVol = watchRoot.querySelector('#fx-icon-volume');
      const iconMuted = watchRoot.querySelector('#fx-icon-muted');
      const volSlider = watchRoot.querySelector('#fx-volume-slider');
      const timeNow = watchRoot.querySelector('#fx-time-now');
      const timeTotal = watchRoot.querySelector('#fx-time-total');
      const scrubTrack = watchRoot.querySelector('.fx-scrub-track');
      const scrubPlayed = watchRoot.querySelector('#fx-scrub-played');
      const scrubBuffered = watchRoot.querySelector('#fx-scrub-buffered');
      const scrubThumb = watchRoot.querySelector('#fx-scrub-thumb');
      const serverBtn = watchRoot.querySelector('.fx-btn-server');
      const serverName = watchRoot.querySelector('.fx-server-name');
      const serverChevron = watchRoot.querySelector('.fx-server-chevron');
      const serverMenu = watchRoot.querySelector('.fx-server-menu');
      const fsBtns = watchRoot.querySelectorAll('.fx-btn-fullscreen, #fx-btn-bottom-fs');

      let currentHls = null;

      function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
          return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
      }

      function attachStream(source) {
        if (currentHls) {
          currentHls.destroy();
          currentHls = null;
        }

        const streamUrl = source.src;
        bufferingEl.style.display = 'block';

        if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({
            capLevelToPlayerSize: false,
            maxBufferLength: 30,
            backBufferLength: 45,
            xhrSetup: (xhr, url) => {
              if (url && !url.includes('fx=cors')) {
                xhr.open('GET', url + (url.includes('?') ? '&' : '?') + 'fx=cors', true);
              }
            }
          });
          currentHls = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoEl);

          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            bufferingEl.style.display = 'none';
            videoEl.play().catch(() => {});
          });

          hls.on(window.Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              console.warn('HLS stream error on', source.name, data);
              bufferingEl.style.display = 'none';
            }
          });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = streamUrl;
          videoEl.addEventListener('loadedmetadata', () => {
            bufferingEl.style.display = 'none';
            videoEl.play().catch(() => {});
          }, { once: true });
        }
      }

      // Initial Stream Attach
      attachStream(currentServer);

      // Play / Pause Logic
      function togglePlay() {
        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        } else {
          videoEl.pause();
        }
      }

      playBtn.onclick = (e) => {
        e.stopPropagation();
        togglePlay();
      };
      videoEl.onclick = togglePlay;

      videoEl.onplay = () => {
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
      };
      videoEl.onpause = () => {
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
      };
      videoEl.onwaiting = () => {
        bufferingEl.style.display = 'block';
      };
      videoEl.onplaying = () => {
        bufferingEl.style.display = 'none';
      };

      // Progress & Time Updates
      videoEl.ontimeupdate = () => {
        const cur = videoEl.currentTime || 0;
        const dur = videoEl.duration || 0;
        timeNow.textContent = formatTime(cur);
        if (dur > 0) {
          timeTotal.textContent = formatTime(dur);
          const pct = (cur / dur) * 100;
          scrubPlayed.style.width = pct + '%';
          scrubThumb.style.left = pct + '%';
        }
        if (videoEl.buffered && videoEl.buffered.length > 0 && dur > 0) {
          const bufEnd = videoEl.buffered.end(videoEl.buffered.length - 1);
          scrubBuffered.style.width = (bufEnd / dur) * 100 + '%';
        }
      };

      // Scrub Seeking
      let isScrubbing = false;
      function seekAtEvent(e) {
        const rect = scrubTrack.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        if (videoEl.duration) {
          videoEl.currentTime = pos * videoEl.duration;
        }
      }

      scrubTrack.parentElement.addEventListener('mousedown', (e) => {
        isScrubbing = true;
        seekAtEvent(e);
      });
      window.addEventListener('mousemove', (e) => {
        if (isScrubbing) seekAtEvent(e);
      });
      window.addEventListener('mouseup', () => {
        isScrubbing = false;
      });

      // Volume & Mute
      volSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        videoEl.volume = val;
        videoEl.muted = val === 0;
        updateVolumeUI();
      };

      function updateVolumeUI() {
        if (videoEl.muted || videoEl.volume === 0) {
          iconVol.style.display = 'none';
          iconMuted.style.display = 'block';
        } else {
          iconVol.style.display = 'block';
          iconMuted.style.display = 'none';
        }
      }

      muteBtn.onclick = (e) => {
        e.stopPropagation();
        videoEl.muted = !videoEl.muted;
        updateVolumeUI();
      };

      // Fullscreen
      function toggleFullscreen() {
        if (!document.fullscreenElement) {
          if (playerStage.requestFullscreen) playerStage.requestFullscreen();
          else if (playerStage.webkitRequestFullscreen) playerStage.webkitRequestFullscreen();
          playerEl.setAttribute('data-fullscreen', '');
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          playerEl.removeAttribute('data-fullscreen');
        }
      }

      fsBtns.forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          toggleFullscreen();
        };
      });

      // Flicx Star Server Menu Interactivity
      if (serverBtn && serverMenu) {
        serverBtn.onclick = (e) => {
          e.stopPropagation();
          const isOpen = serverMenu.style.display === 'flex';
          serverMenu.style.display = isOpen ? 'none' : 'flex';
          serverBtn.setAttribute('aria-expanded', String(!isOpen));
          if (serverChevron) {
            serverChevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
          }
        };

        const serverItems = serverMenu.querySelectorAll('.fx-menu-item');
        serverItems.forEach(item => {
          item.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(item.getAttribute('data-idx'), 10);
            currentServerIndex = idx;
            currentServer = servers[idx];

            if (serverName) serverName.textContent = currentServer.name;
            const qualityEl = watchRoot.querySelector('#fx-active-quality');
            if (qualityEl) qualityEl.textContent = currentServer.quality || 'HD';

            try { localStorage.setItem('flicx:player:server', currentServer.name); } catch(err){}

            // Switch HLS Stream immediately
            attachStream(currentServer);

            // Close server menu
            serverMenu.style.display = 'none';
            serverBtn.setAttribute('aria-expanded', 'false');
            if (serverChevron) serverChevron.style.transform = 'rotate(0deg)';

            // Re-render checkmarks in server list
            serverItems.forEach(it => {
              const itIdx = parseInt(it.getAttribute('data-idx'), 10);
              it.style.background = itIdx === idx ? 'rgba(255,255,255,0.12)' : 'transparent';
              it.style.color = itIdx === idx ? '#fff' : 'rgba(255,255,255,0.7)';
              const existingSvg = it.querySelector('svg');
              if (existingSvg) existingSvg.remove();
              if (itIdx === idx) {
                it.insertAdjacentHTML('beforeend', '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>');
              }
            });
            wakeControls();
          };
        });

        document.addEventListener('click', (e) => {
          if (!serverBtn.contains(e.target) && !serverMenu.contains(e.target)) {
            serverMenu.style.display = 'none';
            serverBtn.setAttribute('aria-expanded', 'false');
            if (serverChevron) serverChevron.style.transform = 'rotate(0deg)';
          }
        });
      }

      // Auto-Hide / Auto-Wake Controls
      let hideTimeout = null;
      function wakeControls() {
        uiEl.style.opacity = '1';
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
          if (serverMenu.style.display !== 'flex' && !videoEl.paused) {
            uiEl.style.opacity = '0';
          }
        }, 3400);
      }

      playerEl.addEventListener('mousemove', wakeControls);
      playerEl.addEventListener('touchstart', wakeControls, { passive: true });
      wakeControls();

      // Keyboard Controls
      const onKeyDown = (e) => {
        if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '')) return;
        if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          togglePlay();
          wakeControls();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          videoEl.muted = !videoEl.muted;
          updateVolumeUI();
          wakeControls();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          videoEl.currentTime = Math.max(0, videoEl.currentTime - 10);
          wakeControls();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          videoEl.currentTime = Math.min(videoEl.duration || 1e9, videoEl.currentTime + 10);
          wakeControls();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          videoEl.volume = Math.min(1, videoEl.volume + 0.1);
          volSlider.value = videoEl.volume;
          updateVolumeUI();
          wakeControls();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          videoEl.volume = Math.max(0, videoEl.volume - 0.1);
          volSlider.value = videoEl.volume;
          updateVolumeUI();
          wakeControls();
        } else if (e.key === 'Escape') {
          if (serverMenu.style.display === 'flex') {
            serverMenu.style.display = 'none';
            serverBtn.setAttribute('aria-expanded', 'false');
            if (serverChevron) serverChevron.style.transform = 'rotate(0deg)';
          }
        }
      };
      document.addEventListener('keydown', onKeyDown);
    }
  }

  // --- 3. Trailer Modal ---
  function openTrailerModal(trailerId, title) {
    let modal = document.getElementById('flicx-trailer-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'flicx-trailer-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:1.5rem;';
      modal.innerHTML = `
        <div style="position:relative;width:100%;max-width:960px;aspect-ratio:16/9;background:#000;border-radius:1rem;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.1);">
          <button id="close-trailer-modal" aria-label="Close trailer" style="position:absolute;top:1rem;right:1rem;z-index:10;width:2.5rem;height:2.5rem;border-radius:50%;border:none;background:rgba(0,0,0,0.6);color:#fff;cursor:pointer;display:grid;place-items:center;font-size:1.5rem;line-height:1;">&times;</button>
          <iframe id="trailer-iframe" style="width:100%;height:100%;border:none;" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#close-trailer-modal').onclick = closeTrailerModal;
      modal.onclick = (e) => {
        if (e.target === modal) closeTrailerModal();
      };
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
          closeTrailerModal();
        }
      });
    }

    const iframe = modal.querySelector('#trailer-iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&rel=0`;
    modal.style.display = 'flex';
  }

  function closeTrailerModal() {
    const modal = document.getElementById('flicx-trailer-modal');
    if (modal) {
      const iframe = modal.querySelector('#trailer-iframe');
      if (iframe) iframe.src = '';
      modal.style.display = 'none';
    }
  }

  // --- 4. Card Clicks & Navigation ---
  function initCardNavigation() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-watchlist-button], .cover-add, .card-over-genre, button, input, select')) {
        return;
      }
      const card = e.target.closest('.card, .card-over, .card-action, [data-href]');
      if (!card) return;

      const link = card.querySelector('a[href]') || card.closest('a[href]');
      const href = card.getAttribute('data-href') || (link ? link.getAttribute('href') : null);

      if (href && (href.startsWith('/movie/') || href.startsWith('/tv/') || href.startsWith('/genres/') || href.startsWith('/watch/') || href.startsWith('/collections') || href.startsWith('/just-added') || href.startsWith('/awards') || href.startsWith('/4k') || href.startsWith('/anime') || href.startsWith('/discover') || href.startsWith('/library'))) {
        e.preventDefault();
        navigateTo(href);
      }
    });
  }

  // --- 5. Horizontal Rail Scrolling ---
  function initRailScroll() {
    // Mouse drag scrolling for all rail tracks
    document.querySelectorAll('.rail-scroll, .rail-track, .rail').forEach(rail => {
      if (rail.__dragBound) return;
      rail.__dragBound = true;
      let isDown = false;
      let startX;
      let scrollLeft;

      rail.addEventListener('mousedown', (e) => {
        if (e.target.closest('a, button')) return;
        isDown = true;
        startX = e.pageX - rail.offsetLeft;
        scrollLeft = rail.scrollLeft;
      });
      rail.addEventListener('mouseleave', () => { isDown = false; });
      rail.addEventListener('mouseup', () => { isDown = false; });
      rail.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - rail.offsetLeft;
        const walk = (x - startX) * 1.5;
        rail.scrollLeft = scrollLeft - walk;
      });
    });

    // Wire up rail-arrow buttons (Prev / Next chevrons)
    document.querySelectorAll('.rail, .section').forEach(container => {
      const track = container.querySelector('.rail-track') || container.querySelector('.rail-scroll');
      if (!track) return;
      const prevBtn = container.querySelector('.rail-arrow[data-dir="prev"]');
      const nextBtn = container.querySelector('.rail-arrow[data-dir="next"]');

      function updateArrowStates() {
        if (prevBtn) {
          if (track.scrollLeft <= 5) {
            prevBtn.setAttribute('disabled', '');
            prevBtn.style.opacity = '0';
            prevBtn.style.pointerEvents = 'none';
          } else {
            prevBtn.removeAttribute('disabled');
            prevBtn.style.opacity = '1';
            prevBtn.style.pointerEvents = 'auto';
          }
        }
        if (nextBtn) {
          const maxScroll = track.scrollWidth - track.clientWidth - 5;
          if (track.scrollLeft >= maxScroll) {
            nextBtn.setAttribute('disabled', '');
            nextBtn.style.opacity = '0';
            nextBtn.style.pointerEvents = 'none';
          } else {
            nextBtn.removeAttribute('disabled');
            nextBtn.style.opacity = '1';
            nextBtn.style.pointerEvents = 'auto';
          }
        }
      }

      if (prevBtn && !prevBtn.__arrowBound) {
        prevBtn.__arrowBound = true;
        prevBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const amount = track.clientWidth * 0.75;
          track.scrollBy({ left: -amount, behavior: 'smooth' });
        };
      }

      if (nextBtn && !nextBtn.__arrowBound) {
        nextBtn.__arrowBound = true;
        nextBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const amount = track.clientWidth * 0.75;
          track.scrollBy({ left: amount, behavior: 'smooth' });
        };
      }

      track.addEventListener('scroll', updateArrowStates, { passive: true });
      updateArrowStates();
    });
  }

  // --- 6. Watchlist & Actions Management ---
  const WATCHLIST_PLUS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z"></path></svg>';
  const WATCHLIST_CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="text-accent" style="color:var(--color-flare, #ffa750);"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"></path></svg>';

  function getWatchlist() {
    try {
      return JSON.parse(localStorage.getItem('flicx:watchlist:v1') || '[]');
    } catch {
      return [];
    }
  }

  function saveWatchlist(wl) {
    try {
      localStorage.setItem('flicx:watchlist:v1', JSON.stringify(wl));
    } catch {}
  }

  function isInWatchlist(slug) {
    if (!slug) return false;
    const clean = slug.replace(/^\/(movie|tv|watch)\//, '').replace(/\/$/, '');
    return getWatchlist().includes(clean);
  }

  function updateWatchlistButton(btn, inLib, title) {
    btn.setAttribute('aria-pressed', inLib ? 'true' : 'false');
    btn.setAttribute('title', inLib ? 'In your library' : 'Add to library');
    btn.setAttribute('aria-label', `${inLib ? 'In your library' : 'Add to library'}${title ? ': ' + title : ''}`);
    if (btn.classList.contains('capsule-btn') || btn.closest('.capsule')) {
      btn.classList.add('capsule-btn-text');
      btn.innerHTML = `<span>${inLib ? 'In your library' : 'Add to library'}</span>`;
    } else {
      btn.innerHTML = inLib ? WATCHLIST_CHECK_SVG : WATCHLIST_PLUS_SVG;
    }
  }

  function initWatchlist() {
    // Initialize all existing [data-watchlist-button] instances to authentic icon representation
    document.querySelectorAll('button[data-watchlist-button]').forEach(btn => {
      const card = btn.closest('.card, .card-over, .hero-copy, .hero-actions, .hero');
      const slug = btn.getAttribute('data-title-slug') || btn.getAttribute('data-slug') || (card && card.querySelector('a') ? card.querySelector('a').getAttribute('href') : null) || window.location.pathname;
      if (slug) {
        const inLib = isInWatchlist(slug);
        const title = btn.getAttribute('data-title') || (card && card.querySelector('h2') ? card.querySelector('h2').textContent.trim() : '');
        updateWatchlistButton(btn, inLib, title);
      }
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-watchlist-button], .cover-add');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const card = btn.closest('.card, .card-over, .hero-copy, .hero-actions, .hero');
      const slug = btn.getAttribute('data-title-slug') || btn.getAttribute('data-slug') || (card && card.querySelector('a') ? card.querySelector('a').getAttribute('href') : null) || window.location.pathname;
      if (!slug) return;

      let wl = getWatchlist();
      const cleanSlug = slug.replace(/^\/(movie|tv|watch)\//, '').replace(/\/$/, '');
      const idx = wl.indexOf(cleanSlug);
      const isNowAdded = idx === -1;
      if (isNowAdded) {
        wl.push(cleanSlug);
      } else {
        wl.splice(idx, 1);
      }
      saveWatchlist(wl);

      if (btn.hasAttribute('data-watchlist-button')) {
        const title = btn.getAttribute('data-title') || (card && card.querySelector('h2') ? card.querySelector('h2').textContent.trim() : '');
        updateWatchlistButton(btn, isNowAdded, title);
      } else {
        btn.setAttribute('aria-pressed', isNowAdded ? 'true' : 'false');
      }
    });

    // Share button interaction (copy link with tooltip feedback)
    document.addEventListener('click', (e) => {
      const shareBtn = e.target.closest('button[title="Share"], button[aria-label*="Share"], .capsule-btn[aria-label*="Share"]');
      if (!shareBtn) return;
      e.preventDefault();
      e.stopPropagation();

      const shareUrl = window.location.href;
      if (navigator.share) {
        navigator.share({ url: shareUrl, title: document.title }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          const origTitle = shareBtn.getAttribute('title');
          shareBtn.setAttribute('title', 'Copied link!');
          setTimeout(() => {
            shareBtn.setAttribute('title', origTitle || 'Share');
          }, 2000);
        }).catch(() => {});
      }
    });
  }

  // --- 7. Settings Modal & Engine ---
  const PHOSPHOR_ICONS = {
    palette: 'M200.77,53.89A103.27,103.27,0,0,0,128,24h-1.07A104,104,0,0,0,24,128c0,43,26.58,79.06,69.36,94.17A32,32,0,0,0,136,192a16,16,0,0,1,16-16h46.21a31.81,31.81,0,0,0,31.2-24.88,104.43,104.43,0,0,0,2.59-24A103.28,103.28,0,0,0,200.77,53.89Zm13,93.71A15.89,15.89,0,0,1,198.21,160H152a32,32,0,0,0-32,32,16,16,0,0,1-21.31,15.07C62.49,194.3,40,164,40,128a88,88,0,0,1,87.09-88h.9a88.35,88.35,0,0,1,88,87.25A88.86,88.86,0,0,1,213.81,147.6ZM140,76a12,12,0,1,1-12-12A12,12,0,0,1,140,76ZM96,100A12,12,0,1,1,84,88,12,12,0,0,1,96,100Zm0,56a12,12,0,1,1-12-12A12,12,0,0,1,96,156Zm88-56a12,12,0,1,1-12-12A12,12,0,0,1,184,100Z',
    light: 'M176,232a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h80A8,8,0,0,1,176,232Zm40-128a87.55,87.55,0,0,1-33.64,69.21A16.24,16.24,0,0,0,176,186v6a16,16,0,0,1-16,16H96a16,16,0,0,1-16-16v-6a16,16,0,0,0-6.23-12.66A87.59,87.59,0,0,1,40,104.49C39.74,56.83,78.26,17.14,125.88,16A88,88,0,0,1,216,104Zm-16,0a72,72,0,0,0-73.74-72c-39,.92-70.47,33.39-70.26,72.39a71.65,71.65,0,0,0,27.64,56.3A32,32,0,0,1,96,186v6h64v-6a32.15,32.15,0,0,1,12.47-25.35A71.65,71.65,0,0,0,200,104Zm-16.11-9.34a57.6,57.6,0,0,0-46.56-46.55,8,8,0,0,0-2.66,15.78c16.57,2.79,30.63,16.85,33.44,33.45A8,8,0,0,0,176,104a9,9,0,0,0,1.35-.11A8,8,0,0,0,183.89,94.66Z',
    covers: 'M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM48,48H208v77.38l-24.69-24.7a16,16,0,0,0-22.62,0L53.37,208H48ZM208,208H76l96-96,36,36v60ZM96,120A24,24,0,1,0,72,96,24,24,0,0,0,96,120Zm0-32a8,8,0,1,1-8,8A8,8,0,0,1,96,88Z',
    home: 'M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z',
    access: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM40,128a88,88,0,0,1,88-88v176A88.1,88.1,0,0,1,40,128Z',
    trailers: 'M216,104H102.09L210,75.51a8,8,0,0,0,5.68-9.84l-8.16-30a15.93,15.93,0,0,0-19.42-11.13L35.81,64.74a15.75,15.75,0,0,0-9.7,7.4,15.51,15.51,0,0,0-1.55,12L32,111.56c0,.14,0,.29,0,.44v88a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V112A8,8,0,0,0,216,104ZM192.16,40l6,22.07-22.62,6L147.42,51.83Zm-66.69,17.6,28.12,16.24-36.94,9.75L88.53,67.37Zm-79.4,44.62-6-22.08,26.5-7L94.69,89.4ZM208,200H48V120H208v80Z',
    keyboard: 'M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm0,144H32V64H224V192Zm-16-64a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16H200A8,8,0,0,1,208,128Zm0-32a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16H200A8,8,0,0,1,208,96ZM72,160a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16h8A8,8,0,0,1,72,160Zm96,0a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,160Zm40,0a8,8,0,0,1-8,8h-8a8,8,0,0,1,0-16h8A8,8,0,0,1,208,160Z',
    integrations: 'M237.66,18.34a8,8,0,0,0-11.32,0l-52.4,52.41-5.37-5.38a32.05,32.05,0,0,0-45.26,0L100,88.69l-6.34-6.35A8,8,0,0,0,82.34,93.66L88.69,100,65.37,123.31a32,32,0,0,0,0,45.26l5.38,5.37-52.41,52.4a8,8,0,0,0,11.32,11.32l52.4-52.41,5.37,5.38a32,32,0,0,0,45.26,0L156,167.31l6.34,6.35a8,8,0,0,0,11.32-11.32L167.31,156l23.32-23.31a32,32,0,0,0,0-45.26l-5.38-5.37,52.41-52.4A8,8,0,0,0,237.66,18.34Zm-116.29,161a16,16,0,0,1-22.62,0L76.69,157.25a16,16,0,0,1,0-22.62L100,111.31,144.69,156Zm57.94-57.94L156,144.69,111.31,100l23.32-23.31a16,16,0,0,1,22.62,0l22.06,22A16,16,0,0,1,179.31,121.37ZM88.57,35A8,8,0,0,1,103.43,29l8,20A8,8,0,0,1,96.57,55ZM24.57,93A8,8,0,0,1,35,88.57l20,8A8,8,0,0,1,49,111.43l-20-8A8,8,0,0,1,24.57,93ZM231.43,163a8,8,0,0,1-10.4,4.46l-20-8A8,8,0,1,1,207,144.57l20,8A8,8,0,0,1,231.43,163Zm-64,58.06A8,8,0,0,1,152.57,227l-8-20A8,8,0,0,1,159.43,201Z',
    privacy: 'M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z',
    data: 'M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z',
    reset: 'M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z',
    caretRight: 'M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z',
    caretLeft: 'M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z',
    close: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
    search: 'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z',
    bell: 'M168,224a8,8,0,0,1-8,8H96a8,8,0,1,1,0-16h64A8,8,0,0,1,168,224Zm53.85-32A15.8,15.8,0,0,1,208,200H48a16,16,0,0,1-13.8-24.06C39.75,166.38,48,139.34,48,104a80,80,0,1,1,160,0c0,35.33,8.26,62.38,13.81,71.94A15.89,15.89,0,0,1,221.84,192ZM208,184c-7.73-13.27-16-43.95-16-80a64,64,0,1,0-128,0c0,36.06-8.28,66.74-16,80Z'
  };

  function svg(pathKey, className) {
    const d = PHOSPHOR_ICONS[pathKey];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" class="${className || ''}" aria-hidden="true"><path d="${d}"></path></svg>`;
  }

  let activeSettingsView = 'main';
  let settingsState = {
    accentColor: '#f59e0b',
    accentName: 'Flicx',
    accentHue: 62,
    ambientLight: '60%',
    ambientEnabled: true,
    coverZoom: 'Zoom 110%',
    coverZoomVal: 110,
    homeShelves: '15 shelves',
    accessibility: '1 on',
    trailers: 'Sound on',
    trailerSound: true,
    keyboard: 'On',
    background: 'Black',
    glassBlur: 100
  };

  function getSettingsState() {
    try {
      const saved = localStorage.getItem('flicx_settings');
      if (saved) settingsState = { ...settingsState, ...JSON.parse(saved) };
    } catch {}
    applySettingsToDOM();
    return settingsState;
  }

  function saveSettingsState() {
    try {
      localStorage.setItem('flicx_settings', JSON.stringify(settingsState));
    } catch {}
    applySettingsToDOM();
  }

  function applySettingsToDOM() {
    const root = document.documentElement;
    // 1. Accent color
    root.style.setProperty('--color-flare', settingsState.accentColor);
    root.style.setProperty('--accent', settingsState.accentColor);
    
    // 2. Glass blur scale
    const blurScale = (settingsState.glassBlur || 100) / 100;
    root.style.setProperty('--blur-scale', String(blurScale));
    root.style.setProperty('--frost-chrome', `blur(${22 * blurScale}px) saturate(1.7) brightness(0.78)`);

    // 3. Background color
    if (settingsState.background === 'Black') {
      root.style.setProperty('--color-canvas', '#000000');
    } else if (settingsState.background === 'Dark grey') {
      root.style.setProperty('--color-canvas', '#0e1016');
    } else if (settingsState.background === 'Tinted') {
      root.style.setProperty('--color-canvas', `color-mix(in oklab, ${settingsState.accentColor} 12%, #0a0c10)`);
    }

    // 4. Ambient light
    const ambStrength = settingsState.ambientEnabled ? (parseInt(settingsState.ambientLight, 10) || 60) / 100 : 0;
    root.style.setProperty('--ambient-strength', String(ambStrength));

    // 5. Cover Zoom
    const zoomVal = (settingsState.coverZoomVal || 110) / 100;
    root.style.setProperty('--cover-zoom-to', String(zoomVal));
  }

  function buildSettingsModal() {
    let dialog = document.getElementById('flicx-settings-dialog');
    if (dialog) return dialog;

    const backdrop = document.createElement('div');
    backdrop.id = 'flicx-settings-backdrop';
    backdrop.className = 'set-backdrop';
    backdrop.style.display = 'none';

    dialog = document.createElement('div');
    dialog.id = 'flicx-settings-dialog';
    dialog.className = 'set-dialog';
    dialog.setAttribute('aria-label', 'Settings');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.display = 'none';

    dialog.innerHTML = `
      <div class="set-window" data-view="main">
        <header class="set-head">
          <button type="button" class="set-back" aria-label="All settings" style="display:none;">
            ${svg('caretLeft')}
          </button>
          <h2 class="set-title">Settings</h2>
          <button type="button" class="set-close" aria-label="Close settings">
            ${svg('close')}
          </button>
        </header>

        <div class="set-search">
          <span class="set-search-icon">${svg('search')}</span>
          <input type="search" class="set-search-input" placeholder="Search settings" aria-label="Search settings" autocomplete="off" />
        </div>

        <div class="set-body" id="flicx-settings-body">
          <!-- Dynamically populated view -->
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);

    function close() {
      dialog.style.display = 'none';
      backdrop.style.display = 'none';
      document.body.style.overflow = '';
      activeSettingsView = 'main';
    }

    dialog.querySelector('.set-close').onclick = close;
    backdrop.onclick = close;

    const backBtn = dialog.querySelector('.set-back');
    backBtn.onclick = () => {
      activeSettingsView = 'main';
      renderSettingsView('main');
    };

    return dialog;
  }

  function renderSettingsView(view) {
    const dialog = buildSettingsModal();
    const body = dialog.querySelector('#flicx-settings-body');
    const titleEl = dialog.querySelector('.set-title');
    const backBtn = dialog.querySelector('.set-back');
    const searchWrap = dialog.querySelector('.set-search');

    if (view === 'main') {
      titleEl.textContent = 'Settings';
      backBtn.style.display = 'none';
      searchWrap.style.display = 'flex';

      body.innerHTML = `
        <div class="set-group">
          <button type="button" class="set-row" data-subview="appearance">
            <span class="set-row-icon">${svg('palette')}</span>
            <span class="set-row-label">Appearance</span>
            <span class="set-row-value">${settingsState.accentName}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="light">
            <span class="set-row-icon">${svg('light')}</span>
            <span class="set-row-label">Ambient light</span>
            <span class="set-row-value">${settingsState.ambientLight}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="covers">
            <span class="set-row-icon">${svg('covers')}</span>
            <span class="set-row-label">Covers</span>
            <span class="set-row-value">${settingsState.coverZoom}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="home">
            <span class="set-row-icon">${svg('home')}</span>
            <span class="set-row-label">Home page</span>
            <span class="set-row-value">${settingsState.homeShelves}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="access">
            <span class="set-row-icon">${svg('access')}</span>
            <span class="set-row-label">Accessibility</span>
            <span class="set-row-value">${settingsState.accessibility}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="trailers">
            <span class="set-row-icon">${svg('trailers')}</span>
            <span class="set-row-label">Trailers</span>
            <span class="set-row-value">${settingsState.trailers}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="keyboard">
            <span class="set-row-icon">${svg('keyboard')}</span>
            <span class="set-row-label">Keyboard</span>
            <span class="set-row-value">${settingsState.keyboard}</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
        </div>

        <div class="set-group">
          <button type="button" class="set-row" data-subview="integrations">
            <span class="set-row-icon">${svg('integrations')}</span>
            <span class="set-row-label">Integrations</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="privacy">
            <span class="set-row-icon">${svg('privacy')}</span>
            <span class="set-row-label">Privacy</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" data-subview="data">
            <span class="set-row-icon">${svg('data')}</span>
            <span class="set-row-label">Your data</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
        </div>

        <div class="set-group">
          <button type="button" class="set-row set-reset-btn" id="flicx-reset-all">
            <span class="set-row-icon">${svg('reset')}</span>
            <span class="set-row-label">Reset all settings</span>
          </button>
        </div>
      `;

      body.querySelectorAll('[data-subview]').forEach(btn => {
        btn.onclick = () => {
          const sub = btn.getAttribute('data-subview');
          activeSettingsView = sub;
          renderSettingsView(sub);
        };
      });

      const resetBtn = body.querySelector('#flicx-reset-all');
      if (resetBtn) {
        resetBtn.onclick = () => {
          if (confirm('Reset all settings to default values?')) {
            localStorage.removeItem('flicx_settings');
            settingsState = {
              accentColor: '#f59e0b',
              accentName: 'Flicx',
              accentHue: 62,
              ambientLight: '60%',
              ambientEnabled: true,
              coverZoom: 'Zoom 110%',
              coverZoomVal: 110,
              homeShelves: '15 shelves',
              accessibility: '1 on',
              trailers: 'Sound on',
              trailerSound: true,
              keyboard: 'On',
              background: 'Black',
              glassBlur: 100
            };
            saveSettingsState();
            renderSettingsView('main');
          }
        };
      }
    } else if (view === 'appearance') {
      titleEl.textContent = 'Appearance';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-field">
          <label class="set-label">Background</label>
          <div class="set-choices" role="radiogroup">
            <button type="button" class="set-choice ${settingsState.background === 'Black' ? 'set-choice-active' : ''}" data-bg="Black">Black</button>
            <button type="button" class="set-choice ${settingsState.background === 'Dark grey' ? 'set-choice-active' : ''}" data-bg="Dark grey">Dark grey</button>
            <button type="button" class="set-choice ${settingsState.background === 'Tinted' ? 'set-choice-active' : ''}" data-bg="Tinted">Tinted</button>
          </div>
        </div>

        <div class="set-field">
          <label class="set-label">Accent colour</label>
          <div class="set-swatches" role="radiogroup">
            <button type="button" class="set-swatch" data-color="#f59e0b" data-name="Flicx" data-hue="62" style="--swatch:#f59e0b;" aria-label="Flicx Gold">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#f43f5e" data-name="Rose" data-hue="350" style="--swatch:#f43f5e;" aria-label="Rose">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#ec4899" data-name="Pink" data-hue="330" style="--swatch:#ec4899;" aria-label="Pink">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#a855f7" data-name="Purple" data-hue="290" style="--swatch:#a855f7;" aria-label="Purple">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#6366f1" data-name="Indigo" data-hue="250" style="--swatch:#6366f1;" aria-label="Indigo">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#0ea5e9" data-name="Sky" data-hue="200" style="--swatch:#0ea5e9;" aria-label="Sky">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#10b981" data-name="Emerald" data-hue="150" style="--swatch:#10b981;" aria-label="Emerald">
              <span class="set-swatch-dot"></span>
            </button>
            <button type="button" class="set-swatch" data-color="#84cc16" data-name="Lime" data-hue="100" style="--swatch:#84cc16;" aria-label="Lime">
              <span class="set-swatch-dot"></span>
            </button>
          </div>
        </div>

        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Accent hue</label>
            <span class="set-slider-value" id="flicx-hue-val">${settingsState.accentHue}&deg;</span>
          </div>
          <input type="range" class="set-range" id="flicx-hue-range" min="0" max="360" value="${settingsState.accentHue}" />
        </div>

        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Glass blur</label>
            <span class="set-slider-value" id="flicx-blur-val">${settingsState.glassBlur}%</span>
          </div>
          <input type="range" class="set-range" id="flicx-blur-range" min="0" max="200" value="${settingsState.glassBlur}" />
        </div>
      `;

      // Swatches selection
      body.querySelectorAll('.set-swatch').forEach(btn => {
        btn.onclick = () => {
          settingsState.accentColor = btn.getAttribute('data-color');
          settingsState.accentName = btn.getAttribute('data-name');
          settingsState.accentHue = parseInt(btn.getAttribute('data-hue'), 10);
          saveSettingsState();
          const hueVal = body.querySelector('#flicx-hue-val');
          const hueRange = body.querySelector('#flicx-hue-range');
          if (hueVal) hueVal.innerHTML = settingsState.accentHue + '&deg;';
          if (hueRange) hueRange.value = settingsState.accentHue;
        };
      });

      // Background choices
      body.querySelectorAll('.set-choice[data-bg]').forEach(btn => {
        btn.onclick = () => {
          body.querySelectorAll('.set-choice[data-bg]').forEach(b => b.classList.remove('set-choice-active'));
          btn.classList.add('set-choice-active');
          settingsState.background = btn.getAttribute('data-bg');
          saveSettingsState();
        };
      });

      // Hue slider
      const hueInput = body.querySelector('#flicx-hue-range');
      if (hueInput) {
        hueInput.oninput = (e) => {
          const val = parseInt(e.target.value, 10);
          settingsState.accentHue = val;
          settingsState.accentColor = `hsl(${val}, 90%, 55%)`;
          settingsState.accentName = 'Custom';
          body.querySelector('#flicx-hue-val').innerHTML = val + '&deg;';
          saveSettingsState();
        };
      }

      // Blur slider
      const blurInput = body.querySelector('#flicx-blur-range');
      if (blurInput) {
        blurInput.oninput = (e) => {
          const val = parseInt(e.target.value, 10);
          settingsState.glassBlur = val;
          body.querySelector('#flicx-blur-val').textContent = val + '%';
          saveSettingsState();
        };
      }
    } else if (view === 'light') {
      titleEl.textContent = 'Ambient light';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-field">
          <div class="set-slider-head">
            <label class="set-label">Ambient light power</label>
            <span class="set-slider-value" id="flicx-amb-val">${settingsState.ambientLight}</span>
          </div>
          <input type="range" class="set-range" id="flicx-amb-range" min="0" max="100" value="${parseInt(settingsState.ambientLight, 10) || 60}" />
        </div>
        <div class="set-group" style="margin-top:1.5rem;">
          <div class="set-row" style="cursor:default;">
            <span class="set-row-label">Ambient light reflections</span>
            <input type="checkbox" id="flicx-amb-toggle" ${settingsState.ambientEnabled ? 'checked' : ''} style="cursor:pointer;width:1.2rem;height:1.2rem;accent-color:var(--color-flare);" />
          </div>
        </div>
      `;

      const ambRange = body.querySelector('#flicx-amb-range');
      if (ambRange) {
        ambRange.oninput = (e) => {
          const val = e.target.value;
          settingsState.ambientLight = val + '%';
          body.querySelector('#flicx-amb-val').textContent = val + '%';
          saveSettingsState();
        };
      }

      const ambToggle = body.querySelector('#flicx-amb-toggle');
      if (ambToggle) {
        ambToggle.onchange = (e) => {
          settingsState.ambientEnabled = e.target.checked;
          saveSettingsState();
        };
      }
    } else if (view === 'trailers') {
      titleEl.textContent = 'Trailers';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group">
          <div class="set-row" style="cursor:default;">
            <span class="set-row-label">Trailer sound</span>
            <input type="checkbox" id="flicx-sound-toggle" ${settingsState.trailerSound ? 'checked' : ''} style="cursor:pointer;width:1.2rem;height:1.2rem;accent-color:var(--color-flare);" />
          </div>
        </div>
      `;

      const soundToggle = body.querySelector('#flicx-sound-toggle');
      if (soundToggle) {
        soundToggle.onchange = (e) => {
          settingsState.trailerSound = e.target.checked;
          settingsState.trailers = e.target.checked ? 'Sound on' : 'Muted';
          saveSettingsState();
        };
      }
    } else if (view === 'keyboard') {
      titleEl.textContent = 'Keyboard Shortcuts';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group" style="font-size:0.9rem;">
          <div class="set-row"><span class="set-row-label">Search</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">/</kbd></div>
          <div class="set-row"><span class="set-row-label">Play / Pause</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">Space</kbd></div>
          <div class="set-row"><span class="set-row-label">Fullscreen</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">F</kbd></div>
          <div class="set-row"><span class="set-row-label">Mute / Unmute</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">M</kbd></div>
          <div class="set-row"><span class="set-row-label">Seek back / forward</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">&larr; / &rarr;</kbd></div>
          <div class="set-row"><span class="set-row-label">Close modal / back</span><kbd style="padding:0.2rem 0.5rem;background:#ffffff15;border-radius:4px;">Esc</kbd></div>
        </div>
      `;
    } else if (view === 'data') {
      titleEl.textContent = 'Your data';
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group">
          <button type="button" class="set-row" id="flicx-export-data">
            <span class="set-row-label">Save settings to a file</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <button type="button" class="set-row" id="flicx-import-data">
            <span class="set-row-label">Load settings from a file</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
          <input type="file" id="flicx-file-input" accept=".json" style="display:none;" />
          <button type="button" class="set-row" id="flicx-clear-data" style="color:#ef4444;">
            <span class="set-row-label">Clear all local data</span>
            <span class="set-row-go">${svg('caretRight')}</span>
          </button>
        </div>
      `;

      body.querySelector('#flicx-export-data').onclick = () => {
        const blob = new Blob([JSON.stringify(settingsState, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'flicx-settings.json';
        a.click();
      };

      const fileInput = body.querySelector('#flicx-file-input');
      body.querySelector('#flicx-import-data').onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
          try {
            settingsState = { ...settingsState, ...JSON.parse(re.target.result) };
            saveSettingsState();
            alert('Settings restored successfully!');
            renderSettingsView('main');
          } catch {
            alert('Invalid settings file format.');
          }
        };
        reader.readAsText(file);
      };

      body.querySelector('#flicx-clear-data').onclick = () => {
        if (confirm('Clear all settings and stored data?')) {
          localStorage.clear();
          location.reload();
        }
      };
    } else {
      titleEl.textContent = view.charAt(0).toUpperCase() + view.slice(1);
      backBtn.style.display = 'grid';
      searchWrap.style.display = 'none';

      body.innerHTML = `
        <div class="set-group">
          <div class="set-row" style="cursor:default;">
            <span class="set-row-label">Settings configured</span>
            <span class="set-row-value">Default</span>
          </div>
        </div>
      `;
    }
  }

  function openSettingsModal() {
    getSettingsState();
    renderSettingsView('main');
    const dialog = buildSettingsModal();
    const backdrop = document.getElementById('flicx-settings-backdrop');
    dialog.style.display = 'block';
    backdrop.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  // --- 8. Notifications Popover ---
  function buildNotificationsPopover() {
    let popover = document.getElementById('flicx-notes-popover');
    if (popover) return popover;

    popover = document.createElement('div');
    popover.id = 'flicx-notes-popover';
    popover.className = 'notes-popup';
    popover.style.display = 'none';

    popover.innerHTML = `
      <div class="notes-panel">
        <header class="notes-head">
          <h3 class="notes-title">Notifications</h3>
          <button type="button" class="notes-close" aria-label="Close notifications">
            ${svg('close')}
          </button>
        </header>
        <div class="notes-body">
          <div class="notes-empty">
            <span class="notes-empty-icon">${svg('bell')}</span>
            <p class="notes-empty-text">No new notifications</p>
            <p class="notes-empty-sub">We will notify you about updates and new releases here.</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(popover);

    function close() {
      popover.style.display = 'none';
      document.removeEventListener('click', outsideClick);
    }

    function outsideClick(e) {
      if (!popover.contains(e.target) && !e.target.closest('.notes-bell')) {
        close();
      }
    }

    popover.querySelector('.notes-close').onclick = close;

    return popover;
  }

  function toggleNotifications() {
    const popover = buildNotificationsPopover();
    if (popover.style.display === 'block') {
      popover.style.display = 'none';
    } else {
      const bell = document.querySelector('.notes-bell');
      if (bell) {
        const rect = bell.getBoundingClientRect();
        popover.style.position = 'fixed';
        popover.style.top = (rect.bottom + 12) + 'px';
        popover.style.right = (window.innerWidth - rect.right) + 'px';
        popover.style.zIndex = '9999';
      }
      popover.style.display = 'block';
      setTimeout(() => {
        document.addEventListener('click', function outside(e) {
          if (!popover.contains(e.target) && !e.target.closest('.notes-bell')) {
            popover.style.display = 'none';
            document.removeEventListener('click', outside);
          }
        });
      }, 10);
    }
  }

  // --- 9. Animated Logo Hover Re-trigger ---
  function initAnimatedLogoHover() {
    document.querySelectorAll('.flicx-logo-link, a[aria-label="Flicx home"]').forEach(link => {
      if (link.dataset.logoHoverActive) return;
      link.dataset.logoHoverActive = 'true';

      const svg = link.querySelector('svg');
      if (!svg) return;
      const parts = svg.querySelectorAll('#Rectangle_22048, #Union, #Rectangle_22049');
      if (!parts.length) return;

      // Ensure parts start completely paused
      parts.forEach(el => {
        el.style.animationPlayState = 'paused';
      });

      let animTimer = null;
      link.addEventListener('mouseenter', () => {
        if (animTimer) clearTimeout(animTimer);
        link.classList.add('is-animating');

        // Restart animation cleanly from 0
        link.classList.remove('is-animating');
        parts.forEach(el => {
          el.style.animation = 'none';
        });
        void link.offsetHeight;
        parts.forEach(el => {
          el.style.animation = '';
          el.style.animationIterationCount = '1';
          el.style.animationPlayState = 'running';
        });
        link.classList.add('is-animating');

        // 1.9s duration cleanly finishes the spring rebound back to rest
        animTimer = setTimeout(() => {
          link.classList.remove('is-animating');
          parts.forEach(el => {
            el.style.animationPlayState = 'paused';
          });
        }, 1900);
      });
    });
  }


  // Dynamically update shelf rail with live filtered items (time or genre)
  function updateShelfRail(triggerBtn, isGenre, selectedOpt) {
    const section = triggerBtn.closest('section, .section');
    if (!section) return;
    const railTrack = section.querySelector('.rail-track[role="list"]');
    if (!railTrack) return;

    const parentRow = triggerBtn.closest('.title-row, .section, header');
    const isTv = window.location.pathname.startsWith('/tv') || (parentRow && parentRow.textContent.includes('TV'));

    railTrack.style.transition = 'opacity 0.22s ease-out';
    railTrack.style.opacity = '0.35';

    let fetchPromise;
    if (isGenre) {
      const genreVal = selectedOpt.value || selectedOpt.label.toLowerCase();
      const kindParam = isTv ? 'show' : 'movie';
      const sectionLink = section.querySelector('.section-link, a[href*="/genres/"]');
      if (sectionLink) {
        sectionLink.href = `/genres/${encodeURIComponent(genreVal)}`;
        for (const n of sectionLink.childNodes) {
          if (n.nodeType === 3) { n.nodeValue = `All ${selectedOpt.label}`; break; }
        }
      }
      fetchPromise = fetch(`/api/browse?genre=${encodeURIComponent(genreVal)}&kind=${kindParam}`)
        .then(r => r.json())
        .then(data => data?.films || []);
    } else {
      const timeKeyMap = {
        'today': 'day',
        'this-week': 'week',
        'this-month': 'month',
        'this-year': 'year',
        'all-time': 'all'
      };
      const key = timeKeyMap[selectedOpt.value] || 'week';
      const kindParam = isTv ? 'tv' : 'movie';
      fetchPromise = fetch(`/api/trending?kind=${kindParam}`)
        .then(r => r.json())
        .then(data => data?.lists?.[key] || data?.lists?.week || []);
    }

    fetchPromise
      .then(items => {
        if (!items || items.length === 0) {
          railTrack.style.opacity = '1';
          return;
        }

        railTrack.innerHTML = items.map(item => {
          const detailUrl = (isTv || item.kind === 'show') ? `/tv/${item.slug}` : `/movie/${item.slug}`;
          const posterUrl = `https://s.fli.cx/a/poster/medium/${item.id}/img`;
          const ratingStr = item.rating ? Number(item.rating).toFixed(1) : '';
          const firstGenre = item.genres && item.genres.length > 0 ? item.genres[0] : (isGenre ? selectedOpt.label : 'Film');
          const toneColor = item.tone || '#5d341e';

          return `
            <div role="listitem">
              <div class="card" style="--tone:${toneColor}">
                <div class="card-art card-poster">
                  <span class="card-pic">
                    <img data-fade="true" src="${posterUrl}" alt="" width="500" height="750" loading="lazy" decoding="async" draggable="false" onerror="this.src='${item.still || ''}'" />
                  </span>
                  <span class="card-over">
                    <span class="card-over-cap">
                      <span class="card-over-title" aria-hidden="true">${item.title}</span>
                      <span class="card-over-meta">
                        <span class="card-over-genre">${firstGenre}</span>
                        <span class="card-over-year">${item.year || ''}</span>
                        ${ratingStr ? `
                        <span class="card-over-score" aria-label="Rated ${ratingStr} out of 10">
                          ${ratingStr}<span class="card-over-star" aria-hidden="true"></span>
                        </span>` : ''}
                      </span>
                    </span>
                  </span>
                </div>
                <a href="${detailUrl}" class="card-link" data-rail-focus="true" aria-label="${item.title} (${item.year || ''})"></a>
                <button type="button" class="cover-add" aria-label="Add to library: ${item.title}" data-watchlist-button="" data-title-slug="${item.slug}" data-title="${item.title}">
                  <svg class="cover-add-icon cover-add-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:1.25rem;height:1.25rem;display:block;">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
              </div>
            </div>
          `;
        }).join('');

        railTrack.scrollLeft = 0;
        railTrack.style.opacity = '1';

        try { initWatchlist(); } catch (e) {}
      })
      .catch(err => {
        console.warn('Failed to filter rail:', err);
        railTrack.style.opacity = '1';
      });
  }

  // --- 10. <title-select> & Season Selection with Smooth Transitions ---
  // Option definitions matching user reference images:
  const TIME_FILTER_OPTIONS = [
    { value: "today", label: "Today" },
    { value: "this-week", label: "This week" },
    { value: "this-month", label: "This month" },
    { value: "this-year", label: "This year" },
    { value: "all-time", label: "All time" }
  ];

  const GENRE_FILTER_OPTIONS = [
    { value: "drama", label: "Drama", subtitle: "Top rated drama titles" },
    { value: "action", label: "Action", subtitle: "Top rated action titles" },
    { value: "comedy", label: "Comedy", subtitle: "Top rated comedy titles" },
    { value: "animation", label: "Animation", subtitle: "Top rated animated titles" },
    { value: "horror", label: "Horror", subtitle: "Top rated horror titles" },
    { value: "sci-fi", label: "Sci-Fi", subtitle: "Top rated science fiction" },
    { value: "romance", label: "Romance", subtitle: "Top rated romance" },
    { value: "thriller", label: "Thriller", subtitle: "Top rated thrillers" }
  ];

  const KNOWN_SHOW_SEASONS = {
    "the-lord-of-the-rings-the-rings-of-power-2022": [
      { n: 1, label: "Season 1", subtitle: "8 episodes · 2022" },
      { n: 2, label: "Season 2", subtitle: "8 episodes · 2024" },
      { n: 3, label: "Season 3", subtitle: "6 episodes · 2026" }
    ],
    "the-mentalist-2008": [
      { n: 1, label: "Season 1", subtitle: "23 episodes · 2008" },
      { n: 2, label: "Season 2", subtitle: "23 episodes · 2009" },
      { n: 3, label: "Season 3", subtitle: "24 episodes · 2010" },
      { n: 4, label: "Season 4", subtitle: "24 episodes · 2011" },
      { n: 5, label: "Season 5", subtitle: "22 episodes · 2012" },
      { n: 6, label: "Season 6", subtitle: "22 episodes · 2013" },
      { n: 7, label: "Season 7", subtitle: "13 episodes · 2014" }
    ],
    "dexter-2006": [
      { n: 1, label: "Season 1", subtitle: "12 episodes · 2006" },
      { n: 2, label: "Season 2", subtitle: "12 episodes · 2007" },
      { n: 3, label: "Season 3", subtitle: "12 episodes · 2008" },
      { n: 4, label: "Season 4", subtitle: "12 episodes · 2009" },
      { n: 5, label: "Season 5", subtitle: "12 episodes · 2010" },
      { n: 6, label: "Season 6", subtitle: "12 episodes · 2011" },
      { n: 7, label: "Season 7", subtitle: "12 episodes · 2012" },
      { n: 8, label: "Season 8", subtitle: "12 episodes · 2013" }
    ],
    "the-legend-of-korra-2012": [
      { n: 1, label: "Season 1", subtitle: "12 episodes · 2012" },
      { n: 2, label: "Season 2", subtitle: "14 episodes · 2013" },
      { n: 3, label: "Season 3", subtitle: "13 episodes · 2014" },
      { n: 4, label: "Season 4", subtitle: "13 episodes · 2014" }
    ]
  };

  let activePopupEl = null;
  let activeTriggerBtn = null;

  function closeCurrentPopup() {
    if (!activePopupEl) return;
    const popup = activePopupEl;
    const trigger = activeTriggerBtn;
    activePopupEl = null;
    activeTriggerBtn = null;

    popup.classList.remove('select-popup-open');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      const caret = trigger.querySelector('.title-select-caret svg, svg:last-child');
      if (caret) caret.style.transform = '';
    }

    setTimeout(() => {
      if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 190);
  }

  function openDropdownPopup(triggerBtn, options, currentSelectedVal, onSelect) {
    closeCurrentPopup();

    const popup = document.createElement('div');
    popup.className = 'select-popup title-select-popup';
    popup.setAttribute('role', 'listbox');

    // Build option items matching reference images
    options.forEach(opt => {
      const optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.setAttribute('role', 'option');
      const normVal = String(currentSelectedVal || '').trim().toLowerCase();
      const isSelected = String(opt.label || '').trim().toLowerCase() === normVal ||
                         String(opt.value || '').trim().toLowerCase() === normVal ||
                         String(opt.value || '').trim().toLowerCase() === normVal.replace(/\s+/g, '-') ||
                         (opt.n != null && String(opt.n) === normVal.replace(/\D+/g, ''));
      optBtn.className = 'select-option' + (isSelected ? ' select-option-active' : '');
      optBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      optBtn.innerHTML = `
        <span class="select-option-text">
          <span class="select-option-title">${opt.label}</span>
          ${opt.subtitle ? `<span class="select-option-subtitle">${opt.subtitle}</span>` : ''}
        </span>
        ${isSelected ? `
        <svg class="select-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#ffffff;flex-shrink:0;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>` : ''}
      `;

      optBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(opt);
        closeCurrentPopup();
      };

      popup.appendChild(optBtn);
    });

    document.body.appendChild(popup);

    // Calculate position
    const rect = triggerBtn.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 8) + 'px';
    popup.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 300)) + 'px';
    popup.style.zIndex = '99999';

    // Trigger opening transition
    void popup.offsetHeight;
    popup.classList.add('select-popup-open');
    triggerBtn.setAttribute('aria-expanded', 'true');
    const caret = triggerBtn.querySelector('.title-select-caret svg, svg:last-child');
    if (caret) caret.style.transform = 'rotate(180deg)';

    activePopupEl = popup;
    activeTriggerBtn = triggerBtn;

    setTimeout(() => {
      document.addEventListener('click', function outside(e) {
        if (!popup.contains(e.target) && !triggerBtn.contains(e.target)) {
          closeCurrentPopup();
          document.removeEventListener('click', outside);
        }
      });
    }, 10);
  }

  // Dynamically update shelf rail with live trending releases
  function handleDynamicTrendingFilter(timeKey) {
    const isTv = window.location.pathname.startsWith('/tv');
    const railTrack = document.querySelector('.rail-track[role="list"]');
    if (!railTrack) return;

    railTrack.style.opacity = '0.35';
    railTrack.style.transition = 'opacity 0.2s ease-out';

    fetch(`/api/trending?kind=${isTv ? 'tv' : 'movie'}`)
      .then(res => res.json())
      .then(data => {
        railTrack.style.opacity = '1';
        const list = data?.lists?.[timeKey] || data?.lists?.week || [];
        if (list.length === 0) return;

        railTrack.innerHTML = list.map(item => `
          <div role="listitem">
            <div class="card-wrap">
              <a class="card group relative flex flex-col overflow-hidden rounded-xl transition-colors" data-rail-focus="true" href="${isTv ? '/tv/' : '/movie/'}${item.slug}">
                <div class="card-art relative aspect-[2/3] w-[140px] md:w-[170px] overflow-hidden rounded-lg ">
                  <img src="https://s.fli.cx/a/poster/medium/${item.id}/img" alt="${item.title}" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" onerror="this.src='${item.still || ''}'" />
                  ${item.rating ? `<div class="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">★ ${Number(item.rating).toFixed(1)}</div>` : ''}
                </div>
                <div class="mt-2 flex flex-col">
                  <h4 class="font-semibold text-sm text-fg truncate">${item.title}</h4>
                  <p class="text-xs text-fg-subtle truncate mt-0.5">${item.year} ${item.genres && item.genres.length ? '· ' + item.genres[0] : ''}</p>
                </div>
              </a>
            </div>
          </div>
        `).join('');

        initCardNavigation();
        initRailScroll();
      })
      .catch(() => {
        railTrack.style.opacity = '1';
      });
  }

  function initTitleSelect() {
    const isTvDetail = window.location.pathname.startsWith('/tv/');
    const pathSlug = window.location.pathname.replace(/^\/tv\//, '').replace(/\/$/, '').split('/')[0];

    document.querySelectorAll('button.title-select, [role="combobox"].title-select, .title-select').forEach(el => {
      const triggerBtn = el.tagName === 'BUTTON' ? el : (el.querySelector('button') || el);
      if (triggerBtn.__selectBound) return;
      triggerBtn.__selectBound = true;

      const btnText = (triggerBtn.querySelector('.title-select-text') || triggerBtn).textContent.trim();
      const parentRow = triggerBtn.closest('.title-row, .section, header');
      const isSeasonSelect = isTvDetail || btnText.startsWith('Season') || (parentRow && parentRow.textContent.includes('Episodes'));

      if (isSeasonSelect) {
        // --- SEASONS SELECTOR ---
        triggerBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (activeTriggerBtn === triggerBtn) {
            closeCurrentPopup();
            return;
          }

          // Discover show seasons
          let seasons = KNOWN_SHOW_SEASONS[pathSlug];
          if (!seasons) {
            // Parse from page's download buttons or facts
            const dlButtons = document.querySelectorAll('.dl-file-title');
            const foundNums = new Set();
            dlButtons.forEach(b => {
              const m = b.textContent.match(/Season (\d+)/i);
              if (m) foundNums.add(parseInt(m[1], 10));
            });

            if (foundNums.size > 0) {
              const maxSeason = Math.max(...foundNums);
              seasons = [];
              for (let i = 1; i <= maxSeason; i++) {
                seasons.push({ n: i, label: `Season ${i}`, subtitle: `Episodes available` });
              }
            } else {
              seasons = [
                { n: 1, label: "Season 1", subtitle: "8 episodes" },
                { n: 2, label: "Season 2", subtitle: "8 episodes" }
              ];
            }
          }

          const currentSeasonMatch = (triggerBtn.querySelector('.title-select-text') || triggerBtn).textContent.match(/Season (\d+)/i);
          const currentSeasonVal = currentSeasonMatch ? `Season ${currentSeasonMatch[1]}` : 'Season 1';

          openDropdownPopup(triggerBtn, seasons, currentSeasonVal, (selectedOpt) => {
            const labelSpan = triggerBtn.querySelector('.title-select-text') || triggerBtn;
            labelSpan.textContent = selectedOpt.label;

            // Load and switch season episodes
            loadSeasonEpisodes(pathSlug, selectedOpt.n);
          });
        };
      } else {
        // --- TIME / GENRE TITLE-SELECT ---
        const isGenre = btnText === 'Drama' || btnText === 'Action' || btnText === 'Comedy' || (parentRow && parentRow.textContent.includes('Greats'));
        const options = isGenre ? GENRE_FILTER_OPTIONS : TIME_FILTER_OPTIONS;

        triggerBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (activeTriggerBtn === triggerBtn) {
            closeCurrentPopup();
            return;
          }

          const currentVal = (triggerBtn.querySelector('.title-select-text') || triggerBtn).textContent.trim();
          openDropdownPopup(triggerBtn, options, currentVal, (selectedOpt) => {
            const labelSpan = triggerBtn.querySelector('.title-select-text') || triggerBtn;
            labelSpan.textContent = selectedOpt.label;

            // Dynamically update the shelf rail items
            updateShelfRail(triggerBtn, isGenre, selectedOpt);
          });
        };
      }
    });
  }

  // Fetch and update TV episodes rail dynamically
  function loadSeasonEpisodes(showSlug, seasonNum) {
    const railTrack = document.querySelector('.rail-track[role="list"]');
    if (!railTrack) return;

    railTrack.style.opacity = '0.5';
    fetch(`/api/tv/season?show=${encodeURIComponent(showSlug)}&n=${seasonNum}`)
      .then(res => res.json())
      .then(data => {
        railTrack.style.opacity = '1';
        if (!data || !data.episodes || data.episodes.length === 0) return;

        railTrack.innerHTML = data.episodes.map(ep => {
          const stillUrl = ep.still && ep.still.src ? ep.still.src : (ep.still ? `https://s.fli.cx/t/w500/${ep.still}` : '');
          const ratingVal = ep.rating ? (typeof ep.rating === 'number' ? ep.rating.toFixed(1) : ep.rating) : '';
          return `
            <div role="listitem" data-episode="${ep.n}">
              <a class="card episode" data-rail-focus="true" aria-label="Episode ${ep.n}: ${ep.title}" href="/watch/${showSlug}/s${seasonNum}e${ep.n}">
                <span class="card-art card-still">
                  <span class="card-pic">
                    <img data-fade="true" src="${stillUrl}" alt="${ep.title}" width="780" height="439" loading="lazy" decoding="async" draggable="false" />
                  </span>
                </span>
                <span class="episode-text">
                  <span class="episode-meta">
                    <span>Episode ${ep.n}${ep.runtime ? ` · ${ep.runtime}m` : ''}</span>
                    ${ratingVal ? `
                    <span class="episode-score">
                      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
                        <path d="M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"></path>
                      </svg>${ratingVal}<span class="sr-only"> out of 10</span>
                    </span>` : ''}
                  </span>
                  <span class="episode-title">${ep.title}</span>
                  <span class="episode-story">${ep.overview || ''}</span>
                </span>
              </a>
            </div>
          `;
        }).join('');
        try { initRailScroll(); } catch (e) {}
        try { initCardNavigation(); } catch (e) {}
      })
      .catch(() => {
        railTrack.style.opacity = '1';
      });
  }

  // --- 11. Full Search Functionality on /search ---
  function initSearchPage() {
    const isSearchPage = window.location.pathname.startsWith('/search');
    const searchInput = document.getElementById('search-page-input') || document.querySelector('input[type="search"]');

    // Global shortcut: press "/" anywhere outside inputs to open / focus search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        if (isSearchPage && searchInput) {
          searchInput.focus();
          searchInput.select();
        } else {
          navigateTo('/search');
        }
      }
    });

    if (!isSearchPage || !searchInput) return;

    const searchField = searchInput.closest('.search-field') || searchInput.parentElement;
    const searchStart = document.querySelector('.search-start');
    const pageEl = document.querySelector('.page') || document.body;

    // Add clear button inside search field
    let clearBtn = searchField.querySelector('.search-field-clear');
    if (!clearBtn) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'search-field-clear';
      clearBtn.setAttribute('aria-label', 'Clear search');
      clearBtn.style.cssText = 'display:none;position:absolute;right:1rem;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;border-radius:50%;width:1.8rem;height:1.8rem;color:#fff;cursor:pointer;place-items:center;font-size:1rem;';
      clearBtn.innerHTML = '&times;';
      if (searchField.style.position !== 'absolute' && searchField.style.position !== 'relative') {
        searchField.style.position = 'relative';
      }
      searchField.appendChild(clearBtn);
    }

    // Results container
    let resultsContainer = document.querySelector('.search-results');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.className = 'search-results shell gutter';
      resultsContainer.style.cssText = 'display:none;padding-top:2rem;min-height:50vh;';
      if (searchStart && searchStart.parentNode) {
        searchStart.parentNode.insertBefore(resultsContainer, searchStart.nextSibling);
      } else {
        pageEl.appendChild(resultsContainer);
      }
    }

    let searchTimer = null;

    function executeSearch(query) {
      query = query.trim();
      if (!query) {
        clearBtn.style.display = 'none';
        resultsContainer.style.display = 'none';
        if (searchStart) searchStart.style.display = 'block';
        return;
      }

      clearBtn.style.display = 'grid';
      if (searchStart) searchStart.style.display = 'none';
      resultsContainer.style.display = 'block';
      resultsContainer.innerHTML = `
        <div style="text-align:center;padding:4rem 0;color:rgba(255,255,255,0.6);">
          <div class="search-wait-spinner" style="display:inline-block;width:2rem;height:2rem;border:3px solid rgba(255,255,255,0.2);border-top-color:var(--color-flare, #f59e0b);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <p style="margin-top:1rem;font-size:0.95rem;">Searching for "${query}"...</p>
        </div>
      `;

      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
          const results = data.results || [];
          if (results.length === 0) {
            resultsContainer.innerHTML = `
              <div class="search-none" style="text-align:center;padding:5rem 1rem;">
                <h3 class="search-none-title" style="font-size:1.4rem;font-weight:700;color:#fff;">No results found for "${query}"</h3>
                <p class="search-none-text" style="color:rgba(255,255,255,0.55);margin-top:0.5rem;font-size:0.95rem;">Try checking the spelling or searching for another title, actor, or genre.</p>
              </div>
            `;
            return;
          }

          resultsContainer.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
              ${results.map(item => {
                const isShow = item.kind === 'show' || (item.runtime && item.runtime < 65 && item.runtime > 15);
                const itemHref = isShow ? `/tv/${item.slug}` : `/movie/${item.slug}`;
                const posterUrl = `https://s.fli.cx/a/poster/medium/${item.id}/img`;
                const stillUrl = item.still || '';
                const rating = item.rating ? Number(item.rating).toFixed(1) : '';
                const genre = item.genres && item.genres[0] ? item.genres[0] : (isShow ? 'Series' : 'Film');
                const tone = item.tone || '#5d341e';

                return `
                  <div class="card" style="--tone:${tone}">
                    <div class="card-art card-poster">
                      <span class="card-pic">
                        <img data-fade="true" src="${posterUrl}" alt="" width="500" height="750" loading="lazy" decoding="async" draggable="false" onerror="this.onerror=null;if('${stillUrl}')this.src='${stillUrl}';else this.style.display='none';" />
                      </span>
                      <span class="card-fallback" aria-hidden="true">${item.title}</span>
                      <span class="card-over">
                        <span class="card-over-cap">
                          <span class="card-over-title" aria-hidden="true">${item.title}</span>
                          <span class="card-over-meta">
                            <span class="card-over-genre">${genre}</span>
                            <span class="card-over-year">${item.year || ''}</span>
                            ${rating ? `<span class="card-over-score" aria-label="Rated ${rating} out of 10">${rating}<span class="card-over-star" aria-hidden="true"></span></span>` : ''}
                          </span>
                        </span>
                      </span>
                    </div>
                    <a class="card-link" data-film="${item.slug}" data-rail-focus="true" aria-label="${item.title} (${item.year || ''})" href="${itemHref}"></a>
                    <button type="button" class="cover-add" aria-pressed="false" aria-label="Add to library: ${item.title}" title="Add to library" tabindex="-1" data-watchlist-button="" data-title-slug="${item.slug}" data-title="${item.title}">
                      <svg class="cover-add-icon cover-add-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:1.25rem;height:1.25rem;display:block;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          `;

          try { initWatchlist(); } catch (e) {}
          try { initCardNavigation(); } catch (e) {}
        })
        .catch(() => {
          resultsContainer.innerHTML = `
            <div class="search-none" style="text-align:center;padding:5rem 1rem;">
              <h3 class="search-none-title" style="font-size:1.4rem;font-weight:700;color:#fff;">Search is unavailable</h3>
              <p class="search-none-text" style="color:rgba(255,255,255,0.55);margin-top:0.5rem;">Could not load search results. Please try again.</p>
            </div>
          `;
        });
    }

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        executeSearch(e.target.value);
      }, 180);
    });

    clearBtn.onclick = () => {
      searchInput.value = '';
      executeSearch('');
      searchInput.focus();
    };

    // Check URL parameters for ?q=
    const params = new URLSearchParams(window.location.search);
    if (params.has('q')) {
      searchInput.value = params.get('q');
      executeSearch(params.get('q'));
    }
  }

  // --- 12. Liquid Glass Styles & Animation Injection ---
  
  // --- Liquid Glass Attribute Helper ---
  function applyLiquidChromeAttributes() {
    try {
      const selectors = [
        '[data-chrome]',
                '.top-nav',
        '.top-pill',
        '.header-tools',
        '.tab-bar',
        '.tab-bar [data-chrome]'
      ];
      document.querySelectorAll(selectors.join(', ')).forEach(el => {
        if (!el.hasAttribute('data-liquid')) {
          el.setAttribute('data-liquid', '');
        }
      });
    } catch (e) {
      console.warn('Error applying data-liquid attribute', e);
    }
  }

  function injectLiquidGlassStyles() {
    applyLiquidChromeAttributes();
    if (document.getElementById('flicx-liquid-glass-styles')) return;
    const style = document.createElement('style');
    style.id = 'flicx-liquid-glass-styles';
    style.textContent = `
      
      /* Ensure absolute nav container centering */
      nav[aria-label="Primary"].absolute,
      .site-header nav.absolute {
        position: absolute !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        translate: none !important;
      }

      
      .hero { --hero-duration: 7s !important; }
      
      /* Authentic Flicx Hero Switcher Progress Bar & Dots */
      .hero-switch-bars {
        align-items: center !important;
        height: 100% !important;
        display: flex !important;
      }
      .hero-switch-bar {
        align-items: center !important;
        height: 100% !important;
        padding-inline: 0.25rem !important;
        display: flex !important;
        background: transparent !important;
        border: none !important;
        cursor: pointer !important;
      }
      .hero-switch-bar > span {
        width: 0.5rem !important;
        height: 0.3125rem !important;
        transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease !important;
        background: rgba(255, 255, 255, 0.32) !important;
        border-radius: 999px !important;
        display: block !important;
        overflow: clip !important;
        position: relative !important;
      }
      .hero-switch-bar[aria-current="true"] > span {
        width: 2.25rem !important;
      }
      .hero-switch-bar:not([aria-current="true"]):hover > span {
        background: rgba(255, 255, 255, 0.62) !important;
      }
      .hero-switch-fill {
        border-radius: inherit !important;
        background: #ffffff !important;
        transform-origin: 0 50% !important;
        height: 100% !important;
        width: 100% !important;
        display: block !important;
      }
      .hero-clock {
        animation: hero-clock var(--hero-duration, 9s) linear both !important;
        animation-play-state: var(--hero-play, running) !important;
      }
      @keyframes hero-clock {
        0% { transform: scaleX(0); }
        100% { transform: scaleX(1); }
      }

      /* Authentic Capsule Button Text (Add to library / In your library) */
      .capsule-btn.capsule-btn-text {
        padding-inline: 0.875rem 1.078rem !important;
        font-size: 0.9375rem !important;
        font-weight: 600 !important;
        color: #ffffff !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.5rem !important;
        white-space: nowrap !important;
      }

      /* Rail Arrow Smooth Transitions */
      .rail-arrow {
        transition: opacity 0.2s ease, transform 0.2s ease !important;
        cursor: pointer !important;
      }
      .rail-arrow:hover:not([disabled]) {
        transform: scale(1.08) !important;
      }
      .rail-arrow[disabled] {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* Logo Hover-Only Spring Animation (Strictly no interval looping) */
      #Rectangle_22048,
      #Union,
      #Rectangle_22049 {
        animation-play-state: paused !important;
        animation-iteration-count: 1 !important;
      }

      .flicx-logo-link:hover #Rectangle_22048,
      .flicx-logo-link:hover #Union,
      .flicx-logo-link:hover #Rectangle_22049,
      .flicx-logo-link.is-animating #Rectangle_22048,
      .flicx-logo-link.is-animating #Union,
      .flicx-logo-link.is-animating #Rectangle_22049 {
        animation-play-state: running !important;
      }

      /* Authentic Flicx Liquid Glass Header & Navbar via data-liquid */
      [data-liquid],
      .site-header [data-chrome][data-liquid],
      .site-header [data-chrome],
      .top-nav.top-pill,
      .top-pill[data-liquid],
      .header-tools[data-liquid],
      .header-tools.glass,
      .tab-bar [data-chrome][data-liquid],
      .tab-bar [data-chrome] {
        background: color-mix(in oklab, #141721 44%, transparent) !important;
        -webkit-backdrop-filter: blur(calc(24px * var(--blur-scale, 1))) saturate(1.85) brightness(0.9) !important;
        backdrop-filter: blur(calc(24px * var(--blur-scale, 1))) saturate(1.85) brightness(0.9) !important;
        box-shadow: 
          0 0 0 1px rgba(255, 255, 255, 0.12), 
          0 18px 45px -12px rgba(0, 0, 0, 0.65),
          inset 0 1px 1px 0 rgba(255, 255, 255, 0.32),
          inset 0 -1px 1px 0 rgba(0, 0, 0, 0.25) !important;
        border-radius: 9999px !important;
        position: relative !important;
        overflow: hidden !important;
      }
      [data-liquid]:before,
      .site-header [data-chrome][data-liquid]:before,
      .top-pill[data-liquid]:before,
      .header-tools[data-liquid]:before,
      .tab-bar [data-chrome][data-liquid]:before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: inherit !important;
        background: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.22) 0%,
          rgba(255, 255, 255, 0.05) 35%,
          rgba(255, 255, 255, 0) 55%,
          rgba(255, 255, 255, 0.08) 100%
        ) !important;
        pointer-events: none !important;
        z-index: 1 !important;
      }
      [data-liquid]:after,
      .site-header [data-chrome][data-liquid]:after,
      .site-header [data-chrome]:after,
      .top-nav.top-pill:after,
      .top-pill[data-liquid]:after,
      .header-tools[data-liquid]:after,
      .header-tools.glass:after,
      .tab-bar [data-chrome][data-liquid]:after,
      .tab-bar [data-chrome]:after {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: inherit !important;
        pointer-events: none !important;
        box-shadow: 
          inset 0 0 0 0.5px rgba(255, 255, 255, 0.18), 
          inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.38) !important;
        z-index: 1 !important;
      }
      .top-pill[data-liquid] > *,
      .header-tools[data-liquid] > *,
      [data-liquid] > * {
        position: relative !important;
        z-index: 2 !important;
      }
      .header-tool {
        transition: background-color 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
        border-radius: 9999px !important;
      }
      .header-tool:hover {
        background: rgba(255, 255, 255, 0.14) !important;
        transform: scale(1.05) !important;
      }
      .top-tab {
        transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
        border-radius: 9999px !important;
      }
      .top-tab:hover {
        background: rgba(255, 255, 255, 0.1) !important;
        color: #ffffff !important;
        transform: scale(1.02) !important;
      }

      /* <title-select> & Dropdown Popup Animations */
      .title-select-caret svg {
        transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .select-popup {
        background: rgba(26, 26, 30, 0.94) !important;
        -webkit-backdrop-filter: blur(28px) saturate(1.8) !important;
        backdrop-filter: blur(28px) saturate(1.8) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 1.25rem !important;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 24px 48px -12px rgba(0, 0, 0, 0.75) !important;
        padding: 0.45rem !important;
        min-width: 15rem !important;
        opacity: 0;
        transform: scale(0.95) translateY(-8px);
        transform-origin: top left;
        transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .select-popup.select-popup-open {
        opacity: 1 !important;
        transform: scale(1) translateY(0) !important;
        pointer-events: auto !important;
      }
      .select-option {
        border: none;
        background: transparent;
        border-radius: 0.75rem;
        padding: 0.65rem 0.95rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        width: 100%;
        text-align: left;
        transition: background-color 0.14s ease, color 0.14s ease;
        color: #ffffff;
      }
      .select-option:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .select-option.select-option-active {
        background: rgba(255, 255, 255, 0.13);
      }
      .select-option-text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .select-option-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: #ffffff;
        line-height: 1.2;
      }
      .select-option-subtitle {
        font-size: 0.8rem;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.55);
        line-height: 1.2;
      }
      .select-check {
        color: #ffffff;
        flex-shrink: 0;
        margin-left: 1rem;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* --- Authentic Flicx View Transitions & Page Transitions --- */
      ::view-transition { pointer-events: none; }
      ::view-transition-old(.page-fade) { animation: .24s linear both vt-hold; }
      ::view-transition-new(.page-fade) { animation: .24s ease-out both vt-fade-in; }
      @keyframes vt-hold { 0%, to { opacity: 1; } }
      @keyframes vt-fade-in { 0% { opacity: 0; } }

      html:active-view-transition .site-header { view-transition-name: site-header; }
      html:active-view-transition .tab-bar { view-transition-name: tab-bar; }
      ::view-transition-group(site-header) { z-index: 100; animation: none; }
      ::view-transition-group(tab-bar) { z-index: 100; animation: none; }
      ::view-transition-old(site-header), ::view-transition-old(tab-bar) { display: none; }
      ::view-transition-new(site-header), ::view-transition-new(tab-bar) { animation: none; }

      html:active-view-transition .site-header [data-chrome=nav] { view-transition-name: chrome-nav; }
      html:active-view-transition .site-header [data-chrome=tools] { view-transition-name: chrome-tools; }
      html:active-view-transition .tab-bar [data-chrome=tabs] { view-transition-name: chrome-tabs; }

      ::view-transition-group(chrome-nav) {
        z-index: 101;
        border-radius: calc(999px * var(--corner-scale, 1));
        -webkit-backdrop-filter: var(--frost-chrome);
        backdrop-filter: var(--frost-chrome);
        animation: none;
      }
      ::view-transition-group(chrome-tools) {
        z-index: 101;
        border-radius: calc(999px * var(--corner-scale, 1));
        -webkit-backdrop-filter: var(--frost-chrome);
        backdrop-filter: var(--frost-chrome);
        animation: none;
      }
      ::view-transition-group(chrome-tabs) {
        z-index: 101;
        border-radius: calc(999px * var(--corner-scale, 1));
        -webkit-backdrop-filter: var(--frost-chrome);
        backdrop-filter: var(--frost-chrome);
        animation: none;
      }
      ::view-transition-old(chrome-nav), ::view-transition-old(chrome-tools), ::view-transition-old(chrome-tabs) { display: none; }
      ::view-transition-new(chrome-nav), ::view-transition-new(chrome-tools), ::view-transition-new(chrome-tabs) { animation: none; }

      /* Authentic Flicx Top Pending Progress Bar */
      html[data-pending]:after {
        content: "";
        z-index: 200;
        background: var(--color-fg, #ffffff);
        transform-origin: 0;
        pointer-events: none;
        width: 100%;
        height: 2px;
        animation: 3s cubic-bezier(.1, .7, .2, 1) both pending-run;
        position: fixed;
        top: 0;
        left: 0;
      }
      @keyframes pending-run {
        0% { transform: scaleX(0); }
        to { transform: scaleX(.94); }
      }

      /* Hero Transitions from authentic Flicx */
      .hero-slide {
        position: absolute;
        inset: 0;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s ease-out;
        will-change: opacity, transform;
      }
      .hero-slide[data-state=active] {
        opacity: 1;
        visibility: visible;
        z-index: 2;
      }
      .hero-slide[data-state=leaving] {
        opacity: 1;
        visibility: visible;
        z-index: 1;
      }
      .hero-slide[data-state=active][data-animate] {
        animation: .9s both hero-cross;
      }
      @keyframes hero-cross {
        0% { opacity: 0; }
        100% { opacity: 1; }
      }
      .hero-clock {
        animation: hero-clock var(--hero-duration, 9s) linear both;
        animation-play-state: var(--hero-play, running);
      }
      @keyframes hero-clock {
        0% { transform: scaleX(0); }
        to { transform: scaleX(1); }
      }
      .hero[data-paused] { --hero-play: paused; }

      /* Switcher bar styling from authentic Flicx */
      .hero-switch-bars {
        align-items: center;
        height: 100%;
        display: flex;
      }
      .hero-switch-bar {
        align-items: center;
        height: 100%;
        padding-inline: .25rem;
        display: flex;
        background: transparent;
        border: none;
        cursor: pointer;
        padding-block: 0;
        margin: 0;
      }
      .hero-switch-bar > span {
        width: .5rem;
        height: .3125rem;
        transition: width .6s cubic-bezier(0.16, 1, 0.3, 1), background-color .2s ease;
        background: rgba(255, 255, 255, 0.32);
        border-radius: 999px;
        display: block;
        overflow: clip;
      }
      .hero-switch-bar[aria-current="true"] > span {
        width: 2.25rem;
      }
      .hero-switch-bar:not([aria-current="true"]):hover > span {
        background: rgba(255, 255, 255, 0.62);
      }
      .hero-switch-fill {
        border-radius: inherit;
        background: #ffffff;
        transform-origin: 0% 50%;
        height: 100%;
        width: 100%;
        display: block;
      }

      /* Popups, Modals & Settings Transitions from authentic Flicx */
      @keyframes set-fade {
        0% { opacity: 0; transform: translateY(-4px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .set-body, .set-pick-list, .popover-panel {
        animation: .16s ease-out both set-fade;
      }
      .set-pick-caret {
        transition: rotate .2s;
      }
      .set-pick[data-open] .set-pick-caret {
        rotate: 180deg;
      }

      /* CSS Fallback animations */
      main.page-transitioning-out, .watch-root.page-transitioning-out {
        animation: 0.18s ease-out both vt-hold !important;
      }
      main.page-transitioning-in, .watch-root.page-transitioning-in {
        animation: 0.24s ease-out both vt-fade-in !important;
      }

      #flicx-nav-progress {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  // --- 12. Ultra-Smooth Page Transitions & Client-Side Navigation ---
  const pageCache = new Map();
  let isNavigating = false;
  let navProgressBar = null;
  let currentRenderedPath = window.location.pathname + window.location.search;

  function ensureProgressBar() {
    if (!navProgressBar) {
      navProgressBar = document.getElementById('flicx-nav-progress');
      if (!navProgressBar) {
        navProgressBar = document.createElement('div');
        navProgressBar.id = 'flicx-nav-progress';
        document.body.appendChild(navProgressBar);
      }
    }
    return navProgressBar;
  }

  function startNavProgress() {
    const bar = ensureProgressBar();
    bar.style.transition = 'none';
    bar.style.width = '0%';
    bar.style.opacity = '1';
    requestAnimationFrame(() => {
      bar.style.transition = 'width 0.28s cubic-bezier(0.1, 0.8, 0.2, 1)';
      bar.style.width = '45%';
      setTimeout(() => {
        if (isNavigating) {
          bar.style.width = '75%';
        }
      }, 160);
    });
  }

  function finishNavProgress() {
    const bar = ensureProgressBar();
    bar.style.transition = 'width 0.14s ease-out, opacity 0.22s ease-out 0.08s';
    bar.style.width = '100%';
    bar.style.opacity = '0';
  }

  async function fetchPageHtml(path) {
    if (pageCache.has(path)) {
      return pageCache.get(path);
    }
    const res = await fetch(path, {
      headers: { 'X-Requested-With': 'Flicx-Router' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (pageCache.size > 25) {
      const first = pageCache.keys().next().value;
      pageCache.delete(first);
    }
    pageCache.set(path, html);
    return html;
  }

  async function navigateTo(targetPath, pushState = true) {
    if (isNavigating) return;
    if (pushState && targetPath === currentRenderedPath) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    isNavigating = true;
    document.documentElement.setAttribute("data-pending", "");

    try {
      const html = await fetchPageHtml(targetPath);
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(html, 'text/html');

      const currentMain = document.querySelector('main') || document.querySelector('.watch-root');

      if (document.startViewTransition) {
        const transition = document.startViewTransition(() => {
          swapPageDom(newDoc, targetPath, pushState);
        });
        await transition.finished.catch(() => {});
      } else {
        if (currentMain) {
          currentMain.classList.add('page-transitioning-out');
          await new Promise(r => setTimeout(r, 140));
        }
        swapPageDom(newDoc, targetPath, pushState);
        const activeMain = document.querySelector('main') || document.querySelector('.watch-root');
        if (activeMain) {
          activeMain.classList.add('page-transitioning-in');
          setTimeout(() => {
            activeMain.classList.remove('page-transitioning-in');
          }, 280);
        }
      }
    } catch (err) {
      console.warn('Transition navigation failed, falling back to full reload', err);
      window.location.href = targetPath;
      return;
    } finally {
      isNavigating = false;
      document.documentElement.removeAttribute("data-pending");
    }
  }

  function swapPageDom(newDoc, targetPath, pushState) {
    currentRenderedPath = targetPath;

    // 1. Title
    document.title = newDoc.title;

    // 2. Push history state
    if (pushState) {
      window.history.pushState({ path: targetPath }, newDoc.title, targetPath);
    }

    // 3. Clear timers
    if (heroTimer) {
      clearInterval(heroTimer);
      heroTimer = null;
    }

    const isTargetWatch = targetPath.startsWith('/watch/');
    const currentHeader = document.querySelector('.site-header, header');
    const newHeader = newDoc.querySelector('.site-header, header');
    const currentMain = document.querySelector('main');
    const newMain = newDoc.querySelector('main');
    const currentWatchRoot = document.querySelector('.watch-root');
    const newWatchRoot = newDoc.querySelector('.watch-root');

    if (isTargetWatch) {
      if (currentHeader) currentHeader.style.display = 'none';
      if (currentMain) currentMain.style.display = 'none';

      let watchContainer = document.querySelector('.watch-root');
      if (!watchContainer) {
        watchContainer = document.createElement('div');
        watchContainer.className = 'watch-root';
        document.body.prepend(watchContainer);
      }
      watchContainer.style.display = 'block';
      if (newWatchRoot) {
        watchContainer.innerHTML = newWatchRoot.innerHTML;
      }
    } else {
      if (currentWatchRoot) {
        currentWatchRoot.style.display = 'none';
        currentWatchRoot.innerHTML = '';
      }

      if (!currentHeader && newHeader) {
        document.body.prepend(newHeader);
      } else if (currentHeader) {
        currentHeader.style.display = '';
      }

      if (currentMain && newMain) {
        currentMain.style.display = '';
        currentMain.replaceWith(newMain);
      } else if (newMain) {
        const header = document.querySelector('.site-header, header');
        if (header && header.nextSibling) {
          header.parentNode.insertBefore(newMain, header.nextSibling);
        } else {
          document.body.appendChild(newMain);
        }
      }
    }

    // 4. Update Navigation active tabs
    updateActiveNavTabs(targetPath);

    // 5. Scroll to top
    window.scrollTo(0, 0);

    // 6. Reinitialize page features
    reinitPageFeatures();
  }

  function updateActiveNavTabs(currentPath) {
    const cleanCurrent = currentPath.split('?')[0].replace(/\/$/, '') || '/';
    document.querySelectorAll('.top-tabs a, .top-nav a, nav[aria-label="Primary"] a, .site-header a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      const cleanHref = href.split('?')[0].replace(/\/$/, '') || '/';
      const isActive = cleanHref === '/' ? cleanCurrent === '/' : cleanCurrent.startsWith(cleanHref);

      if (isActive) {
        a.classList.add('active', 'text-white');
        a.setAttribute('aria-current', 'page');
      } else {
        a.classList.remove('active', 'text-white');
        a.removeAttribute('aria-current');
      }
    });
  }

  function reinitPageFeatures() {
    try { applyLiquidChromeAttributes(); } catch (e) {}
    closeCurrentPopup();

    try { initHeroCarousel(); } catch (e) { console.error(e); }
    try { initRailScroll(); } catch (e) { console.error(e); }
    try { initWatchlist(); } catch (e) { console.error(e); }
    try { initWatchPlayer(); } catch (e) { console.error(e); }
    try { initTitleSelect(); } catch (e) { console.error(e); }
    try { initSearchPage(); } catch (e) { console.error(e); }
    try { initAnimatedLogoHover(); } catch (e) { console.error(e); }
  }

  let transitionsInitialized = false;
  function initPageTransitions() {
    if (transitionsInitialized) return;
    transitionsInitialized = true;

    // Global Link Interception
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      if (e.target.closest('button, input, select, textarea, [data-watchlist-button], .cover-add, .watch-server-btn, .watch-fs-btn, .settings-btn, .notes-bell, .hero-switch-bar, .hero-pause, .select-option, .title-select, .dl-file-btn')) {
        return;
      }

      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        return;
      }

      if (link.getAttribute('target') === '_blank' || link.hasAttribute('download')) {
        return;
      }

      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) {
          return;
        }

        e.preventDefault();
        navigateTo(url.pathname + url.search);
      } catch (err) {}
    }, true);

    // Browser History Navigation (Back / Forward)
    window.addEventListener('popstate', () => {
      navigateTo(window.location.pathname + window.location.search, false);
    });

    // Hover prefetch for instantaneous transitions
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin === window.location.origin) {
          const path = url.pathname + url.search;
          if (!pageCache.has(path)) {
            fetchPageHtml(path).catch(() => {});
          }
        }
      } catch (err) {}
    }, { passive: true });
  }

  // --- Bootstrap on load ---
  function bootstrap() {
    try { injectLiquidGlassStyles(); applyLiquidChromeAttributes(); } catch (e) { console.error('Liquid glass error', e); }
    try { getSettingsState(); } catch (e) { console.error('Settings init error', e); }
    try { initHeroCarousel(); } catch (e) { console.error('Hero init error', e); }
    try { initCardNavigation(); } catch (e) { console.error('Card nav error', e); }
    try { initRailScroll(); } catch (e) { console.error('Rail scroll error', e); }
    try { initWatchlist(); } catch (e) { console.error('Watchlist error', e); }
    try { initWatchPlayer(); } catch (e) { console.error('Watch player error', e); }
    try { initTitleSelect(); } catch (e) { console.error('TitleSelect error', e); }
    try { initSearchPage(); } catch (e) { console.error('SearchPage error', e); }
    try { initAnimatedLogoHover(); } catch (e) { console.error('LogoHover error', e); }
    try { initPageTransitions(); } catch (e) { console.error('PageTransitions error', e); }

    // Wire Settings & Notification buttons with document delegation
    document.addEventListener('click', (e) => {
      const settingBtn = e.target.closest('button[aria-label*="Setting"], button[aria-label*="setting"], .settings-btn');
      if (settingBtn) {
        e.preventDefault();
        e.stopPropagation();
        openSettingsModal();
        return;
      }

      const notifBtn = e.target.closest('button[aria-label*="Notification"], button[aria-label*="notification"], .notes-bell');
      if (notifBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleNotifications();
        return;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
