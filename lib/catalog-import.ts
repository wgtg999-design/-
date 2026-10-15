import {contentSchema,type Content} from './content';
// Supplied ZIP records. Empty variants intentionally block purchase until real data is configured.
export const suppliedProducts:Content['products']=[
  {
    "id": "destroyed-knit-sweater-black",
    "name": "Destroyed Knit Sweater — Black",
    "price": 69000,
    "category": "KNITWEAR",
    "color": "BLACK",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-destroyed-knit-sweater-black.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "distressed-off-shoulder-knit-olive-grey",
    "name": "Distressed Off-Shoulder Knit — Olive Grey",
    "price": 59000,
    "category": "KNITWEAR",
    "color": "OLIVE GREY",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-distressed-off-shoulder-knit-olive-grey.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "heavyweight-oversized-zip-hoodie-black",
    "name": "Heavyweight Oversized Zip Hoodie — Black",
    "price": 69000,
    "category": "HOODIES",
    "color": "BLACK",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-heavyweight-oversized-zip-hoodie-black.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "slim-cropped-zip-hoodie-heather-grey",
    "name": "Slim Cropped Zip Hoodie — Heather Grey",
    "price": 49000,
    "category": "HOODIES",
    "color": "HEATHER GREY",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-slim-cropped-zip-hoodie-heather-grey.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "star-stitch-ribbed-tank-top-black",
    "name": "Star Stitch Ribbed Tank Top — Black",
    "price": 29000,
    "category": "TOPS",
    "color": "BLACK",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-star-stitch-ribbed-tank-top-black.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "ice-washed-graphic-layered-tee-blue",
    "name": "Ice Washed Graphic Layered Tee — Blue",
    "price": 49000,
    "category": "TSHIRT",
    "color": "BLUE",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-ice-washed-graphic-layered-tee-blue.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "vintage-washed-gothic-crop-long-sleeve-charcoal",
    "name": "Vintage Washed Gothic Crop Long Sleeve — Charcoal",
    "price": 39000,
    "category": "TOPS",
    "color": "CHARCOAL",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-vintage-washed-gothic-crop-long-sleeve-charcoal.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "thorn-graphic-layered-tee-burgundy",
    "name": "Thorn Graphic Layered Tee — Burgundy",
    "price": 49000,
    "category": "TSHIRT",
    "color": "BURGUNDY",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-thorn-graphic-layered-tee-burgundy.png",
    "crop": "",
    "visible": true
  },
  {
    "id": "vintage-washed-utility-jacket-brown",
    "name": "Vintage Washed Utility Jacket — Brown",
    "price": 109000,
    "category": "OUTER",
    "color": "BROWN",
    "sizes": [],
    "description": "",
    "image": "/assets/clothes-vintage-washed-utility-jacket-brown.png",
    "crop": "",
    "visible": true
  }
];
export function mergeSuppliedProducts(current:Content){
 const existing=new Set(current.products.map(p=>p.id));
 const additions=suppliedProducts.filter(p=>!existing.has(p.id));
 const products=[...current.products,...additions];
 const journalPresets=[{category:'OUTER' as const,image:'/assets/jacket-model-01.png'},{category:'TSHIRT' as const,image:'/assets/clothes-ice-washed-graphic-layered-tee-blue.png'},{category:'BOTTOMS' as const,image:'/assets/denim-model-01.png'}];
 const homepage=current.homepage??{banners:current.heroImages.map(()=>({href:'/shop',mobileImage:null})),slider01:products.filter(p=>p.visible).slice(0,10).map(p=>p.id),campaign:{image:null,mobileImage:null},journals:journalPresets};
 const configured=additions.length?{...homepage,journals:homepage.journals.map((entry,index)=>entry.image?entry:journalPresets[index])}:homepage;
 const content=contentSchema.parse({...current,homepage:configured,products});
 return {content,added:additions.map(p=>p.id),skipped:suppliedProducts.filter(p=>existing.has(p.id)).map(p=>p.id)};
}
