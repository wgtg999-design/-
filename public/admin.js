const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const locales=[['ko','한국어'],['zh-CN','简体中文 · 중국어 간체'],['zh-TW','繁體中文 · 중국어 번체'],['ja','日本語 · 일본어']];
const brandFields=[['notice','상단 안내 문구',120],['aboutTitle','소개 제목',100],['aboutText','소개 문구',500]];
const productFields=[['color','색상',50],['description','상품 설명',2000],['sizeGuide','실측·사이즈 안내',4000]];
const productLocales=new Map();
let content,revision=0,dirty=false,busy=false,brandLocale='ko';
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').classList.toggle('error',error)};
function mark(){dirty=true;$('#save-state').textContent='저장하지 않은 변경사항';$('#save').disabled=busy}
function busyState(value){
  busy=value;
  document.querySelectorAll('button,input,textarea,select').forEach(element=>element.disabled=value);
  $('#save').disabled=value||!dirty||!content;
  $('#add-product').disabled=value||!content;
  document.querySelectorAll('[data-action]').forEach(element=>{
    const action=element.dataset.action,index=Number(element.dataset.index),list=action.startsWith('hero')?content?.heroImages:content?.products;
    if(list)element.disabled=value||(action.endsWith('up')&&index===0)||(action.endsWith('down')&&index===list.length-1);
  });
  document.querySelectorAll('[data-key="visible"]').forEach(element=>element.disabled=value||content?.products[Number(element.dataset.product)]?.image==='/assets/product-image-pending.svg');
  document.querySelectorAll('[data-key="modelFocus"],[data-key="modelImageKind"]').forEach(element=>element.disabled=value||!content?.products[Number(element.dataset.product)]?.modelImage);
}
async function api(path,options){
  const response=await fetch(path,{cache:'no-store',...options});
  let data;
  try{data=await response.json()}catch{throw Error('서버 응답을 읽지 못했습니다. 로그인 상태와 연결을 확인하고 다시 시도해 주세요.')}
  if(!response.ok)throw Error(data.error||'요청에 실패했습니다.');
  return data;
}
async function load(){
  busyState(true);
  try{
    const data=await api('/api/admin/content');
    content=window.StoreCampaign.layout(data.content);revision=data.revision;dirty=false;
    render();$('#editor').hidden=false;
    status('대표님 전용 관리자입니다. 저장 전 변경은 홈페이지에 반영되지 않습니다.');
    $('#save-state').textContent=data.updatedAt?'마지막 저장 '+new Date(data.updatedAt).toLocaleString('ko-KR'):'첫 편집을 시작하세요';
  }catch(error){status(error.message,true)}finally{busyState(false)}
}
function visual(source,index,type){
  return `<div class="visual-card"><img src="${esc(source)}" alt="${type==='hero'?'메인':'저널'} 사진 ${index+1}"><div class="visual-actions"><label class="button">사진 교체<input hidden type="file" accept="image/jpeg,image/png,image/webp" data-upload="${type}" data-index="${index}"></label>${type==='hero'?`<button data-action="hero-up" data-index="${index}" ${index===0?'disabled':''}>← 앞쪽</button><button data-action="hero-down" data-index="${index}" ${index===content.heroImages.length-1?'disabled':''}>뒤쪽 →</button><button data-action="hero-remove" data-index="${index}">제거</button>`:''}</div></div>`;
}
function localeOptions(selected){return locales.map(([locale,label])=>`<option value="${locale}" ${locale===selected?'selected':''}>${label}</option>`).join('')}
function translatedFields(target,locale,fields,productIndex){
  return fields.map(([key,label,maxlength])=>{
    const multiline=['aboutText','description','sizeGuide'].includes(key);
    const attributes=productIndex===undefined?`data-brand-translation="${key}"`:`data-product="${productIndex}" data-key="${key}"`;
    const value=target.translations?.[locale]?.[key]??'';
    return `<label class="${multiline?'wide':''}">${label} ${multiline?`<textarea rows="3" maxlength="${maxlength}" ${attributes} data-locale="${locale}">${esc(value)}</textarea>`:`<input maxlength="${maxlength}" ${attributes} data-locale="${locale}" value="${esc(value)}">`}</label>`;
  }).join('');
}
function renderBrandTranslations(){
  $('#brand-locale').value=brandLocale;
  $('#brand-translations').innerHTML=translatedFields(content,brandLocale,brandFields);
}
function productLocale(product){return productLocales.get(product.id)||'ko'}
function modelPhoto(product,index){
  const focus=product.modelFocus||'center';
  return `<div class="model-photo-editor"><h3>착용 사진 (선택)</h3>${product.modelImage?`<img class="model-photo-preview" src="${esc(product.modelImage)}" data-focus="${esc(focus)}" alt="${esc(product.name)} 착용 사진">`:'<p class="model-photo-empty">착용 사진을 등록하면 상품에 커서를 올릴 때 이 사진으로 전환됩니다.</p>'}<div class="visual-actions"><label class="button">${product.modelImage?'착용 사진 교체':'착용 사진 등록'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" data-upload="model" data-index="${index}"></label>${product.modelImage?`<button type="button" data-action="model-remove" data-index="${index}">착용 사진 제거</button>`:''}</div><label class="model-focus-label">착용 사진 중심<select data-product="${index}" data-key="modelFocus" ${product.modelImage?'':'disabled'}>${[['center','전체 · 중앙'],['upper','상의 중심'],['lower','하의 중심']].map(([value,label])=>`<option value="${value}" ${focus===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="model-kind-label">착용 이미지 종류<select data-product="${index}" data-key="modelImageKind" ${product.modelImage?'':'disabled'}><option value="photo" ${product.modelImageKind!=='generated'?'selected':''}>실제 사진</option><option value="generated" ${product.modelImageKind==='generated'?'selected':''}>AI 착용 시안</option></select></label><p class="editor-help">AI 시안은 고객 화면에 표시됩니다. 이 상품에 맞는 착용 이미지를 올려 주세요. JPG·PNG·WebP, 최대 8MB. 저장 후 홈페이지에 반영됩니다.</p></div>`;
}
function tryOnPhoto(product,index){
  return `<div class="tryon-photo-editor"><h3>AI 피팅용 상품 사진 (선택)</h3><p class="editor-help">별도 사진이 없으면 기본 상품 사진을 사용합니다. 한 벌만 정면으로 보이는 사진을 권장합니다. 고객이 올리는 사진과는 별개입니다.</p>${product.tryOnImage?`<img class="tryon-garment-preview" src="${esc(product.tryOnImage)}" alt="피팅용 의류 사진">`:''}<div class="visual-actions"><label class="button">피팅용 사진 등록<input type="file" hidden accept="image/jpeg,image/png,image/webp" data-upload="tryon" data-index="${index}"></label>${product.tryOnImage?`<button type="button" data-action="tryon-remove" data-index="${index}">피팅용 사진 제거</button>`:''}</div><label><input type="checkbox" data-product="${index}" data-key="tryOnEnabled" ${product.tryOnEnabled!==false?'checked':''}>이 상품 가상 피팅 허용</label><label>교체할 의류<select data-product="${index}" data-key="tryOnCategory"><option value="">상품 분류에 따라 자동 지정</option><option value="tops" ${product.tryOnCategory==='tops'?'selected':''}>상의</option><option value="bottoms" ${product.tryOnCategory==='bottoms'?'selected':''}>하의</option></select></label></div>`;
}
function productCard(product,index){
  const locale=productLocale(product);
  return `<article class="product-card">${!product.sizes.length?'<p class="editor-help wide">옵션 미등록 · 구매 불가. 실제 사이즈를 입력한 뒤 주문·재고 관리에서 재고와 판매 설정을 저장하세요.</p>':''}<div class="product-photo"><h3>기본 상품 사진</h3><div class="photo ${product.image==='/assets/products.png'?'sheet '+product.crop:''}" style="background-image:url('${esc(product.image)}')" role="img" aria-label="상품 사진"></div><div class="visual-actions"><label class="button">사진 교체<input type="file" hidden accept="image/jpeg,image/png,image/webp" data-upload="product" data-index="${index}"></label></div>${modelPhoto(product,index)}${tryOnPhoto(product,index)}</div><div class="product-fields">
<label>상품명 (English)<input data-product="${index}" data-key="name" value="${esc(product.name)}" maxlength="100"></label>
<label>가격 (원)<input type="number" min="0" max="100000000" step="1" data-product="${index}" data-key="price" value="${product.price}"></label>
<label>색상<input data-product="${index}" data-key="color" value="${esc(product.color)}" maxlength="50"></label>
<label>분류<select data-product="${index}" data-key="category">${['OUTER','BOTTOMS','TOPS','ACC','KNITWEAR','HOODIES','TSHIRT','SKIRTS'].map(category=>`<option ${category===product.category?'selected':''}>${category}</option>`).join('')}</select></label>
<label class="wide">실제 사이즈 (쉼표로 구분 · 미정이면 비워 두세요)<input data-product="${index}" data-key="sizes" value="${esc(product.sizes.join(', '))}" placeholder="S, M, L"></label>
<label class="wide">상품 설명<textarea rows="3" maxlength="2000" data-product="${index}" data-key="description">${esc(product.description)}</textarea></label>
<label class="wide">실측·사이즈 안내<textarea rows="4" maxlength="4000" data-product="${index}" data-key="sizeGuide" placeholder="실제 측정한 항목, 단위와 사이즈별 치수를 입력하세요.">${esc(product.sizeGuide)}</textarea></label>
<p class="editor-help wide">실측 안내를 비워 두면 고객에게 ‘사이즈 안내 준비 중’으로 표시합니다. 측정하지 않은 수치는 임의로 넣지 마세요.</p>
<div class="translation-editor wide"><div class="translation-heading"><h3>언어별 상품 정보</h3><label>편집할 언어<select data-product-locale="${index}">${localeOptions(locale)}</select></label></div><p class="editor-help">비워 둔 번역 항목은 기본 상품 정보를 사용합니다.</p><div class="fields" data-product-translations="${index}">${translatedFields(product,locale,productFields,index)}</div></div>
<div class="card-actions"><label><input type="checkbox" data-product="${index}" data-key="visible" ${product.visible?'checked':''} ${product.image==='/assets/product-image-pending.svg'?'disabled':''}>홈페이지에 표시${product.image==='/assets/product-image-pending.svg'?' (기본 사진 필요)':''}</label><label><input type="checkbox" data-product="${index}" data-key="featured" ${product.featured===true?'checked':''}>BEST 운영자 추천</label><button data-action="up" data-index="${index}">↑ 위로</button><button data-action="down" data-index="${index}">↓ 아래로</button><button class="danger" data-action="remove" data-index="${index}">상품 삭제</button></div>
</div></article>`;
}
function render(){
  document.querySelectorAll('[data-field]').forEach(element=>element.value=content[element.dataset.field]);
  document.querySelectorAll('[data-social]').forEach(element=>element.value=content.socialLinks?.[element.dataset.social]??'');
  renderBrandTranslations();
  renderHomepageEditor();
  $('#heroes').innerHTML=content.heroImages.map((source,index)=>visual(source,index,'hero')).join('');
  $('#journal').innerHTML=visual(content.journalImage,0,'journal');
  $('#product-editor').innerHTML=content.products.length?content.products.map(productCard).join(''):'<p class="empty">등록된 상품이 없습니다. 상품 추가를 눌러 주세요.</p>';
  busyState(busy);
}
function setTranslation(target,locale,key,value,fields){
  if(!locales.some(([code])=>code===locale)||!fields.some(([field])=>field===key))return false;
  target.translations??={};target.translations[locale]??={};target.translations[locale][key]=value;
  return true;
}
document.addEventListener('input',event=>{
  if(!content||busy)return;
  const element=event.target;
  if(element.dataset.field){content[element.dataset.field]=element.value;mark();return}
  if(element.dataset.social){
    const key=element.dataset.social;
    if(!['instagram','kakao'].includes(key))return;
    content.socialLinks??={instagram:'',kakao:''};content.socialLinks[key]=element.value;mark();return;
  }
  if(element.dataset.brandTranslation){
    if(setTranslation(content,element.dataset.locale,element.dataset.brandTranslation,element.value,brandFields))mark();
    return;
  }
  if(element.dataset.product!==undefined){
    const product=content.products[Number(element.dataset.product)],key=element.dataset.key;
    if(!product)return;
    if(element.dataset.locale){
      if(setTranslation(product,element.dataset.locale,key,element.value,productFields))mark();
      return;
    }
    if(key==='tryOnCategory'&&!element.value){delete product.tryOnCategory;mark();return;}
    if(key==='modelFocus'){
      if(!product.modelImage||!['upper','lower','center'].includes(element.value))return;
      product.modelFocus=element.value;
      const preview=element.closest('.product-card').querySelector('.model-photo-preview');
      if(preview)preview.dataset.focus=element.value;
      mark();return;
    }
    product[key]=key==='price'?Number(element.value):['visible','featured','tryOnEnabled'].includes(key)?element.checked:key==='sizes'?element.value.split(',').map(size=>size.trim()).filter(Boolean):element.value;
    mark();
  }
});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button||busy||!content)return;
  const index=Number(button.dataset.index),action=button.dataset.action;
  if(action==='remove'){
    if(!confirm('이 상품을 목록에서 삭제할까요? 저장해야 반영됩니다.'))return;
    const [removed]=content.products.splice(index,1);if(removed){productLocales.delete(removed.id);if(content.homepage)for(const key of ['slider01','slider02'])if(content.homepage[key])content.homepage[key]=content.homepage[key].filter(id=>id!==removed.id);}
  }else if(action==='hero-remove'){
    if(content.heroImages.length===1){status('메인 사진은 최소 1장이 필요합니다.',true);return}
    content.heroImages.splice(index,1);
    content.homepage?.banners.splice(index,1);
  }else if(action==='tryon-remove'){content.products[index].tryOnImage=null;
  }else if(action==='model-remove'){
    const product=content.products[index];if(!product)return;
    product.modelImage=null;delete product.modelFocus;delete product.modelImageKind;
  }else{
    const list=action.startsWith('hero')?content.heroImages:content.products,next=index+(action.endsWith('up')?-1:1);
    if(next<0||next>=list.length)return;
    [list[index],list[next]]=[list[next],list[index]];
    if(action.startsWith('hero')&&content.homepage){const rows=content.homepage.banners;[rows[index],rows[next]]=[rows[next],rows[index]];}
  }
  mark();render();
});
document.addEventListener('change',async event=>{
  const element=event.target;
  if(!content||busy)return;
  if(element.id==='brand-locale'){
    if(locales.some(([code])=>code===element.value)){brandLocale=element.value;renderBrandTranslations();busyState(busy)}
    return;
  }
  if(element.dataset.productLocale!==undefined){
    const index=Number(element.dataset.productLocale),product=content.products[index];
    if(product&&locales.some(([code])=>code===element.value)){
      productLocales.set(product.id,element.value);
      document.querySelector(`[data-product-translations="${index}"]`).innerHTML=translatedFields(product,element.value,productFields,index);
      busyState(busy);
    }
    return;
  }
  if(!element.dataset.upload||!element.files?.[0])return;
  const file=element.files[0];element.value='';
  const type=element.dataset.upload,index=element.dataset.index===undefined?null:Number(element.dataset.index);
  if(!['hero','journal','product','model','tryon'].includes(type))return;
  if(['product','model','tryon'].includes(type)&&!content.products[index])return;
  if(file.size>8*1024*1024){status('사진은 8MB 이하로 올려주세요.',true);return}
  if(type==='hero'&&index===null&&content.heroImages.length>=5){status('메인 사진은 최대 5장까지 등록할 수 있습니다.',true);return}
  busyState(true);status('사진을 업로드하고 있습니다…');
  try{
    const data=await api('/api/admin/upload',{method:'POST',headers:{'Content-Type':file.type},body:file});
    if(type==='hero'){if(index===null){content.heroImages.push(data.url);content.homepage?.banners.push({href:'',mobileImage:null});}else content.heroImages[index]=data.url}
    else if(type==='journal')content.journalImage=data.url;
    else if(type==='tryon'){content.products[index].tryOnImage=data.url}
    else if(type==='model'){content.products[index].modelImage=data.url;content.products[index].modelFocus??='center';content.products[index].modelImageKind='photo'}
    else{const product=content.products[index];if(product.modelImageKind==='generated'){product.modelImage=null;delete product.modelFocus;delete product.modelImageKind;}product.image=data.url;product.crop=''}
    mark();render();status('사진 업로드 완료. 변경사항 저장을 누르면 홈페이지에 반영됩니다.');
  }catch(error){status(error.message,true)}finally{busyState(false)}
});
$('#add-product').onclick=()=>{
  if(busy||!content)return;
  if(content.products.length>=100){status('상품은 최대 100개까지 등록할 수 있습니다.',true);return}
  content.products.unshift({id:crypto.randomUUID(),name:'New Product',price:0,color:'',category:'TOPS',sizes:[],description:'',image:'/assets/products.png',crop:'',visible:false});
  mark();render();$('#catalog').scrollIntoView();
};
$('#save').onclick=async()=>{
  if(busy||!content||!dirty)return;
  if(content.products.some(p=>!/[A-Za-z]/.test(p.name)||!/^[\x20-\x7E\u2010-\u2015\u2018-\u201D]+$/.test(p.name))){status('상품명은 영어로 입력하세요.',true);return;}
  if(document.querySelector(':invalid')){document.querySelector(':invalid').reportValidity();return;}
  busyState(true);status('변경사항을 저장하고 있습니다…');
  try{
    const data=await api('/api/admin/content',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,revision})});
    revision=data.revision;dirty=false;
    $('#save-state').textContent='저장 완료 · '+new Date(data.updatedAt).toLocaleTimeString('ko-KR');
    status('저장했습니다. 홈페이지 보기에서 새로고침하면 변경 내용이 반영됩니다.');
  }catch(error){status(error.message,true)}finally{busyState(false)}
};
$('#reload').onclick=()=>{if(!busy&&(!dirty||confirm('저장하지 않은 편집 내용을 버리고 다시 불러올까요?')))load()};
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue=''}});
load();

$('#import-supplied').onclick=async()=>{
 if(busy||!content)return;
 if(dirty){status('편집 중인 내용을 먼저 저장하거나 다시 불러온 뒤 가져오세요.',true);return;}
 busyState(true);status('제공된 9개 상품을 안전하게 가져오는 중…');
 try{const result=await api('/api/admin/catalog-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision})});await load();status(`새 상품 ${result.added.length}개 저장 · 기존 상품 ${result.skipped.length}개 유지. 실제 옵션과 재고를 입력하기 전에는 구매할 수 없습니다.`);}catch(error){status(error.message,true)}finally{busyState(false)}
};

$('#preview-homepage').onclick=()=>{
 if(!content||busy)return;
 const invalid=document.querySelector(':invalid');if(invalid){invalid.reportValidity();return;}
 const form=document.createElement('form');form.method='POST';form.action='/admin/preview';form.target='_blank';form.hidden=true;
 const field=document.createElement('input');field.name='content';field.value=JSON.stringify(content);form.append(field);document.body.append(form);form.submit();form.remove();
};

$('#import-bottoms').onclick=async()=>{
 if(busy||!content)return;if(dirty){status('편집 내용을 먼저 저장하거나 다시 불러온 뒤 가져오세요.',true);return;}
 busyState(true);status('번호에 맞춘 하의 12개 상품을 가져오는 중…');
 try{const result=await api('/api/admin/catalog-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,batch:'bottoms-12'})});await load();status(`새 상품 ${result.added.length}개 저장 · 기존 ${result.skipped.length}개 유지. 기본 사진이 없는 상품은 숨김 초안이며, 실제 옵션과 재고가 있어야 구매할 수 있습니다.`);}catch(error){status(error.message,true)}finally{busyState(false)}
};
