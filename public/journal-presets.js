/* Approved supplied assets. Missing journal settings never remove navigation. */
(() => {
  const presets = [
    {category:'OUTER',image:'/assets/jacket-model-01.png'},
    {category:'TSHIRT',image:'/assets/clothes-ice-washed-graphic-layered-tee-blue.png'},
    {category:'BOTTOMS',image:'/assets/denim-model-01.png'}
  ];
  function entries(saved) {
    return presets.map((preset,index) => {
      const entry=saved?.[index];
      return {...preset,...entry,
        category:index===1&&entry?.category==='TOPS'?'TSHIRT':entry?.category||preset.category,
        image:entry?.image||preset.image};
    });
  }
  window.StoreJournal=Object.freeze({entries});
  const source='/assets/editorial-brutalist-monochrome.png';
  function campaign(saved) {
    const enabled=saved?.enabled!==false;
    return {image:saved?.image||(enabled?source:null),mobileImage:saved?.mobileImage??null,enabled};
  }
  function legacyLayout(content) {
    if(content.homepage?.banners.some(item=>item.mobileImage||!['','/shop'].includes(item.href)))return content;
    if(['swapped-v1','refined-v2'].includes(content.homepage?.mediaLayout)||content.heroImages[0]!=='/assets/campaign-wide.png'||campaign(content.homepage?.campaign).image!==source)return content;
    const home=content.homepage||{banners:content.heroImages.map(()=>({href:'/shop',mobileImage:null})),slider01:content.products.filter(p=>p.visible).slice(0,10).map(p=>p.id),journals:entries()};
    const previous=campaign(home.campaign),banners=home.banners.map(item=>({...item}));
    const first=banners[0];if(first)first.mobileImage=previous.mobileImage;
    return {...content,heroImages:[source,...content.heroImages.slice(1)],homepage:{...home,mediaLayout:'swapped-v1',banners,campaign:{...previous,image:content.heroImages[0],mobileImage:home.banners[0]?.mobileImage||null}}};
  }
  function refined(content) {
    if(content.homepage?.mediaLayout==='refined-v2')return content;
    const heroes=content.heroImages,home=content.homepage;
    const legacy=heroes.length===2&&heroes[0]==='/assets/campaign-wide.png'&&heroes[1]==='/assets/campaign.png';
    const swapped=heroes.length===2&&heroes[0]===source&&heroes[1]==='/assets/campaign.png'&&home?.campaign?.image==='/assets/campaign-wide.png';
    if((!legacy&&!swapped)||home?.banners.some(item=>item.mobileImage||!['','/shop'].includes(item.href)))return content;
    const original=['jacket','shell','denim','trousers','destroyed-knit-sweater-black','distressed-off-shoulder-knit-olive-grey','heavyweight-oversized-zip-hoodie-black','slim-cropped-zip-hoodie-heather-grey','star-stitch-ribbed-tank-top-black','ice-washed-graphic-layered-tee-blue'];
    const priority=['jacket','eyelet-strap-panel-wide-denim-pants-indigo','destroyed-knit-sweater-black','buckle-panel-cargo-wide-pants-washed-black','heavyweight-oversized-zip-hoodie-black','faded-blue-wide-denim-pants-light-blue','star-stitch-ribbed-tank-top-black','chain-detail-layered-mini-skirt-washed-black','shell','trousers'];
    const available=content.products.filter(product=>product.visible).map(product=>product.id);
    const unchanged=!home||home.slider01.length===original.length&&home.slider01.every((id,index)=>id===original[index]);
    const chosen=[...priority,...available].filter((id,index,all)=>available.includes(id)&&all.indexOf(id)===index).slice(0,10);
    const previous=campaign(home?.campaign);
    const nextCampaign=previous.enabled===false?previous:{...previous,image:swapped?source:previous.image||source};
    const journals=entries(home?.journals).map(entry=>entry.category==='TSHIRT'&&entry.image==='/assets/clothes-ice-washed-graphic-layered-tee-blue.png'?{...entry,image:'/assets/journal-layered-tee-model.png'}:entry);
    return {...content,heroImages:['/assets/editorial-silent-structure.png'],homepage:{...home,mediaLayout:'refined-v2',banners:[{href:'/shop',mobileImage:null}],slider01:unchanged?chosen:home.slider01,campaign:nextCampaign,journals}};
  }
  function layout(content) { const next=refined(content);return next===content?legacyLayout(content):next; }
  window.StoreCampaign=Object.freeze({source,settings:campaign,layout});
})();
