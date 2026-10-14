import {$,esc,won,api,orderHtml,translatedText as text,priceHtml,orderDate} from './commerce-common.js';
import './customer-brand.js';

const I=window.StoreI18n;
const t=(key,params)=>I.t(key,params);
const signupPage=location.pathname.replace(/\/$/,'')==='/signup';
const checkoutIntent=new URL(location.href).searchParams.get('next')==='checkout'||location.hash==='#checkout';
const signupPath='/signup'+(checkoutIntent?'?next=checkout':'');
const accountPath=checkoutIntent?'/account?next=checkout#checkout':'/account#profile';
let page=0,data,catalog=[],cart=[],requestOrder=null;
let loading=false,profileSaving=false,orderSaving=false,requestSaving=false;

function setText(el,key,params){
  if(!el)return;
  el.dataset.i18n=key;
  if(params)el.dataset.i18nParams=JSON.stringify(params);else delete el.dataset.i18nParams;
  delete el.dataset.errorOriginal;
  el.textContent=t(key,params);
}

function setError(el,err){
  if(err.messageKey){setText(el,err.messageKey);return}
  delete el.dataset.i18n;delete el.dataset.i18nParams;
  el.dataset.errorOriginal=err.originalMessage||err.message;
  el.textContent=I.translateError(el.dataset.errorOriginal);
}

function pageStatus(key,params){setText($('#status'),key,params);$('#status').classList.remove('error')}
function pageError(err){setError($('#status'),err);$('#status').classList.add('error')}
function feedback(key,params){
  const el=$('#profile-feedback');if(!el)return;
  setText(el,key,params);el.classList.remove('error');el.setAttribute('role','status');el.hidden=false;el.focus();
}
function feedbackError(err){
  const el=$('#profile-feedback');if(!el)return;
  setError(el,err);el.classList.add('error');el.setAttribute('role','alert');el.hidden=false;el.focus();
}
function originalNotice(){return `<p class="original-notice" data-original-notice ${I.getLanguage()==='ko'?'hidden':''}>${text('common.originalNotice')}</p>`}
function originalSetting(field,cls='notice'){return `<div class="${cls}">${esc(data.settings[field])}</div>${originalNotice()}`}
function productName(p){return I.catalogValue(p,'name')}
function loginLink(){return '/signin-with-chatgpt?return_to='+encodeURIComponent(signupPath)}

function validatePhone(input){
  const value=input.value.trim();
  input.setCustomValidity(/^[0-9+() -]{8,25}$/.test(value)&&(value.match(/[0-9]/g)||[]).length>=8?'':t('auth.phoneInvalid'));
}
function validateName(input){input.setCustomValidity(input.value.trim().length>=2?'':t('auth.nameInvalid'))}
function bindProfileValidation(form,nameField){
  if(!form)return;
  const phone=form.elements.namedItem('phone'),name=form.elements.namedItem(nameField);
  phone.addEventListener('input',()=>validatePhone(phone));name.addEventListener('input',()=>validateName(name));
}

function refreshLanguage(){
  I.apply();
  document.querySelector('title').dataset.storeTitle=signupPage?'auth.documentTitle':'account.documentTitle';
  window.StoreBrand.refreshTitle();
  document.querySelectorAll('[data-error-original]').forEach(el=>{el.textContent=I.translateError(el.dataset.errorOriginal)});
  document.querySelectorAll('[data-original-notice]').forEach(el=>{el.hidden=I.getLanguage()==='ko'});
  document.querySelectorAll('[data-krw]').forEach(el=>{el.textContent=won(Number(el.dataset.krw))});
  document.querySelectorAll('[data-order-date]').forEach(el=>{el.textContent=orderDate(el.dataset.orderDate)});
  document.querySelectorAll('[data-product-name]').forEach(el=>{const p=catalog.find(p=>p.id===el.dataset.productName);if(p)el.textContent=productName(p)});
  const orderButton=$('[data-order-submit]');
  if(orderButton&&!orderSaving)setText(orderButton,'order.submit',{total:won(Number(orderButton.dataset.orderSubmit))});
  const support=$('#orders-support');
  if(support)setText(support,'order.support',{support:data.settings.support||t('order.supportPending')});
  for(const [selector,field] of [['#profile-form','name'],['#order-form','recipient']]){
    const form=$(selector);if(!form)continue;
    const phone=form.elements.namedItem('phone'),name=form.elements.namedItem(field);
    // Preserve untouched fields and update any existing custom validation message.
    if(phone.validity.customError)validatePhone(phone);
    if(name.validity.customError)validateName(name);
  }
}
window.addEventListener('street-label:languagechange',refreshLanguage);

async function load(){
  if(loading)return false;
  loading=true;$('#page-main').setAttribute('aria-busy','true');$('#load-actions').hidden=true;
  try{
    const result=await api('/api/shop?page='+page);
    if(signupPage&&result.profile){location.replace(accountPath);return false}
    if(!signupPage&&!result.profile){location.replace(signupPath);return false}
    data=result;
    if(!signupPage){
      const content=await window.StoreBrand.load();catalog=content.products;
      try{
        const saved=JSON.parse(localStorage.getItem('your-label-cart')||'[]');
        cart=Array.isArray(saved)?saved.filter(x=>Number.isInteger(x.qty)&&x.qty>0&&catalog.some(p=>p.id===x.id&&p.sizes.includes(x.size))):[];
      }catch{cart=[]}
    }
    render();pageStatus(signupPage?'status.signup':'status.account');
    if(!signupPage&&checkoutIntent)$('#checkout').scrollIntoView();return true;
  }catch(e){
    pageError(e);$('#load-actions').hidden=false;$('#load-login').hidden=e.status!==401;$('#load-login').href=loginLink();return false;
  }finally{loading=false;$('#page-main').setAttribute('aria-busy','false')}
}

function render(){
  setText($('#page-title'),signupPage?'auth.signup':'account.title');
  $('#page-eyebrow').textContent=signupPage?'JOIN':'MY ACCOUNT';
  $('#orders-link').hidden=signupPage;document.body.classList.toggle('joining',signupPage);
  renderProfile();
  if(signupPage){$('#checkout').innerHTML='';$('#orders').innerHTML='';refreshLanguage();return}
  renderCheckout();renderOrders();refreshLanguage();
}

function renderProfile(){
  const p=data.profile,s=data.settings,policiesReady=!!s.terms.trim()&&!!s.privacy.trim();
  $('#profile').innerHTML=`<h2 id="profile-title">${text(p?'account.profileTitle':'auth.enterInfo')}</h2>
    <p class="muted">${text(p?'account.profileInfo':'auth.verified')}</p>
    ${!policiesReady?`<p class="notice">${text(p?'auth.prepareUpdate':'auth.prepare')}</p><div class="actions"><button id="policy-retry" type="button" data-i18n="auth.checkAgain">${esc(t('auth.checkAgain'))}</button><a href="/" class="text-link">${text('account.shop')}</a></div>`:`<form id="profile-form">
      <div class="fields">
        <label>${text('auth.name')}<input name="name" required minlength="2" maxlength="60" autocomplete="name" value="${esc(p?.name)}"></label>
        <label>${text('auth.phone')}<input name="phone" type="tel" inputmode="tel" required maxlength="25" autocomplete="tel" placeholder="010-0000-0000" value="${esc(p?.phone)}"></label>
      </div>
      <div class="policy-group">
        <details><summary>${text('auth.terms')}</summary>${originalSetting('terms','terms')}</details>
        <label class="check"><input type="checkbox" name="terms" required>${text('auth.termsConsent')}</label>
        <details><summary>${text('auth.privacy')}</summary>${originalSetting('privacy','terms')}</details>
        <label class="check"><input type="checkbox" name="privacy" required>${text('auth.privacyConsent')}</label>
      </div>
      <p class="signup-note">${text('auth.noPassword')}${!p&&checkoutIntent?' '+text('auth.checkoutNext'):''}</p>
      <p id="profile-feedback" class="form-feedback" role="status" aria-live="polite" tabindex="-1" hidden></p>
      <div class="actions"><button type="submit" class="primary" data-i18n="${p?'account.save':'auth.register'}">${esc(t(p?'account.save':'auth.register'))}</button></div>
    </form>`}`;
  $('#policy-retry')?.addEventListener('click',load);bindProfileValidation($('#profile-form'),'name');$('#profile-form')?.addEventListener('submit',saveProfile);
}

async function saveProfile(e){
  e.preventDefault();if(profileSaving)return;
  const f=e.currentTarget;validateName(f.elements.namedItem('name'));validatePhone(f.elements.namedItem('phone'));if(!f.reportValidity())return;
  const values=new FormData(f),b=f.querySelector('button[type="submit"]'),wasMember=!!data.profile;
  profileSaving=true;f.setAttribute('aria-busy','true');b.disabled=true;
  setText(b,wasMember?'account.saving':'auth.registering');feedback(wasMember?'account.savePending':'auth.registerPending');
  try{
    const name=String(values.get('name')).trim(),phone=String(values.get('phone')).trim();
    await api('/api/shop',{action:'register',name,phone,consent:values.has('terms')&&values.has('privacy'),revision:data.revision});
    if(!wasMember){
      $('#profile').innerHTML=`<h2 id="profile-title" tabindex="-1">${text('auth.complete')}</h2><p class="muted">${text('auth.welcome',{name})}</p><div class="actions"><a class="primary signup-start" href="${accountPath}">${text(checkoutIntent?'auth.continueCheckout':'auth.goAccount')}</a><a class="text-link" href="/">${text('account.shop')}</a></div>`;
      pageStatus(checkoutIntent?'status.completeCheckout':'status.completeAccount');$('#profile-title').focus();I.apply();
    }else{data.profile={...data.profile,name,phone};feedback('account.saved');pageStatus('account.saved')}
  }catch(err){
    feedbackError(err);if(err.status===401){$('#load-actions').hidden=false;$('#load-login').hidden=false;$('#load-login').href=loginLink()}
  }finally{profileSaving=false;f.setAttribute('aria-busy','false');b.disabled=false;setText(b,wasMember?'account.save':'auth.register')}
}

function renderCheckout(){
  const p=data.profile,s=data.settings,total=cart.reduce((n,x)=>n+catalog.find(p=>p.id===x.id).price*x.qty,0)+s.shippingFee;
  $('#checkout').innerHTML=`<h2>${text('order.checkout')}</h2>${!s.accepting?'<p class="notice">'+text('order.notAccepting')+'</p>':!cart.length?'<p class="empty">'+text('order.emptyCart')+'</p>':`<form id="order-form">
    ${cart.map(x=>{const p=catalog.find(p=>p.id===x.id);return `<div class="line"><span><span data-product-name="${esc(p.id)}">${esc(productName(p))}</span> / ${esc(x.size)} × ${x.qty}</span><span>${priceHtml(p.price*x.qty)}</span></div>`}).join('')}
    <div class="line"><span>${text('order.shipping')}</span><span>${priceHtml(s.shippingFee)}</span></div><div class="line total"><strong>${text('order.total')}</strong><strong>${priceHtml(total)}</strong></div>
    <div class="fields">
      <label>${text('order.recipient')}<input name="recipient" value="${esc(p.name)}" required minlength="2" maxlength="60" autocomplete="shipping name"></label>
      <label>${text('auth.phone')}<input name="phone" type="tel" inputmode="tel" value="${esc(p.phone)}" required maxlength="25" autocomplete="shipping tel"></label>
      <label>${text('order.postcode')}<input name="postcode" required pattern="[0-9]{5}" maxlength="5" autocomplete="shipping postal-code"></label>
      <label class="full">${text('order.address1')}<input name="line1" required minlength="5" maxlength="200" autocomplete="shipping address-line1"></label>
      <label class="full">${text('order.address2')}<input name="line2" required maxlength="200" autocomplete="shipping address-line2"></label>
      <label class="full">${text('order.memo')}<input name="memo" maxlength="300"></label>
    </div>
    <h3>${text('order.bank')}</h3>${originalSetting('bankInfo')}<p class="muted">${text('order.paymentNotice')}</p>
    <details><summary>${text('order.returnGuide')}</summary>${originalSetting('returnGuide','terms')}</details>
    <label class="check"><input name="consent" type="checkbox" required>${text('order.consent')}</label>
    <button class="primary" data-order-submit="${total}" data-i18n="order.submit" data-i18n-params="${esc(JSON.stringify({total:won(total)}))}">${esc(t('order.submit',{total:won(total)}))}</button>
  </form>`}`;
  bindProfileValidation($('#order-form'),'recipient');
  $('#order-form')?.addEventListener('submit',async e=>{
    e.preventDefault();if(orderSaving)return;
    const f=e.currentTarget,b=f.querySelector('button');validateName(f.elements.namedItem('recipient'));validatePhone(f.elements.namedItem('phone'));if(!f.reportValidity())return;
    orderSaving=true;b.disabled=true;f.setAttribute('aria-busy','true');setText(b,'order.submitting');
    const v=new FormData(f),payload={action:'create',items:cart,expectedTotal:total,settingsRevision:data.revision,consent:v.has('consent'),address:{name:v.get('recipient'),phone:v.get('phone'),postcode:v.get('postcode'),line1:v.get('line1'),line2:v.get('line2'),memo:v.get('memo')}};
    let record;try{record=JSON.parse(sessionStorage.getItem('order-attempt')||'null')}catch{}
    const fingerprint=JSON.stringify(payload);if(!record||record.fingerprint!==fingerprint)record={fingerprint,key:crypto.randomUUID()};
    try{sessionStorage.setItem('order-attempt',JSON.stringify(record))}catch{}
    try{
      await api('/api/shop',{...payload,requestKey:record.key});try{localStorage.removeItem('your-label-cart');sessionStorage.removeItem('order-attempt')}catch{}
      page=0;if(await load()){pageStatus('order.submitted');$('#orders').scrollIntoView()}
    }catch(err){pageError(err)}finally{orderSaving=false;b.disabled=false;f.setAttribute('aria-busy','false');setText(b,'order.submit',{total:won(total)})}
  });
}

function renderOrders(){
  const s=data.settings;
  $('#orders').innerHTML='<h2>'+text('order.myOrders')+'</h2>'+(!data.orders.length?'<p class="empty">'+text('order.empty')+'</p>':data.orders.map(o=>orderHtml(o)).join(''))+`<p class="muted" id="orders-support">${text('order.support',{support:s.support||t('order.supportPending')})}</p>`;
  $('#orders').insertAdjacentHTML('beforeend',`<div class="actions"><button id="prev-page" data-i18n="order.previous" ${page===0?'disabled':''}>${esc(t('order.previous'))}</button><span>${text('order.page',{page:page+1})}</span><button id="next-page" data-i18n="order.next" ${data.hasMore?'':'disabled'}>${esc(t('order.next'))}</button></div>`);
  $('#prev-page').onclick=()=>{if(!loading){page--;load()}};$('#next-page').onclick=()=>{if(!loading){page++;load()}};
  data.orders.forEach(o=>{
    const el=document.querySelector(`[data-order="${o.id}"]`);
    if(['received','preparing'].includes(o.status))el.innerHTML=`<button data-action="cancel" data-i18n="order.cancel">${esc(t('order.cancel'))}</button>`;
    if(['shipped','delivered'].includes(o.status)&&o.payment==='confirmed')el.innerHTML=`<button data-action="return" data-i18n="order.return">${esc(t('order.return'))}</button>`;
    if(o.status==='received'&&o.payment==='awaiting_payment')el.insertAdjacentHTML('beforebegin',`<p>${text('order.bank')}</p>${originalSetting('bankInfo')}`);
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      requestOrder={...o,action:b.dataset.action};setText($('#request-title'),b.dataset.action==='cancel'?'order.cancel':'order.return');
      $('#reason').value='';$('#request-error').textContent='';delete $('#request-error').dataset.errorOriginal;$('#request-dialog').showModal();
    });
  });
}

$('#load-retry').onclick=load;$('#close-dialog').onclick=()=>$('#request-dialog').close();
$('#request-form').onsubmit=async e=>{
  e.preventDefault();if(requestSaving)return;
  const f=e.currentTarget,b=f.querySelector('.primary');requestSaving=true;b.disabled=true;f.setAttribute('aria-busy','true');setText(b,'order.requestPending');
  try{
    await api('/api/shop',{id:requestOrder.id,revision:requestOrder.revision,action:requestOrder.action,note:$('#reason').value});$('#request-dialog').close();if(await load())pageStatus('order.requested');
  }catch(err){setError($('#request-error'),err)}finally{requestSaving=false;b.disabled=false;f.setAttribute('aria-busy','false');setText(b,'account.request')}
};
refreshLanguage();load();
