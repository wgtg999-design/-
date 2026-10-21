(() => {
 'use strict';
 let dialog,frame,opener;
 function close(){if(!dialog?.open)return;dialog.close();frame?.remove();frame=null;document.documentElement.classList.remove('tryon-is-open');opener?.focus();}
 function open(product){
  if(dialog?.open)return;
  opener=document.activeElement;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='tryon-dialog';dialog.setAttribute('aria-label','AI 가상 피팅');dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog)close();});document.body.append(dialog);}
  frame=document.createElement('iframe');frame.title='AI VIRTUAL TRY-ON';frame.referrerPolicy='no-referrer';frame.src='/try-on'+(product?'?product='+encodeURIComponent(product):'');dialog.replaceChildren(frame);dialog.showModal();document.documentElement.classList.add('tryon-is-open');frame.focus();
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-tryon]');if(!button)return;event.preventDefault();open(button.dataset.tryon||'');});
 window.addEventListener('message',event=>{
  if(!dialog?.open||event.origin!==location.origin||event.source!==frame?.contentWindow||!event.data||typeof event.data!=='object')return;
  if(event.data.type==='store:tryon:close')close();
  if(event.data.type==='store:tryon:cart'&&typeof event.data.productId==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(event.data.productId)){const id=event.data.productId;close();window.dispatchEvent(new CustomEvent('store:tryon-cart',{detail:{id}}));}
 });
})();
