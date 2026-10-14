import './i18n.js';

const I=window.StoreI18n;
export const $=s=>document.querySelector(s);
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const won=n=>I.currencyKRW(n);
export const names={received:'주문 접수',preparing:'배송 준비',shipped:'배송 중',delivered:'배송 완료',cancel_requested:'취소 요청',return_requested:'반품 요청',return_approved:'반품 승인 · 회수 대기',cancelled:'취소 완료',returned:'반품 회수 완료',awaiting_payment:'입금 대기',confirmed:'입금 확인',refund_pending:'환불 처리 대기',refunded:'환불 완료 기록'};
export const translatedText=(key,params)=>`<span data-i18n="${key}"${params?' data-i18n-params="'+esc(JSON.stringify(params))+'"':''}>${esc(I.t(key,params))}</span>`;
export const priceHtml=n=>`<span data-krw="${Number(n)}">${esc(won(n))}</span>`;
export const orderDate=value=>new Date(value).toLocaleString(I.getLanguage());

function requestError(key,statusCode,original){
 const e=Error(original?I.translateError(original):I.t(key));
 e.messageKey=original?null:key;e.originalMessage=original;e.status=statusCode;
 return e;
}

export async function api(url,body){
 let r;try{r=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})}catch{throw requestError('status.network')}
 let d;try{d=await r.json()}catch{throw requestError(r.status===401?'status.session':'status.response',r.status)}
 if(!r.ok)throw requestError(r.status===401?'status.session':'status.failed',r.status,d?.error);
 return d;
}
export const status=(msg,error=false)=>{$('#status').textContent=msg;$('#status').classList.toggle('error',error)};
export function orderHtml(o,admin=false){
 const a=o.address;
 const text=(key,korean,params)=>admin?esc(korean):translatedText(key,params);
 const amount=n=>admin?esc(won(n)):priceHtml(n);
 const state=value=>names[value]?(admin?esc(names[value]):translatedText('order.'+value)):esc(value);
 const date=admin?new Date(o.created_at).toLocaleString('ko-KR'):orderDate(o.created_at);
 return `<article class="order"><div class="order-head"><div class="order-id">${esc(o.id)}<p class="muted" ${admin?'':'data-order-date="'+esc(o.created_at)+'"'}>${esc(date)}</p></div><div><span class="badge">${state(o.status)}</span> <span class="badge attention">${state(o.payment)}</span></div></div>${o.items.map(i=>`<div class="line"><span>${esc(i.name)} <small>${esc(i.color)} / ${esc(i.size)} × ${i.qty}</small></span><span>${amount(i.price*i.qty)}</span></div>`).join('')}<div class="line"><span>${text('order.shipping','배송비')}</span><span>${amount(o.shipping_fee)}</span></div><div class="line total"><span>${text('order.amount','주문 금액')}</span><strong>${amount(o.total)}</strong></div><details><summary>${text('order.deliveryAddress','배송지 확인')}</summary><div class="address">${esc(a.name)} · ${esc(a.phone)}<br>(${esc(a.postcode)}) ${esc(a.line1)} ${esc(a.line2)}<br>${esc(a.memo)}</div></details>${o.tracking?`<p class="notice">${esc(o.carrier)} · ${esc(o.tracking)}<br>${text('order.trackingNotice','배송 상태는 관리자 확인으로 갱신됩니다.')}</p>`:''}${o.payment==='refunded'?`<p class="muted">${text('order.refundRecord','환불 처리 기록: '+o.refund_ref,{reference:o.refund_ref})}</p>`:''}<div class="actions" data-order="${esc(o.id)}"></div></article>`;
}
