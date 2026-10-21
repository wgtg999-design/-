import { isOwner } from '../../../lib/admin';
import TryOnAdmin from './TryOnAdmin';
export const dynamic='force-dynamic';
export const metadata={title:'AI 피팅 관리 — Street Label',robots:{index:false,follow:false}};
export default async function TryOnAdminPage(){
 if(!await isOwner())return <main style={{padding:32}}><h1>관리자 계정만 접근할 수 있습니다.</h1><a href="/auth/sign-in?next=%2Fadmin%2Ftry-on">대표님 계정으로 로그인</a></main>;
 return <TryOnAdmin/>;
}
