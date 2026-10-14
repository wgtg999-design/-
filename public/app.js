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
  let inventory = [], products = [], category = 'ALL', search = '', sort = 'default';
  let cart = [], favorites = new Set(), content = null, view = 'all', currentProduct = null;
  let currentInfo = null, currentSlide = 0, toastTimer;
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
  function photo(product) {
    return `<div class="product-photo packshot ${product.image === '/assets/products.png' ? product.crop : 'custom-photo'}" style="background-image:url('${esc(imageUrl(product.image))}')" role="img" aria-label="${esc(label(product, 'name'))}"><span class="product-index">${String(products.indexOf(product) + 1).padStart(2, '0')}</span></div>`;
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
    $('#products').innerHTML = list.map(product => `<article class="product-card"><button class="product" data-product="${esc(product.id)}" aria-label="${esc(t('shop.detailAria',{name:label(product,'name')}))}">${photo(product)}<div class="product-meta"><div><h3>${esc(label(product,'name'))}</h3><small>${esc(label(product,'color'))}</small>${product.sizes.some(size => purchaseLimit(product.id,size) > 0) ? '' : `<small>${esc(t('product.soldOut'))}</small>`}</div><p>${money(product.price)}</p></div></button>${favoriteButton(product)}</article>`).join('');
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
  function renderProduct(id, selectedSize = '') {
    const product = products.find(item => item.id === id); if (!product) return;
    const description = label(product, 'description'), sizeGuide = label(product, 'sizeGuide');
    const originalNote = I.getLanguage() !== 'ko' && !product.translations?.[I.getLanguage()]?.description;
    $('#product-detail').innerHTML = `<div class="detail-layout">${photo(product)}<div class="detail-copy"><p class="muted">${esc(t('home.collection'))}</p><h2>${esc(label(product,'name'))}</h2><p>${esc(label(product,'color'))}<br>${money(product.price)}</p><p style="white-space:pre-line">${esc(description)}</p>${originalNote ? `<p class="muted">${esc(t('shop.originalText'))}</p>` : ''}<label for="size">${esc(t('product.size'))}</label><select id="size"><option value="">${esc(t('product.chooseSize'))}</option>${product.sizes.map(size => {
      const limit = purchaseLimit(id, size);
      return `<option value="${esc(size)}" ${limit ? '' : 'disabled'} ${size === selectedSize ? 'selected' : ''}>${esc(size)} · ${esc(limit ? t('product.maxQuantity',{count:limit}) : t('product.soldOut'))}</option>`;
    }).join('')}</select><button class="primary" id="add" type="button">${esc(t('product.addToBag'))}</button><p id="size-error" role="alert"></p><button class="size-guide-toggle" id="size-guide" type="button" aria-expanded="false" aria-controls="size-guide-content">${esc(t('product.sizeGuide'))} +</button><div id="size-guide-content" class="size-guide-content" hidden>${sizeGuide ? `<p style="white-space:pre-line">${esc(sizeGuide)}</p>${I.getLanguage() !== 'ko' && !product.translations?.[I.getLanguage()]?.sizeGuide ? `<p class="muted">${esc(t('shop.originalText'))}</p>` : ''}` : `<p>${esc(t('product.sizeGuideEmpty'))}</p><p>${esc(t('product.measureIntro'))}</p><ul><li>${esc(t('product.measureShoulder'))}</li><li>${esc(t('product.measureChest'))}</li><li>${esc(t('product.measureLength'))}</li></ul><p class="muted">${esc(t('product.measureNote'))}</p>`}</div><button class="save-product" type="button" data-wishlist="${esc(id)}" aria-pressed="${favorites.has(id)}">${esc(t(favorites.has(id) ? 'product.unsave' : 'product.save'))}</button><div class="sizes">${esc(t('product.paymentNote'))}</div></div></div>`;
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
    const disclaimer = $('.store-footer small');
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
  function renderSlides() {
    $('#hero-photo').src = imageUrl(content.heroImages[currentSlide] || content.heroImages[0]);
    $('#hero-photo').alt = content.brand + ' — ' + t('home.collection');
    $('.editorial-photo img').src = imageUrl(content.journalImage);
    $('.hero-pagination').innerHTML = content.heroImages.map((_, index) => `<button class="${index === currentSlide ? 'selected' : ''}" data-slide="${index}" aria-label="${esc(t('home.photoSelect'))} ${I.formatNumber(index+1)}" aria-pressed="${index === currentSlide}"></button>`).join('');
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
      persist(wishlistKey,[...favorites]); applyBrand(); renderSlides(); render(); renderCart(); renderCommunity();
    } catch { $('#products').innerHTML = `<p class="muted">${esc(t('product.loadingError'))}</p><button id="retry-products" type="button">${esc(t('common.retry'))}</button>`; }
  }

  document.addEventListener('click', event => {
    const service = event.target.closest('[data-preview-service]');
    if (service && preview) { event.preventDefault(); showInfo('preview'); return; }
    const favorite = event.target.closest('[data-wishlist]'); if (favorite) { toggleFavorite(favorite.dataset.wishlist); return; }
    const product = event.target.closest('[data-product]'); if (product) { openProduct(product.dataset.product); return; }
    const slide = event.target.closest('[data-slide]'); if (slide && content) { currentSlide = Number(slide.dataset.slide); renderSlides(); return; }
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
  $('.mobile-menu').onclick = () => $('#site-sidebar').classList.contains('open') ? closeMenu() : openMenu();
  $('#menu-close').onclick = () => closeMenu(); $('#menu-backdrop').onclick = () => closeMenu();
  mobile.addEventListener('change', () => closeMenu(false));
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
  I.apply(); closeMenu(false); init();
})();
