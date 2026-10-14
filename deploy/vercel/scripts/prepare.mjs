import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { migrationPlan, ledger } from './database-tools.mjs';
import { writeInitializationSql } from './initialization-sql.mjs';

const target=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(target,'../..');
if(path.basename(target)!=='vercel'||path.basename(path.dirname(target))!=='deploy')throw Error('Unexpected deployment directory.');

function walk(folder){return fs.existsSync(folder)?fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(folder,entry.name)):[path.join(folder,entry.name)]):[];}
function write(name,content){const file=path.join(target,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
function relative(from,to){let result=path.relative(path.dirname(from),to).split(path.sep).join('/');return result.startsWith('.')?result:'./'+result;}
function emailHtml(html){return html.replaceAll('/signout-with-chatgpt?return_to=','/auth/sign-out?next=').replaceAll('ChatGPT에 로그인','이메일로 로그인').replaceAll('ChatGPT 계정','이메일 계정').replaceAll('ChatGPT로','이메일로').replaceAll('별도 쇼핑몰 비밀번호는 만들지 않습니다.','이메일 인증과 비밀번호 관리는 로그인 서비스에서 제공합니다.');}

// Only these generated folders are removed. The original Sites source and
// server runtime/templates are never edited by this build.
for(const name of ['app','lib','public'])fs.rmSync(path.join(target,name),{recursive:true,force:true});
const migrations=await migrationPlan();
write('lib/initialization-plan.ts','// Generated public schema metadata; no credentials or operating records.\nexport const initializationPlan = '+JSON.stringify({ledger,migrations})+' as const;\n');
for(const name of ['admin','commerce','content','order-sql','order-state','store']){
  const output=path.join(target,'lib',name+'.ts');
  let text=fs.readFileSync(path.join(source,'lib',name+'.ts'),'utf8');
  text=text.replaceAll("'cloudflare:workers'",JSON.stringify(relative(output,path.join(target,'runtime/environment'))));
  if(name==='admin'){
    text="import {isTrustedOrigin} from '../runtime/auth';\n"+text;
    text=text.replace("return req.headers.get('origin')===new URL(req.url).origin;","return isTrustedOrigin(req.headers.get('origin'))&&req.headers.get('origin')===new URL(req.url).origin;");
  }
  if(name==='commerce'){
    const emptySettings="const initial={accepting:false,shippingFee:0,bankInfo:'',support:'',terms:'',privacy:'',returnGuide:''};";
    const loadedSettings='settings:r?settingsSchema.parse(JSON.parse(r.data)):initial,revision:r?.revision||0';
    const saveSettings='const data=settingsSchema.parse(b.settings);';
    if(!text.includes(emptySettings)||!text.includes(loadedSettings)||!text.includes(saveSettings))throw Error('Review changed commerce settings integration.');
    text="import {getDefaultShopSettings,normalizeShopSettingsForMode,isTestSite} from '../runtime/test-site';\n"+text;
    text=text.replace(emptySettings,'const initial=getDefaultShopSettings();');
    text=text.replace(loadedSettings,'settings:normalizeShopSettingsForMode(r?settingsSchema.parse(JSON.parse(r.data)):initial),revision:r?.revision||0,testOnly:isTestSite()');
    text=text.replace(saveSettings,saveSettings+"if(isTestSite()&&data.accepting)throw Error('테스트 사이트에서는 주문 접수를 열 수 없습니다.');");
  }
  write('lib/'+name+'.ts',text);
}
for(const file of walk(path.join(source,'app')).filter(file=>path.basename(file)==='route.ts')){
  const name=path.relative(source,file),output=path.join(target,name);
  let text=fs.readFileSync(file,'utf8');
  text=text.replace(/import (\w+) from ['"]([^'"]+\.html)\?raw['"];?/g,(_,variable,htmlPath)=>{
    let html=emailHtml(fs.readFileSync(path.resolve(path.dirname(file),htmlPath),'utf8'));
    if(htmlPath.endsWith('/admin.html'))html=html.replace(/(<script\b[^>]*src=['"]\/admin\.js['"][^>]*>)/,'<script src="/admin-upload.js" defer></script>\n$1');
    return 'const '+variable+'='+JSON.stringify(html)+';';
  });
  text=text.replaceAll("'cloudflare:workers'",JSON.stringify(relative(output,path.join(target,'runtime/environment'))));
  write(name,"export const runtime='nodejs';\n"+text);
}
write('app/chatgpt-auth.ts',"// Compatibility names; Vercel authenticates verified Clerk sessions.\nexport * from '../runtime/auth';\n");
write('app/layout.tsx',fs.readFileSync(path.join(source,'app/layout.tsx')));
fs.cpSync(path.join(source,'public'),path.join(target,'public'),{recursive:true});

let account=fs.readFileSync(path.join(target,'public/account.js'),'utf8');
if(!account.includes('/signin-with-chatgpt?return_to='))throw Error('Review changed account login integration.');
account=account.replaceAll('/signin-with-chatgpt?return_to=','/auth/sign-in?next=');
write('public/account.js',account);
let admin=fs.readFileSync(path.join(target,'public/admin.js'),'utf8');
const originalUpload="api('/api/admin/upload',{method:'POST',headers:{'Content-Type':file.type},body:file})";
if(!admin.includes(originalUpload))throw Error('Review changed image upload integration.');
write('public/admin.js',admin.replace(originalUpload,'window.StoreUpload(file)'));

const replacements=[value=>value.replaceAll('ChatGPT 계정','이메일 계정').replaceAll('ChatGPT에 로그인','이메일로 로그인').replaceAll('ChatGPT로','이메일로').replaceAll('ChatGPT 로그인','이메일 로그인'),value=>value.replaceAll('ChatGPT','电子邮箱'),value=>value.replaceAll('ChatGPT','電子郵件'),value=>value.replaceAll('ChatGPT','メール')];
const overrides={
  'auth.existing':['이미 가입한 회원은 내 계정으로 연결됩니다. 이메일 인증과 비밀번호 관리는 로그인 서비스에서 제공합니다.','已注册会员将进入我的账户。登录服务提供邮箱验证和密码管理。','已註冊會員將進入我的帳戶。登入服務提供電子郵件驗證與密碼管理。','登録済みの方はマイページへ移動します。メール認証とパスワード管理はログインサービスが提供します。'],
  'auth.method':['이메일 계정 로그인','电子邮箱账号登录','電子郵件帳戶登入','メールアカウントでログイン'],
  'auth.verified':['이메일 인증과 로그인을 확인했습니다. 가입 정보는 이 계정에 연결됩니다.','已确认邮箱验证及登录。注册资料将关联此账户。','已確認電子郵件驗證與登入。註冊資料將關聯此帳戶。','メール認証とログインを確認しました。登録情報はこのアカウントに紐づきます。'],
  'community.accountAnswer':['이메일 인증 후 이름·연락처를 입력하고 약관·개인정보 안내에 동의하면 가입할 수 있습니다. 비밀번호 재설정은 로그인 화면에서 이용합니다.','验证邮箱后，填写姓名和联系方式，并同意条款及个人信息说明，即可完成注册。可在登录页面重置密码。','驗證電子郵件後，填寫姓名和聯絡方式，並同意條款及個人資料說明，即可完成註冊。可在登入頁面重設密碼。','メール認証後、氏名・連絡先を入力し、規約・個人情報の案内に同意すると登録できます。ログイン画面からパスワードを再設定できます。']
};
let dictionary=fs.readFileSync(path.join(target,'public/i18n.js'),'utf8');
const parsed=ts.createSourceFile('i18n.js',dictionary,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=[];
function visit(node){
  if(ts.isPropertyAssignment(node)&&ts.isStringLiteral(node.name)&&ts.isArrayLiteralExpression(node.initializer)&&node.initializer.elements.length===4&&node.initializer.elements.every(ts.isStringLiteral)){
    const values=node.initializer.elements.map((entry,index)=>replacements[index](entry.text));
    edits.push({start:node.initializer.getStart(parsed),end:node.initializer.end,value:JSON.stringify(overrides[node.name.text]||values)});
  }
  ts.forEachChild(node,visit);
}
visit(parsed);for(const edit of edits.sort((a,b)=>b.start-a.start))dictionary=dictionary.slice(0,edit.start)+edit.value+dictionary.slice(edit.end);
write('public/i18n.js',dictionary);
await writeInitializationSql();
for(const file of walk(path.join(target,'templates'))){
  const name=path.relative(path.join(target,'templates'),file);
  const output=name.startsWith('public'+path.sep)?name:name==='proxy.ts'?name:'app/'+name;
  write(output,fs.readFileSync(file));
}
if(!fs.existsSync(path.join(target,'app/api/admin/upload/route.ts'))||!fs.existsSync(path.join(target,'public/admin-upload.js')))throw Error('Vercel upload implementation is missing.');
for(const file of walk(path.join(target,'app')).filter(file=>file.endsWith('.ts'))){
  const text=fs.readFileSync(file,'utf8');
  if(text.includes('cloudflare:workers')||text.includes('.html?raw'))throw Error('Unconverted Worker import: '+file);
}
console.log('Prepared full Next.js storefront, account, commerce and admin from existing source.');
console.log('Authentication: verified Clerk sessions; database: Turso; images: private R2. No data or credentials copied.');
