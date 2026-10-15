'use client';

import { ClerkProvider, SignIn, SignUp, UserProfile } from '@clerk/nextjs';
import { koKR, zhCN, zhTW, jaJP } from '@clerk/localizations';
import { useEffect, useState } from 'react';

type Language = 'ko' | 'zh-CN' | 'zh-TW' | 'ja';
const localizations = { ko: koKR, 'zh-CN': zhCN, 'zh-TW': zhTW, ja: jaJP };
const copy = {
  ko: { home: '홈페이지', login: '이메일 로그인', signup: '이메일 계정 만들기', verify: '이메일 인증 확인', description: '이메일 인증과 비밀번호 관리는 로그인 서비스에서 안전하게 처리합니다. 인증 후 이름을 입력하고 이용약관·개인정보 안내에 동의하면 회원 등록이 완료됩니다.', verifyHelp: '로그인 계정의 기본 이메일을 인증해 주세요. 아래 계정 관리에서 이메일 인증을 마친 뒤 계속하기를 누르세요.', continue: '인증 후 계속하기', signout: '로그아웃' },
  'zh-CN': { home: '首页', login: '邮箱登录', signup: '创建邮箱账户', verify: '验证邮箱', description: '登录服务安全地处理邮箱验证和密码。验证后，填写姓名并同意使用条款及个人信息说明，即可完成会员注册。', verifyHelp: '请验证登录账户的主邮箱。在下方账户管理中完成验证后，点击继续。', continue: '验证后继续', signout: '退出登录' },
  'zh-TW': { home: '首頁', login: '電子郵件登入', signup: '建立電子郵件帳號', verify: '驗證電子郵件', description: '登入服務安全地處理電子郵件驗證與密碼。驗證後，填寫姓名並同意使用條款及個人資料說明，即可完成會員註冊。', verifyHelp: '請驗證登入帳號的主要電子郵件。在下方帳號管理中完成驗證後，點選繼續。', continue: '驗證後繼續', signout: '登出' },
  ja: { home: 'ホーム', login: 'メールでログイン', signup: 'メールアカウントを作成', verify: 'メール認証', description: 'メール認証とパスワードの管理はログインサービスで安全に行います。認証後、氏名を入力し、利用規約と個人情報の案内に同意すると会員登録が完了します。', verifyHelp: 'ログインアカウントの主メールアドレスを認証してください。下のアカウント管理で認証を完了し、続行を押してください。', continue: '認証後に続行', signout: 'ログアウト' },
};

export default function AuthUI({ mode, next, publishableKey }: {
  mode: 'sign-in' | 'sign-up' | 'verify-email'; next: string; publishableKey: string;
}) {
  const [language, setLanguage] = useState<Language>('ko');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('street-label-language');
      if (saved && Object.hasOwn(localizations, saved)) setLanguage(saved as Language);
    } catch { /* Only an optional UI preference, never identity storage. */ }
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function selectLanguage(value: string) {
    if (!Object.hasOwn(localizations, value)) return;
    setLanguage(value as Language);
    try { localStorage.setItem('street-label-language', value); } catch { /* Preference only. */ }
  }
  const text = copy[language];
  const signInUrl = `/auth/sign-in?next=${encodeURIComponent(next)}`;
  const signUpUrl = `/auth/sign-up?next=${encodeURIComponent(next)}`;
  const title = mode === 'sign-in' ? text.login : mode === 'sign-up' ? text.signup : text.verify;
  return <main style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px' }}>
    <nav style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 48 }}>
      <a href="/" style={{ color: '#111' }}>{text.home}</a>
      <select aria-label="Language" value={language} onChange={event => selectLanguage(event.target.value)}>
        <option value="ko">한국어</option><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="ja">日本語</option>
      </select>
    </nav>
    <h1 style={{ fontSize: 24, fontWeight: 500 }}>{title}</h1>
    <p style={{ maxWidth: 580, fontSize: 14, lineHeight: 1.7, color: '#555' }}>{mode === 'verify-email' ? text.verifyHelp : text.description}</p>
    <ClerkProvider publishableKey={publishableKey} localization={localizations[language]} signInUrl={signInUrl} signUpUrl={signUpUrl}
      signInForceRedirectUrl={next} signUpForceRedirectUrl={next} signInFallbackRedirectUrl={next} signUpFallbackRedirectUrl={next}
      appearance={{ variables: { colorPrimary: '#111111', borderRadius: '0', fontFamily: 'Arial, sans-serif' }, elements: { rootBox: { maxWidth: '100%' }, cardBox: { maxWidth: '100%' }, card: { boxShadow: 'none', border: '1px solid #dddddd' } } }}>
      <div style={{ marginTop: 32 }}>
        {mode === 'sign-in' && <SignIn routing="path" path="/auth/sign-in" signUpUrl={signUpUrl} forceRedirectUrl={next} fallbackRedirectUrl={next} />}
        {mode === 'sign-up' && <SignUp routing="path" path="/auth/sign-up" signInUrl={signInUrl} forceRedirectUrl={next} fallbackRedirectUrl={next} />}
        {mode === 'verify-email' && <UserProfile routing="path" path="/auth/verify-email" />}
      </div>
    </ClerkProvider>
    {mode === 'verify-email' && <p style={{ display: 'flex', gap: 24, marginTop: 32 }}><a href={next}>{text.continue}</a><a href={`/auth/sign-out?next=${encodeURIComponent(next)}`}>{text.signout}</a></p>}
  </main>;
}
