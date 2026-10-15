/* Extends the existing authenticated editor and revision-checked save. */
function homepageDefaults(){
  content.homepage??={banners:content.heroImages.map(()=>({href:'',mobileImage:null})),slider01:content.products.filter(p=>p.visible).slice(0,10).map(p=>p.id),campaign:{image:null,mobileImage:null},journals:window.StoreJournal.entries()};
  content.homepage.campaign=window.StoreCampaign.settings(content.homepage.campaign);
  content.homepage.journals=window.StoreJournal.entries(content.homepage.journals);
  return content.homepage;
}
function renderHomepageEditor(){
  const h=homepageDefaults();
  const upload=(group,index,key,label,source)=>`<div>${source?`<img src="${esc(source)}" alt="${label}" style="width:120px;max-height:150px;object-fit:contain">`:''}<label class="button">${label}<input hidden type="file" accept="image/jpeg,image/png,image/webp" data-home-upload="${group}" data-home-index="${index}" data-home-key="${key}"></label>${source?`<button type="button" data-home-remove="${group}" data-home-index="${index}" data-home-key="${key}">${group==='journals'?'기본 사진으로 복원':'사진 제거'}</button>`:''}</div>`;
  const panel=document.querySelector('#homepage-editor');
  panel.innerHTML=`<h2>메인페이지 구성</h2><h3>배너별 모바일 이미지</h3>${content.heroImages.map((_,i)=>`<div class="fields"><p>배너 ${i+1} · 연결: /shop</p>${upload('banners',i,'mobileImage','모바일 배너',h.banners[i]?.mobileImage)}</div>`).join('')}<p>메인 배너는 모두 SHOP ALL (/shop)로 이동합니다. PC 사진은 위의 메인 사진에서, 모바일 사진은 여기서 교체하세요.</p>
  ${['slider01'].map((key,i)=>`<h3>PRODUCT SLIDER 0${i+1}</h3><label>상품 ID를 표시할 순서대로 쉼표로 입력 (최대 10개)<input data-home-slider="${key}" value="${esc(h[key].join(', '))}"></label><div class="slider-selection">${content.products.map(p=>`<label><input type="checkbox" data-slider-select="${esc(p.id)}" ${h.slider01.includes(p.id)?'checked':''}>${esc(p.name)}${p.visible?'':' (숨김)'}</label>`).join('')}</div><ol>${h.slider01.map((id,index)=>`<li>${esc(content.products.find(p=>p.id===id)?.name||id)} <button type="button" data-slider-move="${index}" data-direction="-1" ${index===0?'disabled':''}>↑</button><button type="button" data-slider-move="${index}" data-direction="1" ${index===h.slider01.length-1?'disabled':''}>↓</button><button type="button" data-slider-delete="${index}">제거</button></li>`).join('')}</ol>`).join('')}
  <h3>EDITORIAL CAMPAIGN</h3><label><input type="checkbox" data-home-field="campaign" data-home-index="0" data-home-key="enabled" ${h.campaign.enabled!==false?'checked':''}>캠페인 표시</label><p>전달받은 흑백 캠페인 원본이 기본으로 표시됩니다. 다른 사진으로 교체하거나 표시를 끌 수 있습니다.</p>${upload('campaign',0,'image','PC 캠페인',h.campaign.image)}${upload('campaign',0,'mobileImage','모바일 캠페인',h.campaign.mobileImage)}
  <h3>COLLECTION JOURNAL</h3>${h.journals.map((entry,i)=>`<div class="fields"><label>카테고리 ${i+1}<select data-home-field="journals" data-home-index="${i}" data-home-key="category">${['OUTER','TSHIRT','BOTTOMS','TOPS','KNITWEAR','HOODIES','ACC'].map(cat=>`<option ${cat===entry.category?'selected':''}>${cat}</option>`).join('')}</select></label>${upload('journals',i,'image','PC 카테고리 이미지',entry.image)}${upload('journals',i,'mobileImage','모바일 카테고리 이미지',entry.mobileImage)}</div>`).join('')}`;
}
function homeTarget(group,index){const h=homepageDefaults();return group==='campaign'?h.campaign:(h[group][index]??={href:'',mobileImage:null})}
document.addEventListener('input',event=>{
  if(!content||busy)return;const el=event.target;
  if(el.dataset.homeField){homeTarget(el.dataset.homeField,Number(el.dataset.homeIndex))[el.dataset.homeKey]=el.type==='checkbox'?el.checked:el.value;mark()}
  if(el.dataset.homeSlider){const ids=el.value.split(',').map(s=>s.trim()).filter(Boolean);if(ids.length>10||new Set(ids).size!==ids.length||ids.some(id=>!content.products.some(p=>p.id===id))){el.setCustomValidity('중복 없이 등록된 상품 ID를 최대 10개 입력하세요.');status('슬라이더 상품 ID를 확인해 주세요.',true);return}el.setCustomValidity('');homepageDefaults()[el.dataset.homeSlider]=ids;mark()}
});
document.addEventListener('click',event=>{const el=event.target.closest('[data-home-remove]');if(!el||busy||!content)return;const target=homeTarget(el.dataset.homeRemove,Number(el.dataset.homeIndex));target[el.dataset.homeKey]=null;if(el.dataset.homeRemove==='campaign'&&el.dataset.homeKey==='image')target.enabled=false;mark();renderHomepageEditor()});
document.addEventListener('change',async event=>{
  const el=event.target;if(!el.dataset.homeUpload||!el.files?.[0]||!content||busy)return;
  const file=el.files[0];el.value='';if(file.size>8*1024*1024){status('사진은 최대 8MB입니다.',true);return}
  busyState(true);status('사진 업로드 중…');
  try{const data=await (window.StoreUpload?window.StoreUpload(file):api('/api/admin/upload',{method:'POST',headers:{'Content-Type':file.type},body:file}));const target=homeTarget(el.dataset.homeUpload,Number(el.dataset.homeIndex));target[el.dataset.homeKey]=data.url;if(el.dataset.homeUpload==='campaign'&&el.dataset.homeKey==='image')target.enabled=true;mark();renderHomepageEditor();status('업로드 완료. 변경사항 저장을 눌러 주세요.')}catch(error){status(error.message,true)}finally{busyState(false)}
});

document.addEventListener('change',event=>{const el=event.target;if(!el.dataset.sliderSelect||!content||busy)return;const h=homepageDefaults(),id=el.dataset.sliderSelect;if(el.checked){if(h.slider01.length>=10){el.checked=false;status('메인 슬라이더에는 최대 10개만 선택할 수 있습니다.',true);return;}if(!h.slider01.includes(id))h.slider01.push(id);}else h.slider01=h.slider01.filter(value=>value!==id);mark();renderHomepageEditor();});
document.addEventListener('click',event=>{const el=event.target.closest('[data-slider-move],[data-slider-delete]');if(!el||!content||busy)return;const ids=homepageDefaults().slider01;if(el.dataset.sliderDelete!==undefined)ids.splice(Number(el.dataset.sliderDelete),1);else{const index=Number(el.dataset.sliderMove),next=index+Number(el.dataset.direction);if(next<0||next>=ids.length)return;[ids[index],ids[next]]=[ids[next],ids[index]];}mark();renderHomepageEditor();});
