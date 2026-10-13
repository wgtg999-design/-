export const $=s=>document.querySelector(s);
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const won=n=>'₩'+Number(n).toLocaleString('ko-KR');
export const names={received:'주문 접수',preparing:'배송 준비',shipped:'배송 중',delivered:'배송 완료',cancel_requested:'취소 요청',return_requested:'반품 요청',return_approved:'반품 승인 · 회수 대기',cancelled:'취소 완료',returned:'반품 회수 완료',awaiting_payment:'입금 대기',confirmed:'입금 확인',refund_pending:'환불 처리 대기',refunded:'환불 완료 기록'};
export async function api(url,body){
 let r;try{r=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})}catch{throw Error('서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.')}
 let d;try{d=await r.json()}catch{const e=Error(r.status===401?'로그인이 만료되었습니다. ChatGPT로 다시 로그인해 주세요.':'서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');e.status=r.status;throw e}
 if(!r.ok){const e=Error(d?.error||(r.status===401?'로그인이 만료되었습니다. ChatGPT로 다시 로그인해 주세요.':'요청을 처리하지 못했습니다. 다시 시도해 주세요.'));e.status=r.status;throw e}
 return d;
}
export const status=(msg,error=false)=>{$('#status').textContent=msg;$('#status').classList.toggle('error',error)};
export function orderHtml(o,admin=false){const a=o.address;return `<article class="order"><div class="order-head"><div class="order-id">${esc(o.id)}<p class="muted">${new Date(o.created_at).toLocaleString('ko-KR')}</p></div><div><span class="badge">${names[o.status]||esc(o.status)}</span> <span class="badge attention">${names[o.payment]||esc(o.payment)}</span></div></div>${o.items.map(i=>`<div class="line"><span>${esc(i.name)} <small>${esc(i.color)} / ${esc(i.size)} × ${i.qty}</small></span><span>${won(i.price*i.qty)}</span></div>`).join('')}<div class="line"><span>배송비</span><span>${won(o.shipping_fee)}</span></div><div class="line total"><span>주문 금액</span><strong>${won(o.total)}</strong></div><details><summary>배송지 확인</summary><div class="address">${esc(a.name)} · ${esc(a.phone)}<br>(${esc(a.postcode)}) ${esc(a.line1)} ${esc(a.line2)}<br>${esc(a.memo)}</div></details>${o.tracking?`<p class="notice">${esc(o.carrier)} · 송장번호 ${esc(o.tracking)}<br>배송 상태는 관리자 확인으로 갱신됩니다.</p>`:''}${o.payment==='refunded'?`<p class="muted">환불 처리 기록: ${esc(o.refund_ref)}</p>`:''}<div class="actions" data-order="${esc(o.id)}"></div></article>`}
