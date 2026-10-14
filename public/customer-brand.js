(function(global){
  'use strict';
  if(global.StoreBrand)return;
  let brand='YOUR LABEL',contentPromise;
  function refreshTitle(){
    const title=global.document?.querySelector('title[data-store-title]');
    if(title&&global.StoreI18n)title.textContent=global.StoreI18n.t(title.dataset.storeTitle,{brand});
  }
  function apply(content){
    if(typeof content?.brand==='string'&&content.brand.trim())brand=content.brand.trim();
    global.document?.querySelectorAll('[data-store-brand]').forEach(el=>{el.textContent=brand});
    refreshTitle();
    return content;
  }
  function failure(key){
    const e=Error(global.StoreI18n?global.StoreI18n.t(key):'브랜드 정보를 불러오지 못했습니다.');
    e.messageKey=key;
    return e;
  }
  function load(){
    if(!contentPromise){
      contentPromise=(async()=>{
        let response;try{response=await global.fetch('/api/content',{cache:'no-store'})}catch{throw failure('status.network')}
        if(!response.ok)throw failure('status.response');
        let data;try{data=await response.json()}catch{throw failure('status.response')}
        if(!data?.content||!Array.isArray(data.content.products))throw failure('status.response');
        return apply(data.content);
      })();
      // A failed brand lookup keeps the placeholder and can be retried later.
      contentPromise.catch(()=>{contentPromise=undefined});
    }
    return contentPromise;
  }
  global.StoreBrand=Object.freeze({load,apply,refreshTitle,getBrand:()=>brand});
  global.addEventListener('street-label:languagechange',refreshTitle);
  async function loadPublicPolicyLinks(){
    const links=global.document?.querySelector('#public-policy-links');
    if(!links)return;
    try{
      const response=await global.fetch('/api/policies',{cache:'no-store'});
      if(!response.ok)return;
      const policy=await response.json();
      if(policy.terms==='/policies/terms'&&policy.privacy==='/policies/privacy')links.hidden=false;
    }catch{ /* Public documents do not authenticate or register a member. */ }
  }
  apply();
  load().catch(()=>{});loadPublicPolicyLinks();
})(window);
