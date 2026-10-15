(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const I = window.StoreI18n;
  if (!I) { $('#products').textContent = '화면을 불러오지 못했습니다. 새로고침해 주세요.'; return; }
  const t = (key, values) => I.t(key, values);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => I.formatCurrency(value);
  const preview = window.StorePreviewData || null;
  const media=window.StoreImages||{src:value=>value,srcset:()=>''};
  const optimized=(value,width=960)=>media.src(value,width);
  const imageSet=value=>media.srcset(value);
  const imageUrl = value => preview ? preview.assets[value] || value : value;
  const cartKey = preview ? 'your-label-preview-cart' : 'your-label-cart';
  const wishlistKey = preview ? 'your-label-preview-wishlist' : 'your-label-wishlist';
  const mobile = matchMedia('(max-width: 800px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const pageMode=document.body.dataset.page || 'home';
  const routeProduct=document.body.dataset.productId || '';
  const categories=['ALL','OUTER','BOTTOMS','TOPS','ACC','KNITWEAR','HOODIES','TSHIRT','SKIRTS'];
  const campaign = $('.hero'), sidebar = $('#site-sidebar');
  let campaignVisible = true, sidebarFrame = 0;
  function updateSidebarBackground() {
    const rect = campaign.getBoundingClientRect(), desktop = !mobile.matches;
    const progress = desktop && pageMode !== 'home' ? 1 : desktop ? Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height * .72))) : 0;
    const open = sidebar.classList.contains('open');
    // Keep an actively used keyboard menu visible until focus leaves it.
    const pinned = desktop && !open && sidebar.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
    const dissolved = desktop && progress >= 1 && !pinned && !open;
    const opacity = reducedMotion.matches ? (progress >= 1 ? 0 : 1) : 1 - progress * progress * (3 - 2 * progress);
    document.body.classList.add('scroll-focus-ready');
    const catalogFocus = desktop && progress >= 1;
    document.body.classList.toggle('catalog-focus', catalogFocus);
    document.body.classList.toggle('desktop-menu-open', desktop && open);
    sidebar.style.setProperty('--sidebar-opacity', String(opacity));
    sidebar.style.setProperty('--sidebar-blur', `${reducedMotion.matches ? 0 : 6 * progress}px`);
    sidebar.classList.toggle('is-dissolved', dissolved);
    sidebar.classList.toggle('is-keyboard-active', pinned && progress > 0);
    sidebar.classList.toggle('hero-overlay', desktop && campaignVisible && !open && !pinned);
    sidebar.inert = !open && (mobile.matches || dissolved);
    if (sidebar.inert) sidebar.setAttribute('aria-hidden','true'); else sidebar.removeAttribute('aria-hidden');
    // The compact bar leaves the screen at the banner. Carry its focus to an
    // equivalent visible control instead of leaving it in a hidden header.
    if (desktop && !catalogFocus && !open && $('.mobile-bar').contains(document.activeElement)) {
      (document.activeElement.id === 'mobile-bag-button' ? $('#bag-button') : sidebar.querySelector('.logo')).focus({preventScroll:true});
    }
  }
  function scheduleSidebar() {
    if (!sidebarFrame) sidebarFrame = requestAnimationFrame(() => { sidebarFrame = 0; updateSidebarBackground(); });
  }
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
    const sizes=isDetail?'(max-width:800px) 100vw, 50vw':pageMode==='shop'?'(max-width:800px) 50vw, 25vw':'(max-width:800px) 50vw, 33.333vw';
    const model = source ? `<img class="packshot-model-layer" data-model-source="${esc(imageUrl(optimized(product.modelImage,isDetail?1600:960)))}" data-model-set="${esc(imageSet(product.modelImage))}" sizes="${sizes}" ${isDetail?'data-eager-model="true"':''} data-focus="${focus}" alt="" aria-hidden="true" decoding="async">` : '';
    const base=product.image==='/assets/products.png'?`style="background-image:url('${esc(imageUrl(optimized(product.image,1600)))}')"`:'style="background-image:none"';
    const original=product.image!=='/assets/products.png'?`<img class="product-original-layer" src="${esc(imageUrl(optimized(product.image,isDetail?1600:960)))}" srcset="${esc(imageSet(product.image))}" sizes="${sizes}" alt="" loading="${isDetail?'eager':'lazy'}" decoding="async">`:'';
    return `<div class="product-photo packshot ${product.image === '/assets/products.png' ? product.crop : 'custom-photo'}" ${base} role="img" aria-label="${esc(label(product,'name'))}"><span class="packshot-stage" aria-hidden="true"></span>${original}${model}<span class="product-index">${String(products.indexOf(product) + 1).padStart(2, '0')}</span></div>`;
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
      let requested=false;
      const request=()=>{if(requested||!image.dataset.modelSource)return;requested=true;if(image.dataset.modelSet)image.srcset=image.dataset.modelSet;image.src=image.dataset.modelSource;};
      const card=image.closest('.product-card')||holder;
      card.addEventListener('pointerenter',request,{once:true});card.addEventListener('focusin',request,{once:true});card.addEventListener('touchstart',request,{once:true,passive:true});
      if(image.dataset.eagerModel)request();
      image.addEventListener('load', ready, {once:true});
      image.addEventListener('error', failed, {once:true});
      if (image.getAttribute('src')&&image.complete) { if (image.naturalWidth) ready(); else failed(); }
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
    const settings = content.homepage;
    const card = product => `<article class="product-card"><a class="product" href="/products/${encodeURIComponent(product.id)}" aria-label="${esc(label(product,'name'))}">${photo(product)}</a><div class="quick-panel"><h3>${esc(label(product,'name'))}</h3><p>${money(product.price)}</p><button type="button" data-product="${esc(product.id)}">QUICK ADD +</button></div>${pageMode==='shop'?favoriteButton(product):''}</article>`;
    const choose = ids => ids === undefined ? list.slice(0,10) : ids.map(id=>list.find(p=>p.id===id)).filter(Boolean).slice(0,10);
    const displayed = pageMode === 'home' ? choose(settings?.slider01) : list;
    $('#products').innerHTML = displayed.map(card).join('');
    bindModelPhotos($('#products'));
    $('#empty').hidden = displayed.length > 0;
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
    else if(pageMode==='product'&&routeProduct===id)renderProduct(id,$('#size')?.value,true);
  }
  function detailGallery(product) {
    return `<div class="detail-gallery">${photo(product, true)}<div class="detail-photo-views" role="group" aria-label="${esc(t('product.photoViews'))}" hidden><button type="button" data-photo-view="product" aria-pressed="true">${esc(t('product.packshot'))}</button><button type="button" data-photo-view="model" aria-pressed="false">${esc(t('product.modelPhoto'))}</button></div></div>`;
  }
  function renderProduct(id, selectedSize = '', inline = false) {
    const product = products.find(item => item.id === id); if (!product) return;
    const description = label(product, 'description'), sizeGuide = label(product, 'sizeGuide');
    const originalNote = I.getLanguage() !== 'ko' && !product.translations?.[I.getLanguage()]?.description;
    const target=inline ? $('#detail-page-content') : $('#product-detail');
    target.innerHTML = `<div class="detail-layout">${detailGallery(product)}<div class="detail-copy"><p class="muted">${esc(t('home.collection'))}</p><h2>${esc(label(product,'name'))}</h2><p>${esc(label(product,'color'))}<br>${money(product.price)}</p><p style="white-space:pre-line">${esc(description)}</p>${originalNote ? `<p class="muted">${esc(t('shop.originalText'))}</p>` : ''}<label for="size">${esc(t('product.size'))}</label><select id="size"><option value="">${esc(t('product.chooseSize'))}</option>${product.sizes.map(size => {
      const limit = purchaseLimit(id, size);
      return `<option value="${esc(size)}" ${limit ? '' : 'disabled'} ${size === selectedSize ? 'selected' : ''}>${esc(size)} · ${esc(limit ? t('product.maxQuantity',{count:limit}) : t('product.soldOut'))}</option>`;
    }).join('')}</select><label for="product-quantity">${esc(t('cart.quantity'))}</label><input id="product-quantity" type="number" min="1" max="99" step="1" value="1"><button class="primary" id="add" type="button">${esc(t('product.addToBag'))}</button><p id="size-error" role="alert"></p><button class="size-guide-toggle" id="size-guide" type="button" aria-expanded="false" aria-controls="size-guide-content">${esc(t('product.sizeGuide'))} +</button><div id="size-guide-content" class="size-guide-content" hidden>${sizeGuide ? `<p style="white-space:pre-line">${esc(sizeGuide)}</p>${I.getLanguage() !== 'ko' && !product.translations?.[I.getLanguage()]?.sizeGuide ? `<p class="muted">${esc(t('shop.originalText'))}</p>` : ''}` : `<p>${esc(t('product.sizeGuideEmpty'))}</p><p>${esc(t('product.measureIntro'))}</p><ul><li>${esc(t('product.measureShoulder'))}</li><li>${esc(t('product.measureChest'))}</li><li>${esc(t('product.measureLength'))}</li></ul><p class="muted">${esc(t('product.measureNote'))}</p>`}</div><button class="save-product" type="button" data-wishlist="${esc(id)}" aria-pressed="${favorites.has(id)}">${esc(t(favorites.has(id) ? 'product.unsave' : 'product.save'))}</button><div class="sizes">${esc(t('product.paymentNote'))}</div></div></div>`;
    bindModelPhotos(target);
    $('#size-guide').onclick = () => {
      const expanded = $('#size-guide').getAttribute('aria-expanded') !== 'true';
      $('#size-guide').setAttribute('aria-expanded', String(expanded)); $('#size-guide-content').hidden = !expanded;
    };
    const purchasable=product.sizes.some(size=>purchaseLimit(id,size)>0);
    $('#add').disabled=!purchasable;
    if(!product.sizes.length) $('#size-error').textContent=t('product.variantsPending');
    if(shopSettings.returnGuide||shopSettings.support)target.querySelector('.detail-copy').insertAdjacentHTML('beforeend',`<p class="configured-shipping">${esc(shopSettings.returnGuide||shopSettings.support)}</p>`);
    $('#add').onclick = () => {
      const size = $('#size').value;
      if (!size) { $('#size-error').textContent = t('product.selectSizeFirst'); $('#size').focus(); return; }
      const limit = purchaseLimit(id, size), row = cart.find(item => item.id === id && item.size === size);
      if (!limit) { $('#size-error').textContent = t('product.unavailable'); return; }
      const qty=Number($('#product-quantity').value);
      if (!Number.isInteger(qty)||qty<1) {$('#size-error').textContent=t('product.quantityLimit');return;}
      if ((row?.qty || 0) + qty > limit) { $('#size-error').textContent = t('product.quantityLimit'); return; }
      if (row) row.qty+=qty; else cart.push({id,size,qty});
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
    if(pageMode!=='shop'){location.href='/shop?view='+encodeURIComponent(next);return;}
    view = next; category = 'ALL'; search = ''; sort = 'default';
    $('#search').value = ''; $('#sort').value = 'default'; render(); closeMenu(false);
    $('#shop').focus({preventScroll:true}); $('#shop').scrollIntoView();
  }
  function closeMenu(restore = true) {
    const wasOpen = sidebar.classList.contains('open');
    $('#site-sidebar').classList.remove('open'); document.body.classList.remove('menu-is-open');
    $('#menu-backdrop').hidden = true; $('.mobile-menu').setAttribute('aria-expanded','false');
    if (wasOpen && (mobile.matches || document.body.classList.contains('catalog-focus'))) $('.mobile-menu').focus({preventScroll:true});
    else if (restore && mobile.matches) $('.mobile-menu').focus({preventScroll:true});
    updateSidebarBackground();
  }
  function openMenu() {
    $('#site-sidebar').inert = false; $('#site-sidebar').removeAttribute('aria-hidden');
    $('#site-sidebar').classList.add('open'); document.body.classList.add('menu-is-open');
    $('#menu-backdrop').hidden = false; $('.mobile-menu').setAttribute('aria-expanded','true');
    updateSidebarBackground(); $('#menu-close').focus();
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
      if (!failedHeroSources.has(heroSource(index))) return index;
    }
    return currentSlide;
  }
  function preloadNextHero() {
    const next = nextHeroSlide();
    if (next === currentSlide) return;
    const source = heroSource(next);
    loadHeroImage(source).catch(() => { failedHeroSources.add(source); preloadNextHero(); syncHeroTimer(); });
  }
  function canRotateHero() {
    return heroInitialized && content?.heroImages.length > 1 && !heroPaused && !heroHovered && !heroFocused
      && pageMode==='home' && !document.hidden && campaignVisible && !reducedMotion.matches;
  }
  function syncHeroTimer() {
    clearInterval(heroTimer); heroTimer = null;
    if (!canRotateHero() || nextHeroSlide() === currentSlide) return;
    heroTimer = setInterval(() => {
      if (!canRotateHero()) return;
      const index = nextHeroSlide();
      if (index === currentSlide) { clearInterval(heroTimer); heroTimer = null; return; }
      changeHeroSlide(index);
    }, 4000);
  }
  async function changeHeroSlide(index) {
    if (!content || !Number.isInteger(index) || index < 0 || index >= content.heroImages.length) return;
    cancelHeroTransition();
    if (index === currentSlide) return;
    const request = heroRequest, source = heroSource(index);
    const image = $('#hero-photo'), overlay = $('#hero-photo-next');
    try {
      await loadHeroImage(source);
      if (request !== heroRequest) return;
      if (reducedMotion.matches) {
        image.src = source; currentSlide = index; updateHeroLink(); updateHeroControls(); preloadNextHero(); return;
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
        image.src = source; currentSlide = index; updateHeroLink(); updateHeroControls(); preloadNextHero();
        overlay.hidden = true; overlay.classList.remove('is-entering'); heroTransitionTimer = null;
      }, 400);
    } catch {
      if (request === heroRequest) {
        failedHeroSources.add(source); cancelHeroTransition(); syncHeroTimer();
      }
    }
  }
  function adaptImageText(image,root,tone,property,region=[0,0,1,1]) {
    root.classList.remove('contrast-fallback');
    if(tone==='light'||tone==='dark'){root.style.setProperty(property,tone==='light'?'#fff':'#111');return;}
    try {
      const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      const rect=image.getBoundingClientRect(),ratio=rect.width/Math.max(rect.height,1),natural=image.naturalWidth/image.naturalHeight;
      let sx=0,sy=0,sw=image.naturalWidth,sh=image.naturalHeight;
      if(getComputedStyle(image).objectFit==='cover'){if(natural>ratio){sw=sh*ratio;sx=(image.naturalWidth-sw)/2;}else{sh=sw/ratio;sy=(image.naturalHeight-sh)/2;}}
      context.drawImage(image,sx,sy,sw,sh,0,0,80,80);
      const [x,y,right,bottom]=region,pixels=context.getImageData(Math.floor(x*80),Math.floor(y*80),Math.max(1,Math.floor((right-x)*80)),Math.max(1,Math.floor((bottom-y)*80))).data;
      let luminance=0;for(let i=0;i<pixels.length;i+=4){const channel=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);luminance+=.2126*channel(pixels[i]/255)+.7152*channel(pixels[i+1]/255)+.0722*channel(pixels[i+2]/255);}
      const light=luminance/(pixels.length/4)<.179;
      root.style.setProperty(property,light?'#fff':'#111');root.style.setProperty('--adaptive-shadow',light?'#0009':'#fff9');
    } catch {root.style.setProperty(property,'#fff');root.classList.add('contrast-fallback');}
  }
  function updateHeroInk(){
    const image=$('#hero-photo');if(!image.naturalWidth)return;
    const tone=content?.homepage?.heroTextTone||'auto';
    adaptImageText(image,sidebar,tone,'--hero-ink',[0,0,.3,1]);
    adaptImageText(image,campaign,tone,'--hero-ink',[0,.7,1,1]);
  }
  $('#hero-photo').addEventListener('load',updateHeroInk);
  window.addEventListener('resize',()=>{updateHeroInk();document.querySelectorAll('#journal-categories a').forEach(link=>{const image=link.querySelector('img');if(image?.naturalWidth)adaptImageText(image,link,link.dataset.textTone,'--journal-ink',[.4,.65,1,1]);});},{passive:true});
  function heroSource(index) { return imageUrl(optimized((mobile.matches && content.homepage?.banners[index]?.mobileImage) || content.heroImages[index],Math.ceil(innerWidth*devicePixelRatio))); }
  function updateHeroLink() {
    $('#hero-link').href = '/shop';
  }
  function renderHomepageMedia() {
    updateHeroLink();
    const campaignSettings = window.StoreCampaign.settings(content.homepage?.campaign);
    const section = $('#editorial-campaign');
    section.hidden = campaignSettings.enabled===false || !campaignSettings.image;
    if (campaignSettings?.image) {
      section.querySelector('img').src = imageUrl(optimized(campaignSettings.image,1600));section.querySelector('img').srcset=imageSet(campaignSettings.image);section.querySelector('img').sizes='100vw';
      section.querySelector('source').srcset=imageSet(campaignSettings.mobileImage||campaignSettings.image)||imageUrl(optimized(campaignSettings.mobileImage||campaignSettings.image,960));section.querySelector('source').sizes='100vw';
    }
    const journals = window.StoreJournal.entries(content.homepage?.journals);
    $('#journal-categories').innerHTML = journals.map((entry,index)=>`<a href="/shop?category=${entry.category}" data-text-tone="${entry.textTone||'auto'}">${entry.image ? `<picture><source media="(max-width:800px)" srcset="${esc(imageSet(entry.mobileImage||entry.image)||imageUrl(optimized(entry.mobileImage||entry.image,960)))}"><img src="${esc(imageUrl(optimized(entry.image,960)))}" srcset="${esc(imageSet(entry.image))}" sizes="33.333vw" alt="${entry.category}" loading="lazy"></picture>` : ''}<span class="journal-copy"><strong>${esc(entry.title||['OUTER','T-SHIRT','PANTS'][index])}</strong><small>${esc(content.homepage?.journalSeason??'WINTER BEST')}</small></span></a>`).join('');
    $('#journal-categories').querySelectorAll('a').forEach(link=>{
      const image=link.querySelector('img');if(!image)return;
      const update=()=>adaptImageText(image,link,link.dataset.textTone,'--journal-ink',[.4,.65,1,1]);
      image.addEventListener('load',update);if(image.complete&&image.naturalWidth)update();
    });

  }
  function renderSlides() {
    if (!content?.heroImages.length) return;
    if (!heroInitialized) {
      const source = heroSource(currentSlide);
      const hero=$('#hero-photo');hero.removeAttribute('srcset');const mobileSource=hero.closest('picture')?.querySelector('source');if(mobileSource)mobileSource.removeAttribute('srcset');if(hero.getAttribute('src')!==source)hero.src=source;heroInitialized = true;
    }
    $('#hero-photo').alt = content.brand + ' — ' + t('home.collection');
    renderHomepageMedia();
    updateHeroControls();
    updateHeroInk();
    preloadNextHero();
  }
  async function init() {
    try {
      if (preview) { content = preview.content; inventory = []; }
      else {
        if(window.StoreInitialContent)content=window.StoreInitialContent.content;
        else{const response=await fetch('/api/content',{cache:'no-store'});if(!response.ok)throw Error();content=(await response.json()).content;}
        await Promise.all([
          fetch('/api/shop?view=stock',{cache:'no-store'}).then(async response => { if (response.ok) inventory = (await response.json()).inventory || []; }).catch(() => {}),
          fetch('/api/shop?view=settings',{cache:'no-store'}).then(async response => { if (response.ok) shopSettings = (await response.json()).settings; }).catch(() => {}),
          fetch('/api/session',{cache:'no-store'}).then(async response => { if (response.ok && (await response.json()).isAdmin) { $('#admin-entry').hidden = false; $('.admin-footer').hidden = false; } }).catch(() => {})
        ]);
      }
      content=window.StoreCampaign.layout(content);
      const requestedCategory = new URLSearchParams(location.search).get('category');
      if (categories.includes(requestedCategory)) category=requestedCategory;
      const requestedView=new URLSearchParams(location.search).get('view');if(['best','wishlist'].includes(requestedView))view=requestedView;
      if(new URLSearchParams(location.search).has('search'))$('#search-area').hidden=false;
      const requestedSearch=new URLSearchParams(location.search).get('q');if(requestedSearch){search=requestedSearch.trim().normalize('NFKC').toLowerCase();$('#search').value=requestedSearch;$('#search-area').hidden=false;}
      products = content.products.filter(product => product.visible !== false);
      const savedCart = stored(cartKey), savedFavorites = stored(wishlistKey);
      cart = Array.isArray(savedCart) ? savedCart.filter(item => item && products.some(product => product.id === item.id && product.sizes.includes(item.size)) && Number.isInteger(item.qty) && item.qty > 0 && item.qty <= 99) : [];
      favorites = new Set(Array.isArray(savedFavorites) ? savedFavorites.filter(id => products.some(product => product.id === id)) : []);
      cancelHeroTransition(); currentSlide = 0; heroInitialized = false; failedHeroSources.clear();
      persist(wishlistKey,[...favorites]); applyBrand(); renderSlides(); syncHeroTimer(); render(); renderCart(); renderCommunity();
      if(pageMode==='product'){const product=products.find(p=>p.id===routeProduct);$('#detail-page-content').hidden=false;if(product){currentProduct=product.id;renderProduct(product.id,'',true);document.title=product.name+' — '+content.brand;}else $('#detail-page-content').textContent='상품을 찾을 수 없습니다.';}
      const linkedProduct=new URLSearchParams(location.search).get('product');if(linkedProduct&&products.some(p=>p.id===linkedProduct))location.replace('/products/'+encodeURIComponent(linkedProduct));
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
    const product = event.target.closest('[data-product]'); if (product) { openProduct(product.dataset.product); return; }
    const slide = event.target.closest('[data-slide]'); if (slide && content) { heroPaused = true; changeHeroSlide(Number(slide.dataset.slide)); updateHeroControls(); syncHeroTimer(); return; }
    const language = event.target.closest('[data-set-language]'); if (language) { I.setLanguage(language.dataset.setLanguage); $('#language-dialog').close(); return; }
    const filter = event.target.closest('[data-category]'); if (filter) { category = filter.dataset.category; render(); return; }
    const navigation = event.target.closest('#store-nav a');
    if (navigation) { if (['#about','#community'].includes(navigation.getAttribute('href'))) { event.preventDefault(); const section=$(navigation.getAttribute('href')); $('#info-content').innerHTML=section.innerHTML; currentInfo=null; closeMenu(false); $('#info-dialog').showModal(); return; } if (navigation.dataset.view) { event.preventDefault(); changeView(navigation.dataset.view); } else closeMenu(false); return; }
    if (event.target.closest('#site-sidebar .logo')) { closeMenu(false); return; }
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
  $('#search-button').onclick = () => { if(pageMode!=='shop'){location.href='/shop?search=1';return;}closeMenu(false); $('#search-area').hidden = false; $('#shop').scrollIntoView(); $('#search').focus({preventScroll:true}); };
  $('#wishlist-button').onclick = () => changeView('wishlist');
  $('#bag-button').onclick = () => { closeMenu(false); $('#bag-dialog').showModal(); };
  $('#mobile-bag-button')?.addEventListener('click', () => $('#bag-dialog').showModal());
  $('#continue').onclick = () => $('#bag-dialog').close();

  $('#language-button').onclick = () => { closeMenu(false); $('#language-dialog').showModal(); };
  $('#hero-toggle').onclick = () => { heroPaused = !heroPaused; updateHeroControls(); syncHeroTimer(); };
  let heroTouch=null,heroSwiped=false;
  campaign.addEventListener('touchstart',event=>{heroTouch=event.touches[0] ? {x:event.touches[0].clientX,y:event.touches[0].clientY}:null;heroPaused=true;updateHeroControls();syncHeroTimer();},{passive:true});
  campaign.addEventListener('touchend',event=>{if(!heroTouch||!content)return;const touch=event.changedTouches[0],dx=touch.clientX-heroTouch.x,dy=touch.clientY-heroTouch.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){heroSwiped=true;changeHeroSlide((currentSlide+(dx<0?1:-1)+content.heroImages.length)%content.heroImages.length);setTimeout(()=>heroSwiped=false,500);}heroTouch=null;},{passive:true});
  $('#hero-link').addEventListener('click',event=>{if(heroSwiped)event.preventDefault();});
  campaign.addEventListener('mouseenter', () => { if (finePointer.matches) { heroHovered = true; syncHeroTimer(); } });
  campaign.addEventListener('mouseleave', () => { heroHovered = false; syncHeroTimer(); });
  campaign.addEventListener('focusin', event => { heroFocused = event.target.matches(':focus-visible'); syncHeroTimer(); });
  campaign.addEventListener('focusout', event => { heroFocused = !!event.relatedTarget && campaign.contains(event.relatedTarget) && event.relatedTarget.matches(':focus-visible'); syncHeroTimer(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHeroTransition(); syncHeroTimer(); });
  reducedMotion.addEventListener('change', () => { cancelHeroTransition(); updateHeroControls(); syncHeroTimer(); updateSidebarBackground(); });
  window.addEventListener('pagehide', () => { clearInterval(heroTimer); cancelHeroTransition(); });
  window.addEventListener('pageshow', () => { syncHeroTimer(); scheduleSidebar(); });
  window.addEventListener('scroll', scheduleSidebar, {passive:true});
  window.addEventListener('resize', scheduleSidebar, {passive:true});
  sidebar.addEventListener('focusin', scheduleSidebar);
  sidebar.addEventListener('focusout', scheduleSidebar);
  $('.mobile-menu').onclick = () => $('#site-sidebar').classList.contains('open') ? closeMenu() : openMenu();
  $('#menu-close').onclick = () => closeMenu(); $('#menu-backdrop').onclick = () => closeMenu();
  mobile.addEventListener('change', () => {
    const focused = sidebar.contains(document.activeElement), wasOpen = sidebar.classList.contains('open');
    if(content) {cancelHeroTransition(); $('#hero-photo').src=heroSource(currentSlide); preloadNextHero();}
    closeMenu(false);
    if (focused || wasOpen) {
      const toggle = $('.mobile-menu');
      (toggle.getClientRects().length ? toggle : sidebar.querySelector('.logo')).focus({preventScroll:true});
    }
  });
  document.addEventListener('keydown', event => {
    if (!$('#site-sidebar').classList.contains('open')) return;
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
      if ((dialog.id === 'language-dialog' && (mobile.matches || document.body.classList.contains('catalog-focus')))
        || (sidebar.inert && sidebar.contains(document.activeElement))) $('.mobile-menu').focus({preventScroll:true});
    });
  });
  window.addEventListener('street-label:languagechange', () => {
    I.apply(); if (!content) return; const selectedSize = $('#size')?.value;
    applyBrand(); renderSlides(); render(); renderCart(); renderCommunity();
    if(pageMode==='product')renderProduct(routeProduct,selectedSize,true);
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
  document.querySelectorAll('.product-slider').forEach(track => {
    let drag = null, suppressClick = false;
    track.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('.quick-panel, .wishlist-toggle')) return;
      drag = {x:event.clientX, scroll:track.scrollLeft, moved:false};
    });
    window.addEventListener('pointermove', event => {
      if (!drag) return;
      const distance=event.clientX-drag.x;
      if (Math.abs(distance)>5) { drag.moved=true; track.classList.add('dragging'); event.preventDefault(); track.scrollLeft=drag.scroll-distance; }
    }, {passive:false});
    window.addEventListener('pointerup', () => { if (!drag) return; suppressClick=drag.moved; drag=null; track.classList.remove('dragging'); setTimeout(()=>suppressClick=false,0); });
    track.addEventListener('click', event=>{if(suppressClick){event.preventDefault();event.stopPropagation();}},true);
    track.addEventListener('dragstart',event=>event.preventDefault());
    track.addEventListener('keydown',event=>{if(event.target===track&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();track.scrollBy({left:track.clientWidth/3*(event.key==='ArrowLeft'?-1:1),behavior:reducedMotion.matches?'instant':'smooth'});}});
  });
  I.apply(); closeMenu(false); updateSidebarBackground(); init(); loadPolicyLinks();
})();
