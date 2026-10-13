export type OrderState={status:string,payment:string,request_from:string,carrier:string,tracking:string,refund_ref:string,restock:number};
export function transition(o:OrderState,action:string,admin:boolean,b:{note?:string,carrier?:string,tracking?:string,refundRef?:string,restock?:boolean,confirmed?:boolean}){
 const next={status:o.status,payment:o.payment,request_from:o.request_from,carrier:o.carrier,tracking:o.tracking,refund_ref:o.refund_ref,restock:o.restock};
 const fail=()=>{throw Error('현재 주문 상태에서 처리할 수 없습니다. 새로고침 후 확인하세요.')};
 if(action==='cancel'&&!admin){if(!['received','preparing'].includes(o.status))fail();if(o.payment==='awaiting_payment')next.status='cancelled';else if(o.payment==='confirmed'){next.request_from=o.status;next.status='cancel_requested'}else fail()}
 else if(action==='return'&&!admin){if(!['shipped','delivered'].includes(o.status)||o.payment!=='confirmed')fail();next.request_from=o.status;next.status='return_requested'}
 else if(!admin)fail();
 else if(action==='confirm_payment'){if(o.status!=='received'||o.payment!=='awaiting_payment'||!b.confirmed)fail();next.payment='confirmed';next.status='preparing'}
 else if(action==='ship'){if(o.status!=='preparing'||o.payment!=='confirmed')fail();if(!b.carrier?.trim()||!b.tracking?.trim())throw Error('택배사와 송장번호가 필요합니다.');next.status='shipped';next.carrier=b.carrier.trim();next.tracking=b.tracking.trim()}
 else if(action==='deliver'){if(o.status!=='shipped')fail();next.status='delivered'}
 else if(action==='cancel'){if(!['received','preparing','cancel_requested'].includes(o.status))fail();next.status='cancelled';if(o.payment==='confirmed')next.payment='refund_pending'}
 else if(action==='reject_request'){if(!['cancel_requested','return_requested'].includes(o.status))fail();if(!['received','preparing','shipped','delivered'].includes(o.request_from))fail();next.status=o.request_from}
 else if(action==='approve_return'){if(o.status!=='return_requested')fail();next.status='return_approved'}
 else if(action==='receive_return'){if(o.status!=='return_approved'||!b.confirmed)fail();next.status='returned';next.restock=b.restock?1:0;next.payment='refund_pending'}
 else if(action==='confirm_refund'){if(!['cancelled','returned'].includes(o.status)||o.payment!=='refund_pending'||!b.confirmed)fail();if(!b.refundRef?.trim())throw Error('실제 환불 후 이체 확인번호 또는 처리 기록을 입력하세요.');next.payment='refunded';next.refund_ref=b.refundRef.trim()}
 else fail();
 return next;
}
