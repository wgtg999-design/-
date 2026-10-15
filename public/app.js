(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const I = window.StoreI18n;
  if (!I) { $('#products').textContent = '화면을 불러오지 못했습니다. 새로고침해 주세요.'; return; }
  const t = (key, values) => I.t(key, values);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => I.formatCurrency(value);
  const preview = window.StorePreviewData || null;
  const imageUrl = value => preview ? preview.assets[value] || '' : value;
  const cartKey = preview ? 'your-label-preview-cart' : 'your-label-cart';
  const wishlistKey = preview ? 'your-label-preview-wishlist' : 'your-label-wishlist';
  const mobile = matchMedia('(max-width: 800px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const campaign = $('.hero'), sidebar = $('#site-sidebar');
  let campaignVisible = true;
  function updateSidebarBackground() { sidebar.classList.toggle('hero-overlay', campaignVisible && !mobile.matches); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { campaignVisible = entries[0].isIntersecting; updateSidebarBackground(); syncHeroTimer(); }, {threshold:0}).observe(campaign);
  }
  let inventory = [], products = [], category = 'ALL', search = '', sort = 'default';
  let cart = [], favorites = new Set(), content = null, view = 'all', currentProduct = null;
  let currentInfo = null, currentSlide = 0, toastTimer;
  let heroTimer = null, heroTransitionTimer = null, heroRequest = 0;
  let heroPaused = false, heroHovered = false, heroFocused = false, heroInitialized = false;
  const heroLoads = new Map(), failedHeroSources = new Set();
  let shopSettings = {accepting:false, shippingFee:0, bankInfo:'', support:'', terms:'', privacy:'', returnGuide:''};

  function stored(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  function label(item, field) { return I.catalogValue(item, field); }
  function toast(message) {
    const element = $('#toast'); element.textContent = message; element.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 2500);
  }
  function stockFor(id, size) { return inventory.find(item => item.sku === id + ':' + encodeURIComponent(size)); }
  function purchaseLimit(id, size) {
    const option = stockFor(id, size);
    return option?.enabled ? Math.max(0, Math.min(option.stock, option.maxOrder, 99)) : 0;
  }
  function photo(product, isDetail = false) {
    // A second photo belongs to this product's saved content. Never infer an
    // outfit from its name, position in the list, or an unrelated lookbook.
    const source = /^\/(assets\/[a-zA-Z0-9._-]+|media\/[a-f0-9-]+\.(png|jpg|webp))$/.test(product.modelImage || '') ? imageUrl(product.modelImage) : '';
    const focus = ['upper','lower'].includes(product.modelFocus) ? product.modelFocus : 'center';
    const model = source ? `<img class="packshot-model-layer" src="${esc(source)}" data-focus="${focus}" alt="" aria-hidden="true" loading="${isDetail ? 'eager' : 'lazy'}" decoding="async">` : '';
    return `<div class="product-photo packshot ${product.image === '/assets/products.png' ? product.crop : 'custom-photo'}" style="background-image:url('${esc(imageUrl(product.image))}')" role="img" aria-label="${esc(label(product, 'name'))}"><span class="packshot-stage" aria-hidden="true"></span>${model}<span class="product-index">${String(products.indexOf(product) + 1).padStart(2, '0')}</span></div>`;
  }
  function bindModelPhotos(root) {
    root.querySelectorAll('.packshot-model-layer').forEach(image => {
      const holder = image.closest('.product-photo');
      const views = image.closest('.detail-gallery')?.querySelector('.detail-photo-views');
      let checking = false;
      const failed = () => {
        holder.classList.remove('has-model', 'is-model-ready', 'show-model'); image.remove();
        if (views) views.hidden = true;
      };
      const ready = async () => {
        if (checking || !image.complete || !image.naturalWidth) return;
        checking = true;
        try {
          if (image.decode) await image.decode();
          if (image.isConnected && image.naturalWidth) {
            holder.classList.add('has-model', 'is-model-ready');
            if (views) views.hidden = false;
          }
        } catch { failed(); }
      };
      image.addEventListener('load', ready, {once:true});
      image.addEventListener('error', failed, {once:true});
      if (image.complete) { if (image.naturalWidth) ready(); else failed(); }
    });
  }
  function favoriteButton(product) {
    const selected = favorites.has(product.id);
    return `<button class="wishlist-toggle" data-wishlist="${esc(product.id)}" aria-pressed="${selected}" aria-label="${esc(t(selected ? 'product.unsaveAria' : 'product.saveAria', {name:label(product,'name')}))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20 3.5 11.6C-1 6.8 5.8 1.1 12 6.6c6.2-5.5 13 0.2 8.5 5L12 20Z"/></svg></button>`;
  }
  function matches(product) {
    const names = [product.name, product.color, ...Object.values(product.translations || {}).flatMap(copy => [copy.name, copy.color])];
    return names.join(' ').normalize('NFKC').toLowerCase().includes(search);
  }
  function render() {
    if (!content) return;
    const list = products.filter(product => (view !== 'best' || product.featured === true)
      && (view !== 'wishlist' || favorites.has(product.id))
      && (category === 'ALL' || product.category === category) && matches(product));
    if (sort !== 'default') list.sort((a, b) => sort === 'low' ? a.price - b.price : b.price - a.price);
    const title = $('.section-title h2'); title.removeAttribute('data-i18n');
    title.textContent = t(view === 'best' ? 'shop.bestTitle' : view === 'wishlist' ? 'shop.wishlistTitle' : 'shop.productTitle');
    $('#products').innerHTML = list.map(product => `<article class="product-card"><button class="product" data-product="${esc(product.id)}" aria-label="${esc(t('shop.detailAria',{name:label(product,'name')}))}">${photo(product)}<div class="product-meta"><div><h3>${esc(label(product,'name'))}</h3><small>${esc(label(product,'color'))}</small>${product.sizes.some(size => purchaseLimit(product.id,size) > 0) ? '' : `<small>${esc(t('product.soldOut'))}</small>`}</div><p>${money(product.price)}</p></div></button>${favoriteButton(product)}<div class="quick-add-placement"><button class="quick-add" type="button" data-quick-add="${esc(product.id)}" aria-label="${esc(t('product.quickAddAria',{name:label(product,'name')}))}">${esc(t('product.quickAdd'))}<span aria-hidden="true">+</span></button></div></article>`).join('');
    bindModelPhotos($('#products'));
    $('#empty').hidden = list.length > 0;
    const message = view === 'best' && !products.some(product => product.featured === true) ? 'shop.bestEmpty'
      : view === 'wishlist' && !favorites.size ? 'shop.wishlistEmpty' : 'shop.noMatches';
    $('#empty').innerHTML = `<p>${esc(t(message))}</p><button id="reset-filters" type="button">${esc(t('shop.showAll'))}</button>`;
    $('#wishlist-count').textContent = I.formatNumber(favorites.size);
    document.querySelectorAll('[data-category]').forEach(button => {
      button.classList.toggle('active', button.dataset.category === category);
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    });
    document.querySelectorAll('#store-nav [data-view]').forEach(link => {
      if (link.dataset.view === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('#wishlist-button').setAttribute('aria-pressed', String(view === 'wishlist'));
    I.apply($('#shop'));
  }
  function toggleFavorite(id) {
    if (!products.some(product => product.id === id)) return;
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    persist(wishlistKey, [...favorites]); render();
    if ($('#product-dialog').open && currentProduct === id) renderProduct(id, $('#size')?.value);
  }
  function detailGallery(product) {
    return `<div class="detail-gallery">${photo(product, true)}<div class="detail-photo-views" role="group" aria-label="${esc(t('product.photoViews'))}" hidden><button type="button" data-photo-view="product" aria-pressed="true">${esc(t('product.packshot'))}</button><button type="button" data-photo-view="model" aria-pressed="false">${esc(t('product.modelPhoto'))}</button></div></div>`;
  }
  function renderProduct(id, selectedSize = '') {
    const product = products.find(item => item.id === id); if (!product) return;
    const description = label(product, 'description'), sizeGuide = label(product, 'sizeGuide');
    const originalNote = I.getLanguage() !== 'ko' && !product.translations?.[I.getLanguage()]?.description;
    $('#product-detail').innerHTML = `<div class="detail-layout">${detailGallery(product)}<div class="detail-copy"><p class="muted">${esc(t('home.collection'))}</p><h2>${esc(label(product,'name'))}</h2><p>${esc(label(product,'color'))}<br>${money(product.price)}</p><p style="white-space:pre-line">${esc(description)}</p>${originalNote ? `<p class="muted">${esc(t('shop.originalText'))}</p>` : ''}<label for="size">${esc(t('product.size'))}</label><select id="size"><option value="">${esc(t('product.chooseSize'))}</option>${product.sizes.map(size => {
      const limit = purchaseLimit(id, size);
      return `<option value="${esc(size)}" ${limit ? '' : 'disabled'} ${size === selectedSize ? 'selected' : ''}>${esc(size)} · ${esc(limit ? t('product.maxQuantity',{count:limit}) : t('product.soldOut'))}</option>`;
    }).join('')}</select><button class="primary" id="add" type="button">${esc(t('product.addToBag'))}</button><p id="size-error" role="alert"></p><button class="size-guide-toggle" id="size-guide" type="button" aria-expanded="false" aria-controls="size-guide-content">${esc(t('product.sizeGuide'))} +</button><div id="size-guide-content" class="size-guide-content" hidden>${sizeGuide ? `<p style="white-space:pre-line">${esc(sizeGuide)}</p>${I.getLanguage() !== 'ko' && !product.translations?.[I.getLanguage()]?.sizeGuide ? `<p class="muted">${esc(t('shop.originalText'))}</p>` : ''}` : `<p>${esc(t('product.sizeGuideEmpty'))}</p><p>${esc(t('product.measureIntro'))}</p><ul><li>${esc(t('product.measureShoulder'))}</li><li>${esc(t('product.measureChest'))}</li><li>${esc(t('product.measureLength'))}</li></ul><p class="muted">${esc(t('product.measureNote'))}</p>`}</div><button class="save-product" type="button" data-wishlist="${esc(id)}" aria-pressed="${favorites.has(id)}">${esc(t(favorites.has(id) ? 'product.unsave' : 'product.save'))}</button><div class="sizes">${esc(t('product.paymentNote'))}</div></div></div>`;
    bindModelPhotos($('#product-detail'));
    $('#size-guide').onclick = () => {
      const expanded = $('#size-guide').getAttribute('aria-expanded') !== 'true';
      $('#size-guide').setAttribute('aria-expanded', String(expanded)); $('#size-guide-content').hidden = !expanded;
    };
    $('#add').onclick = () => {
      const size = $('#size').value;
      if (!size) { $('#size-error').textContent = t('product.selectSizeFirst'); $('#size').focus(); return; }
      const limit = purchaseLimit(id, size), row = cart.find(item => item.id === id && item.size === size);
      if (!limit) { $('#size-error').textContent = t('product.unavailable'); return; }
      if ((row?.qty || 0) + 1 > limit) { $('#size-error').textContent = t('product.quantityLimit'); return; }
      if (row) row.qty++; else cart.push({id,size,qty:1});
      saveCart(); $('#product-dialog').close(); $('#bag-dialog').showModal();
    };
  }
  function openProduct(id) { currentProduct = id; renderProduct(id); $('#product-dialog').showModal(); }
  function saveCart() { persist(cartKey, cart); renderCart(); }
  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    $('#bag-count').textContent = I.formatNumber(count);
    document.querySelectorAll('[data-cart-count]').forEach(element => element.textContent = I.formatNumber(count));
    $('#cart-title-count').textContent = `(${I.formatNumber(count)})`;
    $('#cart-items').innerHTML = cart.length ? cart.map((item, index) => {
      const product = products.find(value => value.id === item.id);
      return `<div class="cart-row"><h3>${esc(label(product,'name'))}</h3><p class="muted">${esc(label(product,'color'))} / ${esc(item.size)} — ${money(product.price * item.qty)}</p><div class="cart-actions"><button data-qty="${index}" data-change="-1" aria-label="${esc(t('cart.decrease'))}">−</button><span>${I.formatNumber(item.qty)}</span><button data-qty="${index}" data-change="1" aria-label="${esc(t('cart.increase'))}">+</button><button class="remove" data-remove="${index}">${esc(t('cart.remove'))}</button></div></div>`;
    }).join('') : `<p class="muted cart-empty">${esc(t('cart.empty'))}</p>`;
    $('#cart-total').textContent = money(cart.reduce((sum, item) => sum + products.find(product => product.id === item.id).price * item.qty, 0));
    I.apply($('#bag-dialog'));
  }
  function renderCommunity() {
    if (!content) return;
    const faq = ['payment','shipping','cancel','return','account'];
    $('#community-content').innerHTML = `<article><h3>${esc(t('community.noticeTitle'))}</h3><p>${esc(label(content,'notice'))}</p></article><article><h3>${esc(t('community.faqTitle'))}</h3>${faq.map(key => `<details><summary>${esc(t(`community.${key}Question`))}</summary><p>${esc(t(`community.${key}Answer`))}</p></details>`).join('')}</article><article><h3>${esc(t('community.supportTitle'))}</h3><p>${esc(shopSettings.support || t('community.supportPending'))}</p>${shopSettings.returnGuide ? `<details><summary>${esc(t('community.returnGuideTitle'))}</summary><p class="muted">${esc(t('community.policyOriginal'))}</p><p style="white-space:pre-line">${esc(shopSettings.returnGuide)}</p></details>` : ''}</article>`;
  }
  function showInfo(kind) {
    currentInfo = kind; let title, body;
    if (kind === 'preview') { title = t('preview.title'); body = `<p>${esc(t('preview.message'))}</p><p>${esc(t('preview.disclaimer'))}</p>`; }
    else if (kind === 'lookbook') { title = content?.brand || ''; body = content ? `<img src="${esc(imageUrl(content.journalImage))}" alt="${esc(t('home.journal'))}">` : ''; }
    else if (kind === 'instagram' || kind === 'kakao') { title = t('social.pendingTitle'); body = `<p>${esc(t('social.pendingMessage'))}</p>`; }
    else if (kind === 'guide') { title = t('guide.title'); body = `<p>${esc(t('guide.message'))}</p>`; }
    else { title = t('guide.contact'); body = `<p>${esc(shopSettings.support || t('guide.contactPending'))}</p>`; }
    $('#info-content').innerHTML = `<h2>${esc(title)}</h2>${body}`; closeMenu(false);
    if (!$('#info-dialog').open) $('#info-dialog').showModal();
  }
  function safeSocialUrl(kind) {
    if (preview) return null;
    const hosts = kind === 'instagram' ? ['instagram.com','www.instagram.com'] : ['pf.kakao.com','open.kakao.com','kakao.com','www.kakao.com'];
    try {
      const url = new URL(content?.socialLinks?.[kind] || '');
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.includes(url.hostname) ? url.href : null;
    } catch { return null; }
  }
  function renderSocialLinks() {
    for (const kind of ['instagram','kakao']) {
      const current = document.querySelector(`[data-info="${kind}"]`);
      if (!current) continue;
      const url = safeSocialUrl(kind);
      if (!url) continue;
      let link = current;
      if (current.tagName !== 'A') {
        link = document.createElement('a');
        for (const attribute of current.attributes) if (attribute.name !== 'type') link.setAttribute(attribute.name,attribute.value);
        link.innerHTML = current.innerHTML;
        current.replaceWith(link);
      }
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
  }
  function changeView(next) {
    view = next; category = 'ALL'; search = ''; sort = 'default';
    $('#search').value = ''; $('#sort').value = 'default'; render(); closeMenu(false); $('#shop').scrollIntoView();
  }
  function closeMenu(restore = true) {
    $('#site-sidebar').classList.remove('open'); document.body.classList.remove('menu-is-open');
    $('#menu-backdrop').hidden = true; $('.mobile-menu').setAttribute('aria-expanded','false');
    $('#site-sidebar').inert = mobile.matches;
    if (mobile.matches) $('#site-sidebar').setAttribute('aria-hidden','true'); else $('#site-sidebar').removeAttribute('aria-hidden');
    if (restore && mobile.matches) $('.mobile-menu').focus();
  }
  function openMenu() {
    $('#site-sidebar').inert = false; $('#site-sidebar').removeAttribute('aria-hidden');
    $('#site-sidebar').classList.add('open'); document.body.classList.add('menu-is-open');
    $('#menu-backdrop').hidden = false; $('.mobile-menu').setAttribute('aria-expanded','true'); $('#menu-close').focus();
  }
  function applyBrand() {
    if (!content) return;
    document.querySelectorAll('.logo,.mobile-logo,.footer-logo,.about>p:first-child').forEach(element => element.textContent = content.brand);
    $('.store-main h1').textContent = content.brand + ' — ' + t('home.collection');
    const disclaimer = $('[data-store-disclaimer]');
    disclaimer.removeAttribute('data-i18n'); disclaimer.textContent = t('home.demoNotice',{brand:content.brand});
    const notice = $('.notice');
    if (notice) notice.textContent = label(content,'notice');
    renderSocialLinks();
    const aboutTitle = $('.about h2'), aboutText = $('.about>p:last-child');
    const defaultTitle = '남들과 다른 결. 방향은 분명하게.', defaultText = '일상의 실루엣을 다시 바라보는 독립 스트릿웨어.';
    aboutTitle.removeAttribute('data-i18n'); aboutText.removeAttribute('data-i18n');
    aboutTitle.textContent = !content.translations?.[I.getLanguage()]?.aboutTitle && content.aboutTitle === defaultTitle ? t('home.aboutTagline') : label(content,'aboutTitle');
    aboutText.textContent = !content.translations?.[I.getLanguage()]?.aboutText && content.aboutText === defaultText ? t('home.aboutDescription') : label(content,'aboutText');
    document.title = content.brand + ' — ' + t('home.collection');
  }
  function updateHeroControls() {
    const images = content?.heroImages || [], pagination = $('.hero-pagination');
    if (pagination.children.length !== images.length) {
      pagination.innerHTML = images.map((_, index) => `<button type="button" data-slide="${index}"></button>`).join('');
    }
    pagination.querySelectorAll('[data-slide]').forEach((button, index) => {
      button.classList.toggle('selected', index === currentSlide);
      button.setAttribute('aria-pressed', String(index === currentSlide));
      button.setAttribute('aria-label', t('home.photoSelect') + ' ' + I.formatNumber(index + 1));
    });
    const button = $('#hero-toggle'), paused = heroPaused || reducedMotion.matches;
    const key = paused ? 'home.playSlideshow' : 'home.pauseSlideshow';
    button.hidden = images.length < 2;
    button.disabled = reducedMotion.matches;
    button.dataset.i18nAriaLabel = key;
    button.setAttribute('aria-label', t(key)); button.title = t(key);
    button.setAttribute('aria-pressed', String(paused));
    button.querySelector('span').textContent = paused ? '▶' : 'Ⅱ';
  }
  function cancelHeroTransition() {
    heroRequest++; clearTimeout(heroTransitionTimer); heroTransitionTimer = null;
    const overlay = $('#hero-photo-next');
    overlay.hidden = true; overlay.classList.remove('is-entering');
  }
  function loadHeroImage(source) {
    if (!source) return Promise.reject(Error('No banner image.'));
    if (heroLoads.has(source)) return heroLoads.get(source);
    const pending = new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => { image.onload = image.onerror = null; reject(Error('Banner image unavailable.')); }, 15000);
      image.onload = async () => {
        try {
          if (image.decode) await image.decode();
          if (!image.naturalWidth) throw Error();
          resolve(source);
        } catch { reject(Error('Banner image unavailable.')); }
        finally { clearTimeout(timer); }
      };
      image.onerror = () => { clearTimeout(timer); reject(Error('Banner image unavailable.')); };
      image.src = source;
    });
    heroLoads.set(source, pending);
    pending.catch(() => { if (heroLoads.get(source) === pending) heroLoads.delete(source); });
    return pending;
  }
  function nextHeroSlide() {
    const images = content?.heroImages || [];
    for (let step = 1; step < images.length; step++) {
      const index = (currentSlide + step) % images.length;
      if (!failedHeroSources.has(imageUrl(images[index]))) return index;
    }
    return currentSlide;
  }
  function preloadNextHero() {
    const next = nextHeroSlide();
    if (next === currentSlide) return;
    const source = imageUrl(content.heroImages[next]);
    loadHeroImage(source).catch(() => { failedHeroSources.add(source); preloadNextHero(); syncHeroTimer(); });
  }
  function canRotateHero() {
    return heroInitialized && content?.heroImages.length > 1 && !heroPaused && !heroHovered && !heroFocused
      && !document.hidden && campaignVisible && !reducedMotion.matches;
  }
  function syncHeroTimer() {
    clearInterval(heroTimer); heroTimer = null;
    if (!canRotateHero() || nextHeroSlide() === currentSlide) return;
    heroTimer = setInterval(() => {
      if (!canRotateHero()) return;
      const index = nextHeroSlide();
      if (index === currentSlide) { clearInterval(heroTimer); heroTimer = null; return; }
      changeHeroSlide(index);
    }, 5000);
  }
  async function changeHeroSlide(index) {
    if (!content || !Number.isInteger(index) || index < 0 || index >= content.heroImages.length) return;
    cancelHeroTransition();
    if (index === currentSlide) return;
    const request = heroRequest, source = imageUrl(content.heroImages[index]);
    const image = $('#hero-photo'), overlay = $('#hero-photo-next');
    try {
      await loadHeroImage(source);
      if (request !== heroRequest) return;
      if (reducedMotion.matches) {
        image.src = source; currentSlide = index; updateHeroControls(); preloadNextHero(); return;
      }
      overlay.src = source;
      if (overlay.decode) await overlay.decode();
      if (request !== heroRequest) return;
      overlay.hidden = false;
      // Commit the initial opacity before adding the incoming-image state.
      void overlay.offsetWidth;
      overlay.classList.add('is-entering');
      heroTransitionTimer = setTimeout(() => {
        if (request !== heroRequest) return;
        image.src = source; currentSlide = index; updateHeroControls(); preloadNextHero();
        overlay.hidden = true; overlay.classList.remove('is-entering'); heroTransitionTimer = null;
      }, 400);
    } catch {
      if (request === heroRequest) {
        failedHeroSources.add(source); cancelHeroTransition(); syncHeroTimer();
      }
    }
  }
  function renderSlides() {
    if (!content?.heroImages.length) return;
    if (!heroInitialized) {
      const source = imageUrl(content.heroImages[currentSlide]);
      $('#hero-photo').src = source; $('#hero-photo-next').src = source; heroInitialized = true;
    }
    $('#hero-photo').alt = content.brand + ' — ' + t('home.collection');
    $('.editorial-photo img').src = imageUrl(content.journalImage);
    updateHeroControls();
    preloadNextHero();
  }
  async function init() {
    try {
      if (preview) { content = preview.content; inventory = []; }
      else {
        const response = await fetch('/api/content',{cache:'no-store'}); if (!response.ok) throw Error();
        content = (await response.json()).content;
        await Promise.all([
          fetch('/api/shop?view=stock',{cache:'no-store'}).then(async response => { if (response.ok) inventory = (await response.json()).inventory || []; }).catch(() => {}),
          fetch('/api/shop?view=settings',{cache:'no-store'}).then(async response => { if (response.ok) shopSettings = (await response.json()).settings; }).catch(() => {}),
          fetch('/api/session',{cache:'no-store'}).then(async response => { if (response.ok && (await response.json()).isAdmin) { $('#admin-entry').hidden = false; $('.admin-footer').hidden = false; } }).catch(() => {})
        ]);
      }
      products = content.products.filter(product => product.visible !== false);
      const savedCart = stored(cartKey), savedFavorites = stored(wishlistKey);
      cart = Array.isArray(savedCart) ? savedCart.filter(item => item && products.some(product => product.id === item.id && product.sizes.includes(item.size)) && Number.isInteger(item.qty) && item.qty > 0 && item.qty <= 99) : [];
      favorites = new Set(Array.isArray(savedFavorites) ? savedFavorites.filter(id => products.some(product => product.id === id)) : []);
      cancelHeroTransition(); currentSlide = 0; heroInitialized = false; failedHeroSources.clear();
      persist(wishlistKey,[...favorites]); applyBrand(); renderSlides(); syncHeroTimer(); render(); renderCart(); renderCommunity();
    } catch { $('#products').innerHTML = `<p class="muted">${esc(t('product.loadingError'))}</p><button id="retry-products" type="button">${esc(t('common.retry'))}</button>`; }
  }

  document.addEventListener('click', event => {
    const service = event.target.closest('[data-preview-service]');
    if (service && preview) { event.preventDefault(); showInfo('preview'); return; }
    const favorite = event.target.closest('[data-wishlist]'); if (favorite) { toggleFavorite(favorite.dataset.wishlist); return; }
    const photoView = event.target.closest('[data-photo-view]');
    if (photoView) {
      const gallery = photoView.closest('.detail-gallery'), holder = gallery.querySelector('.product-photo');
      if (!holder.classList.contains('is-model-ready')) return;
      const model = photoView.dataset.photoView === 'model';
      holder.classList.toggle('show-model', model);
      gallery.querySelectorAll('[data-photo-view]').forEach(button => button.setAttribute('aria-pressed', String(button === photoView)));
      const product = products.find(item => item.id === currentProduct);
      holder.setAttribute('aria-label', label(product,'name') + ' — ' + t(model ? 'product.modelPhoto' : 'product.packshot'));
      return;
    }
    const quickAdd = event.target.closest('[data-quick-add]');
    if (quickAdd) { openProduct(quickAdd.dataset.quickAdd); $('#size').focus(); return; }
    const product = event.target.closest('[data-product]'); if (product) { openProduct(product.dataset.product); return; }
    const slide = event.target.closest('[data-slide]'); if (slide && content) { changeHeroSlide(Number(slide.dataset.slide)); syncHeroTimer(); return; }
    const language = event.target.closest('[data-set-language]'); if (language) { I.setLanguage(language.dataset.setLanguage); $('#language-dialog').close(); return; }
    const filter = event.target.closest('[data-category]'); if (filter) { category = filter.dataset.category; render(); return; }
    const navigation = event.target.closest('#store-nav a');
    if (navigation) { if (navigation.dataset.view) { event.preventDefault(); changeView(navigation.dataset.view); } else closeMenu(false); return; }
    const remove = event.target.closest('[data-remove]'); if (remove) { cart.splice(Number(remove.dataset.remove),1); saveCart(); return; }
    const quantity = event.target.closest('[data-qty]');
    if (quantity) {
      const index = Number(quantity.dataset.qty), row = cart[index]; if (!row) return;
      const next = row.qty + Number(quantity.dataset.change);
      if (next < 1) cart.splice(index,1); else if (next > purchaseLimit(row.id,row.size)) { toast(t('cart.maxQuantity')); return; } else row.qty = next;
      saveCart(); return;
    }
    const info = event.target.closest('[data-info]');
    if (info) {
      event.preventDefault(); const url = ['instagram','kakao'].includes(info.dataset.info) ? safeSocialUrl(info.dataset.info) : null;
      if (url) window.open(url,'_blank','noopener,noreferrer'); else showInfo(info.dataset.info); return;
    }
    if (event.target.closest('#reset-filters')) changeView('all');
    if (event.target.closest('#retry-products')) init();
  });
  $('#sort').onchange = event => { sort = event.target.value; render(); };
  $('#search').oninput = event => { search = event.target.value.trim().normalize('NFKC').toLowerCase(); render(); };
  $('#clear-search').onclick = () => { $('#search').value = ''; search = ''; render(); $('#search').focus(); };
  $('#search-button').onclick = () => { closeMenu(false); $('#search-area').hidden = false; $('#shop').scrollIntoView(); $('#search').focus({preventScroll:true}); };
  $('#wishlist-button').onclick = () => changeView('wishlist');
  $('#bag-button').onclick = () => { closeMenu(false); $('#bag-dialog').showModal(); };
  $('#mobile-bag-button')?.addEventListener('click', () => $('#bag-dialog').showModal());
  $('#continue').onclick = () => $('#bag-dialog').close();
  $('#lookbook-button').onclick = () => showInfo('lookbook');
  $('#language-button').onclick = () => { closeMenu(false); $('#language-dialog').showModal(); };
  $('#hero-toggle').onclick = () => { heroPaused = !heroPaused; updateHeroControls(); syncHeroTimer(); };
  campaign.addEventListener('mouseenter', () => { if (finePointer.matches) { heroHovered = true; syncHeroTimer(); } });
  campaign.addEventListener('mouseleave', () => { heroHovered = false; syncHeroTimer(); });
  campaign.addEventListener('focusin', event => { heroFocused = event.target.matches(':focus-visible'); syncHeroTimer(); });
  campaign.addEventListener('focusout', event => { heroFocused = !!event.relatedTarget && campaign.contains(event.relatedTarget) && event.relatedTarget.matches(':focus-visible'); syncHeroTimer(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHeroTransition(); syncHeroTimer(); });
  reducedMotion.addEventListener('change', () => { cancelHeroTransition(); updateHeroControls(); syncHeroTimer(); });
  window.addEventListener('pagehide', () => { clearInterval(heroTimer); cancelHeroTransition(); });
  window.addEventListener('pageshow', syncHeroTimer);
  $('.mobile-menu').onclick = () => $('#site-sidebar').classList.contains('open') ? closeMenu() : openMenu();
  $('#menu-close').onclick = () => closeMenu(); $('#menu-backdrop').onclick = () => closeMenu();
  mobile.addEventListener('change', () => { closeMenu(false); updateSidebarBackground(); });
  document.addEventListener('keydown', event => {
    if (!mobile.matches || !$('#site-sidebar').classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    if (event.key === 'Tab') {
      const focusable = [...$('#site-sidebar').querySelectorAll('a,button,input,select,[tabindex]')].filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.querySelectorAll('dialog .close').forEach(button => button.onclick = () => button.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return; const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (dialog.id === 'product-dialog') currentProduct = null;
      if (dialog.id === 'info-dialog') currentInfo = null;
      if (dialog.id === 'language-dialog' && mobile.matches) $('.mobile-menu').focus();
    });
  });
  window.addEventListener('street-label:languagechange', () => {
    I.apply(); if (!content) return; const selectedSize = $('#size')?.value;
    applyBrand(); renderSlides(); render(); renderCart(); renderCommunity();
    if ($('#product-dialog').open && currentProduct) renderProduct(currentProduct,selectedSize);
    if ($('#info-dialog').open && currentInfo) showInfo(currentInfo);
  });
  async function loadPolicyLinks() {
    if (preview) return;
    try {
      const response = await fetch('/api/policies', {cache:'no-store'});
      if (!response.ok) return;
      const policy = await response.json();
      if (policy.terms !== '/policies/terms' || policy.privacy !== '/policies/privacy') return;
      $('#footer-policy-links').hidden = false;
      if (policy.testOnly && policy.business) {
        const business = policy.business, info = $('#test-business');
        info.textContent = `TEST STORE · ${business.shopName} · ${business.operator} / ${business.representative}\n${business.registrationNumber} · ${business.commerceRegistrationNumber} · ${business.address}\n${business.contact} · ${business.email} · ${business.effectiveDate}`;
        info.hidden = false;
      }
    } catch { /* Optional document links never replace customer or admin authentication. */ }
  }
  I.apply(); closeMenu(false); updateSidebarBackground(); init(); loadPolicyLinks();
})();
