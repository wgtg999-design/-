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
  function layout(content) {
    if(content.homepage?.mediaLayout==='swapped-v1'||content.heroImages[0]!=='/assets/campaign-wide.png'||campaign(content.homepage?.campaign).image!==source)return content;
    const home=content.homepage||{banners:content.heroImages.map(()=>({href:'/shop',mobileImage:null})),slider01:content.products.filter(p=>p.visible).slice(0,10).map(p=>p.id),journals:entries()};
    const previous=campaign(home.campaign),banners=home.banners.map(item=>({...item}));
    const first=banners[0];if(first)first.mobileImage=previous.mobileImage;
    return {...content,heroImages:[source,...content.heroImages.slice(1)],homepage:{...home,mediaLayout:'swapped-v1',banners,campaign:{...previous,image:content.heroImages[0],mobileImage:home.banners[0]?.mobileImage||null}}};
  }
  window.StoreCampaign=Object.freeze({source,settings:campaign,layout});
})();
