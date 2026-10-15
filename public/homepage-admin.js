/* Extends the existing authenticated editor and revision-checked save. */
function homepageDefaults(){
  content.homepage??={banners:content.heroImages.map(()=>({href:'',mobileImage:null})),slider01:content.products.filter(p=>p.visible).slice(0,10).map(p=>p.id),slider02:content.products.filter(p=>p.visible).slice(0,10).map(p=>p.id),campaign:{image:null,mobileImage:null},journals:['OUTER','TOPS','BOTTOMS'].map(category=>({image:null,mobileImage:null,category}))};
  return content.homepage;
}
function renderHomepageEditor(){
  const h=homepageDefaults();
  const upload=(group,index,key,label,source)=>`<div>${source?`<img src="${esc(source)}" alt="${label}" style="width:120px;max-height:150px;object-fit:contain">`:''}<label class="button">${label}<input hidden type="file" accept="image/jpeg,image/png,image/webp" data-home-upload="${group}" data-home-index="${index}" data-home-key="${key}"></label>${source?`<button type="button" data-home-remove="${group}" data-home-index="${index}" data-home-key="${key}">사진 제거</button>`:''}</div>`;
  const panel=document.querySelector('#homepage-editor');
  panel.innerHTML=`<h2>메인페이지 구성</h2><h3>배너별 링크 / 모바일 이미지</h3>${content.heroImages.map((_,i)=>`<div class="fields"><label>배너 ${i+1} 연결 주소<input maxlength="300" placeholder="/?category=OUTER#shop" data-home-field="banners" data-home-index="${i}" data-home-key="href" value="${esc(h.banners[i]?.href||'')}"></label>${upload('banners',i,'mobileImage','모바일 배너',h.banners[i]?.mobileImage)}</div>`).join('')}<p>상품 연결 예: /?product=jacket · 카테고리 연결 예: /?category=OUTER#shop. 사이트 내부 주소만 등록할 수 있습니다. 비워 두면 첫 상품 영역으로 이동합니다.</p>
  ${['slider01','slider02'].map((key,i)=>`<h3>PRODUCT SLIDER 0${i+1}</h3><label>상품 ID를 표시할 순서대로 쉼표로 입력 (최대 10개)<input data-home-slider="${key}" value="${esc(h[key].join(', '))}"></label><p>${content.products.map(p=>`${esc(p.id)}: ${esc(p.name)}${p.visible?'':' (숨김)'}`).join(' / ')}</p>`).join('')}
  <h3>EDITORIAL CAMPAIGN</h3><p>확정된 캠페인 원본만 등록하세요. PC 이미지가 없으면 영역은 표시하지 않습니다.</p>${upload('campaign',0,'image','PC 캠페인',h.campaign.image)}${upload('campaign',0,'mobileImage','모바일 캠페인',h.campaign.mobileImage)}
  <h3>COLLECTION JOURNAL</h3>${h.journals.map((entry,i)=>`<div class="fields"><label>카테고리 ${i+1}<select data-home-field="journals" data-home-index="${i}" data-home-key="category">${['OUTER','TOPS','BOTTOMS','ACC'].map(cat=>`<option ${cat===entry.category?'selected':''}>${cat}</option>`).join('')}</select></label>${upload('journals',i,'image','PC 카테고리 이미지',entry.image)}${upload('journals',i,'mobileImage','모바일 카테고리 이미지',entry.mobileImage)}</div>`).join('')}`;
}
function homeTarget(group,index){const h=homepageDefaults();return group==='campaign'?h.campaign:(h[group][index]??={href:'',mobileImage:null})}
document.addEventListener('input',event=>{
  if(!content||busy)return;const el=event.target;
  if(el.dataset.homeField){homeTarget(el.dataset.homeField,Number(el.dataset.homeIndex))[el.dataset.homeKey]=el.value;mark()}
  if(el.dataset.homeSlider){const ids=el.value.split(',').map(s=>s.trim()).filter(Boolean);if(ids.length>10||new Set(ids).size!==ids.length||ids.some(id=>!content.products.some(p=>p.id===id))){el.setCustomValidity('중복 없이 등록된 상품 ID를 최대 10개 입력하세요.');status('슬라이더 상품 ID를 확인해 주세요.',true);return}el.setCustomValidity('');homepageDefaults()[el.dataset.homeSlider]=ids;mark()}
});
document.addEventListener('click',event=>{const el=event.target.closest('[data-home-remove]');if(!el||busy||!content)return;homeTarget(el.dataset.homeRemove,Number(el.dataset.homeIndex))[el.dataset.homeKey]=null;mark();renderHomepageEditor()});
document.addEventListener('change',async event=>{
  const el=event.target;if(!el.dataset.homeUpload||!el.files?.[0]||!content||busy)return;
  const file=el.files[0];el.value='';if(file.size>8*1024*1024){status('사진은 최대 8MB입니다.',true);return}
  busyState(true);status('사진 업로드 중…');
  try{const data=await (window.StoreUpload?window.StoreUpload(file):api('/api/admin/upload',{method:'POST',headers:{'Content-Type':file.type},body:file}));homeTarget(el.dataset.homeUpload,Number(el.dataset.homeIndex))[el.dataset.homeKey]=data.url;mark();renderHomepageEditor();status('업로드 완료. 변경사항 저장을 눌러 주세요.')}catch(error){status(error.message,true)}finally{busyState(false)}
});
