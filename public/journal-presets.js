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
  window.StoreCampaign=Object.freeze({source,settings:campaign});
})();
