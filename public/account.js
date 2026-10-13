import {$,esc,won,api,status,orderHtml} from './commerce-common.js';

const signupPage=location.pathname.replace(/\/$/,'')==='/signup';
const checkoutIntent=new URL(location.href).searchParams.get('next')==='checkout'||location.hash==='#checkout';
const signupPath='/signup'+(checkoutIntent?'?next=checkout':'');
const accountPath=checkoutIntent?'/account?next=checkout#checkout':'/account#profile';
let page=0,data,catalog=[],cart=[],requestOrder=null;
let loading=false,profileSaving=false,orderSaving=false,requestSaving=false;

function feedback(message,error=false){
  const el=$('#profile-feedback');
  if(!el)return;
  el.textContent=message;
  el.classList.toggle('error',error);
  el.setAttribute('role',error?'alert':'status');
  el.hidden=!message;
  if(message)el.focus();
}

function loginLink(){
  return '/signin-with-chatgpt?return_to='+encodeURIComponent(signupPath);
}

function validatePhone(input){
  const value=input.value.trim();
  input.setCustomValidity(/^[0-9+() -]{8,25}$/.test(value)&&(value.match(/[0-9]/g)||[]).length>=8?'':'연락처는 숫자 8자리 이상으로 입력해 주세요.');
}

function validateName(input){
  input.setCustomValidity(input.value.trim().length>=2?'':'이름을 2글자 이상 입력해 주세요.');
}

function bindProfileValidation(form,nameField){
  if(!form)return;
  const phone=form.elements.namedItem('phone'),name=form.elements.namedItem(nameField);
  phone.addEventListener('input',()=>validatePhone(phone));
  name.addEventListener('input',()=>validateName(name));
}

async function load(){
  if(loading)return false;
  loading=true;
  $('#page-main').setAttribute('aria-busy','true');
  $('#load-actions').hidden=true;
  try{
    const result=await api('/api/shop?page='+page);
    if(signupPage&&result.profile){location.replace(accountPath);return false}
    if(!signupPage&&!result.profile){location.replace(signupPath);return false}
    data=result;
    if(!signupPage){
      catalog=(await api('/api/content')).content.products;
      try{
        const saved=JSON.parse(localStorage.getItem('your-label-cart')||'[]');
        cart=Array.isArray(saved)?saved.filter(x=>Number.isInteger(x.qty)&&x.qty>0&&catalog.some(p=>p.id===x.id&&p.sizes.includes(x.size))):[];
      }catch{cart=[]}
    }
    render();
    status(signupPage?'이름·연락처를 입력하고 아래 안내를 확인해 주세요.':'ChatGPT 로그인과 연결된 내 계정입니다. 회원정보와 주문 내역은 본인에게만 표시됩니다.');
    if(!signupPage&&checkoutIntent)$('#checkout').scrollIntoView();
    return true;
  }catch(e){
    status(e.message,true);
    $('#load-actions').hidden=false;
    $('#load-login').hidden=e.status!==401;
    $('#load-login').href=loginLink();
    return false;
  }finally{
    loading=false;
    $('#page-main').setAttribute('aria-busy','false');
  }
}

function render(){
  $('#page-title').textContent=signupPage?'회원가입':'회원정보와 주문';
  $('#page-eyebrow').textContent=signupPage?'JOIN':'MY ACCOUNT';
  document.title=signupPage?'회원가입 · YOUR LABEL':'내 계정 · 주문';
  $('#orders-link').hidden=signupPage;
  document.body.classList.toggle('joining',signupPage);
  renderProfile();
  if(signupPage){$('#checkout').innerHTML='';$('#orders').innerHTML='';return}
  renderCheckout();
  renderOrders();
}

function renderProfile(){
  const p=data.profile,s=data.settings;
  const policiesReady=!!s.terms.trim()&&!!s.privacy.trim();
  $('#profile').innerHTML=`<h2 id="profile-title">${p?'회원정보 수정':'내 정보 입력'}</h2>
    <p class="muted">${p?'현재 로그인한 ChatGPT 계정에 연결된 회원정보입니다.':'ChatGPT 로그인을 확인했습니다. 가입 정보는 이 계정에 연결됩니다.'}</p>
    ${!policiesReady?`<p class="notice">회원가입 안내를 준비 중입니다. 운영자가 이용약관과 개인정보 안내를 등록한 후 ${p?'회원정보를 저장':'가입'}할 수 있습니다.</p><div class="actions"><button id="policy-retry" type="button">안내 다시 확인</button><a href="/" class="text-link">쇼핑 계속하기</a></div>`:`<form id="profile-form">
      <div class="fields">
        <label>이름<input name="name" required minlength="2" maxlength="60" autocomplete="name" value="${esc(p?.name)}"></label>
        <label>연락처<input name="phone" type="tel" inputmode="tel" required maxlength="25" autocomplete="tel" placeholder="010-0000-0000" value="${esc(p?.phone)}"></label>
      </div>
      <div class="policy-group">
        <details><summary>이용약관 확인</summary><div class="terms">${esc(s.terms)}</div></details>
        <label class="check"><input type="checkbox" name="terms" required><span>[필수] 이용약관을 확인하고 동의합니다.</span></label>
        <details><summary>개인정보 수집·이용 안내 확인</summary><div class="terms">${esc(s.privacy)}</div></details>
        <label class="check"><input type="checkbox" name="privacy" required><span>[필수] 회원·주문 처리를 위한 개인정보 안내를 확인하고 동의합니다.</span></label>
      </div>
      <p class="signup-note">별도 쇼핑몰 비밀번호는 만들지 않습니다.${!p&&checkoutIntent?' 가입 후 주문서를 이어서 작성할 수 있습니다.':''}</p>
      <p id="profile-feedback" class="form-feedback" role="status" aria-live="polite" tabindex="-1" hidden></p>
      <div class="actions"><button type="submit" class="primary">${p?'회원정보 저장':'회원가입 완료'}</button></div>
    </form>`}`;
  $('#policy-retry')?.addEventListener('click',load);
  bindProfileValidation($('#profile-form'),'name');
  $('#profile-form')?.addEventListener('submit',saveProfile);
}

async function saveProfile(e){
  e.preventDefault();
  if(profileSaving)return;
  const f=e.currentTarget;
  validateName(f.elements.namedItem('name'));
  validatePhone(f.elements.namedItem('phone'));
  if(!f.reportValidity())return;
  const values=new FormData(f),b=f.querySelector('button[type="submit"]');
  const wasMember=!!data.profile,label=b.textContent;
  profileSaving=true;
  f.setAttribute('aria-busy','true');
  b.disabled=true;b.textContent=wasMember?'저장 중…':'가입 중…';
  feedback(wasMember?'회원정보를 저장하고 있습니다.':'회원가입을 처리하고 있습니다.');
  try{
    const name=String(values.get('name')).trim(),phone=String(values.get('phone')).trim();
    await api('/api/shop',{action:'register',name,phone,consent:values.has('terms')&&values.has('privacy'),revision:data.revision});
    if(!wasMember){
      $('#profile').innerHTML=`<h2 id="profile-title" tabindex="-1">회원가입이 완료되었습니다.</h2><p class="muted">${esc(name)}님, 환영합니다. 다음 방문에도 같은 ChatGPT 계정으로 로그인하면 회원정보와 주문 내역을 확인할 수 있습니다.</p><div class="actions"><a class="primary signup-start" href="${accountPath}">${checkoutIntent?'주문서 이어서 작성':'내 계정으로 이동'}</a><a class="text-link" href="/">쇼핑 계속하기</a></div>`;
      status('회원가입을 완료했습니다. 아래 버튼으로 '+(checkoutIntent?'주문서를 이어서 작성하세요.':'내 계정을 확인하세요.'));
      $('#profile-title').focus();
    }else{
      data.profile={...data.profile,name,phone};
      feedback('회원정보를 저장했습니다.');
      status('회원정보를 저장했습니다.');
    }
  }catch(err){
    feedback(err.message,true);
    if(err.status===401){$('#load-actions').hidden=false;$('#load-login').hidden=false;$('#load-login').href=loginLink()}
  }finally{
    profileSaving=false;
    f.setAttribute('aria-busy','false');b.disabled=false;b.textContent=label;
  }
}

function renderCheckout(){
  const p=data.profile,s=data.settings;
  const total=cart.reduce((n,x)=>n+catalog.find(p=>p.id===x.id).price*x.qty,0)+s.shippingFee;
  $('#checkout').innerHTML=`<h2>주문서</h2>${!s.accepting?'<p class="notice">현재 주문 접수 준비 중입니다.</p>':!cart.length?'<p class="empty">장바구니가 비어 있습니다. 홈페이지에서 상품을 담아 주세요.</p>':`<form id="order-form">${cart.map(x=>{const p=catalog.find(p=>p.id===x.id);return `<div class="line"><span>${esc(p.name)} / ${esc(x.size)} × ${x.qty}</span><span>${won(p.price*x.qty)}</span></div>`}).join('')}<div class="line"><span>배송비</span><span>${won(s.shippingFee)}</span></div><div class="line total"><strong>총 주문금액</strong><strong>${won(total)}</strong></div><div class="fields"><label>받는 분<input name="recipient" value="${esc(p.name)}" required minlength="2" maxlength="60" autocomplete="shipping name"></label><label>연락처<input name="phone" type="tel" inputmode="tel" value="${esc(p.phone)}" required maxlength="25" autocomplete="shipping tel"></label><label>우편번호<input name="postcode" required pattern="[0-9]{5}" maxlength="5" autocomplete="shipping postal-code"></label><label class="full">기본 주소<input name="line1" required minlength="5" maxlength="200" autocomplete="shipping address-line1"></label><label class="full">상세 주소<input name="line2" required maxlength="200" autocomplete="shipping address-line2"></label><label class="full">배송 요청사항<input name="memo" maxlength="300"></label></div><h3>무통장 입금 안내</h3><p class="notice">${esc(s.bankInfo)}</p><p class="muted">주문 접수만으로 결제되지 않습니다. 관리자가 실제 입금을 확인한 뒤 출고합니다.</p><details><summary>배송·취소·반품 안내</summary><div class="terms">${esc(s.returnGuide)}</div></details><label class="check"><input name="consent" type="checkbox" required>상품, 배송지, 총 금액과 배송·반품 안내를 확인했습니다.</label><button class="primary">${won(total)} 주문 접수</button></form>`}`;
  bindProfileValidation($('#order-form'),'recipient');
  $('#order-form')?.addEventListener('submit',async e=>{
    e.preventDefault();if(orderSaving)return;
    const f=e.currentTarget,b=f.querySelector('button');
    validateName(f.elements.namedItem('recipient'));
    validatePhone(f.elements.namedItem('phone'));if(!f.reportValidity())return;
    orderSaving=true;b.disabled=true;
    const v=new FormData(f);
    const payload={action:'create',items:cart,expectedTotal:total,settingsRevision:data.revision,consent:v.has('consent'),address:{name:v.get('recipient'),phone:v.get('phone'),postcode:v.get('postcode'),line1:v.get('line1'),line2:v.get('line2'),memo:v.get('memo')}};
    let record;try{record=JSON.parse(sessionStorage.getItem('order-attempt')||'null')}catch{}
    const fingerprint=JSON.stringify(payload);if(!record||record.fingerprint!==fingerprint)record={fingerprint,key:crypto.randomUUID()};
    try{sessionStorage.setItem('order-attempt',JSON.stringify(record))}catch{}
    try{
      await api('/api/shop',{...payload,requestKey:record.key});
      try{localStorage.removeItem('your-label-cart');sessionStorage.removeItem('order-attempt')}catch{}
      page=0;
      if(await load()){status('주문이 접수되었습니다. 입금 안내와 주문 상태를 확인해 주세요.');$('#orders').scrollIntoView()}
    }catch(err){status(err.message,true)}finally{orderSaving=false;b.disabled=false}
  });
}

function renderOrders(){
  const s=data.settings;
  $('#orders').innerHTML='<h2>내 주문 내역</h2>'+(!data.orders.length?'<p class="empty">접수한 주문이 없습니다.</p>':data.orders.map(o=>orderHtml(o)).join(''))+`<p class="muted">문의: ${esc(s.support||'고객센터 준비 중')}</p>`;
  $('#orders').insertAdjacentHTML('beforeend',`<div class="actions"><button id="prev-page" ${page===0?'disabled':''}>이전</button><span>${page+1} 페이지</span><button id="next-page" ${data.hasMore?'':'disabled'}>다음</button></div>`);
  $('#prev-page').onclick=()=>{if(!loading){page--;load()}};
  $('#next-page').onclick=()=>{if(!loading){page++;load()}};
  data.orders.forEach(o=>{
    const el=document.querySelector(`[data-order="${o.id}"]`);
    if(['received','preparing'].includes(o.status))el.innerHTML='<button data-action="cancel">취소 요청</button>';
    if(['shipped','delivered'].includes(o.status)&&o.payment==='confirmed')el.innerHTML='<button data-action="return">반품 요청</button>';
    if(o.status==='received'&&o.payment==='awaiting_payment')el.insertAdjacentHTML('beforebegin',`<p class="notice">입금 안내\n${esc(s.bankInfo)}</p>`);
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      requestOrder={...o,action:b.dataset.action};
      $('#request-title').textContent=b.dataset.action==='cancel'?'취소 요청':'반품 요청';
      $('#reason').value='';$('#request-error').textContent='';$('#request-dialog').showModal();
    });
  });
}

$('#load-retry').onclick=load;
$('#close-dialog').onclick=()=>$('#request-dialog').close();
$('#request-form').onsubmit=async e=>{
  e.preventDefault();if(requestSaving)return;
  const b=e.target.querySelector('.primary');requestSaving=true;b.disabled=true;
  try{
    await api('/api/shop',{id:requestOrder.id,revision:requestOrder.revision,action:requestOrder.action,note:$('#reason').value});
    $('#request-dialog').close();
    if(await load())status('요청을 접수했습니다. 주문 상태를 확인해 주세요.');
  }catch(err){$('#request-error').textContent=err.message}finally{requestSaving=false;b.disabled=false}
};
load();
