export type Statement={sql:string,args:any[]};
export function createPlan(x:{id:string,userId:string,key:string,lines:string,address:string,total:number,shippingFee:number,catalogRevision:number,settingsRevision:number,now:string}):Statement[]{
 return [{sql:`INSERT INTO shop_orders(id,user_id,request_key,items,address,total,shipping_fee,catalog_revision,settings_revision,last_actor,last_note,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?
 WHERE EXISTS(SELECT 1 FROM shop_customers WHERE user_id=?)
 AND (SELECT count(*) FROM shop_orders WHERE user_id=? AND status='received' AND payment='awaiting_payment')<3
 AND ?=COALESCE((SELECT revision FROM store_content WHERE key='main'),0)
 AND EXISTS(SELECT 1 FROM shop_settings WHERE key='main' AND revision=? AND json_extract(data,'$.accepting')=1)
 AND json_array_length(?)>0
 AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN shop_inventory i ON i.sku=json_extract(j.value,'$.sku') WHERE i.sku IS NULL OR i.enabled!=1 OR i.stock<json_extract(j.value,'$.qty') OR json_extract(j.value,'$.qty')<1 OR json_extract(j.value,'$.qty')>i.max_order)`,args:[x.id,x.userId,x.key,x.lines,x.address,x.total,x.shippingFee,x.catalogRevision,x.settingsRevision,x.userId,'주문 접수 · 무통장 입금 대기',x.now,x.now,x.userId,x.userId,x.catalogRevision,x.settingsRevision,x.lines,x.lines]},
 {sql:`UPDATE shop_inventory SET stock=stock-(SELECT json_extract(j.value,'$.qty') FROM shop_orders o,json_each(o.items) j WHERE o.id=? AND json_extract(j.value,'$.sku')=shop_inventory.sku),revision=revision+1 WHERE sku IN(SELECT json_extract(j.value,'$.sku') FROM shop_orders o,json_each(o.items) j WHERE o.id=?)`,args:[x.id,x.id]},
 {sql:`INSERT INTO shop_events(order_id,actor,action,note,created_at) SELECT id,last_actor,'received',last_note,created_at FROM shop_orders WHERE id=?`,args:[x.id]}];
}
export function updatePlan(o:any,n:any,actor:string,note:string,token:string,now:string):Statement[]{
 const restore=!o.restocked&&(n.status==='cancelled'||(n.status==='returned'&&n.restock===1));
 const result:Statement[]=[{sql:'UPDATE shop_orders SET status=?,payment=?,request_from=?,carrier=?,tracking=?,refund_ref=?,restock=?,restocked=?,last_actor=?,last_note=?,updated_at=?,action_token=?,revision=revision+1 WHERE id=? AND revision=?',args:[n.status,n.payment,n.request_from,n.carrier,n.tracking,n.refund_ref,n.restock,restore?1:o.restocked,actor,note,now,token,o.id,o.revision]}];
 if(restore)result.push({sql:`UPDATE shop_inventory SET stock=stock+(SELECT json_extract(j.value,'$.qty') FROM shop_orders o,json_each(o.items) j WHERE o.id=? AND o.action_token=? AND json_extract(j.value,'$.sku')=shop_inventory.sku),revision=revision+1 WHERE sku IN(SELECT json_extract(j.value,'$.sku') FROM shop_orders o,json_each(o.items) j WHERE o.id=? AND o.action_token=?)`,args:[o.id,token,o.id,token]});
 result.push({sql:`INSERT INTO shop_events(order_id,actor,action,note,created_at) SELECT id,last_actor,status || '/' || payment,last_note,updated_at FROM shop_orders WHERE id=? AND action_token=?`,args:[o.id,token]});return result;
}
