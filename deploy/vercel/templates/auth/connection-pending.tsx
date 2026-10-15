'use client';

import { useEffect, useState } from 'react';

const copy = {
  ko: { title: '로그인은 완료되었습니다.', description: '회원정보 저장소에 일시적으로 연결하지 못했습니다. 로그인 상태는 유지됩니다. 잠시 후 다시 확인해 주세요.', retry: '회원정보 연결 다시 확인', home: '홈페이지로 돌아가기', signout: '로그아웃' },
  'zh-CN': { title: '登录已完成。', description: '暂时无法连接会员信息存储。您的登录状态保持不变，请稍后重试。', retry: '重新连接会员信息', home: '返回首页', signout: '退出登录' },
  'zh-TW': { title: '登入已完成。', description: '暫時無法連線到會員資料儲存空間。登入狀態維持不變，請稍後再試。', retry: '重新連線會員資料', home: '返回首頁', signout: '登出' },
  ja: { title: 'ログインは完了しました。', description: '会員情報の保存先に一時的に接続できません。ログイン状態を保ったまま、しばらくしてから再確認してください。', retry: '会員情報への接続を再確認', home: 'ホームに戻る', signout: 'ログアウト' },
};
type Language = keyof typeof copy;

/** Only the verified managed-account branch renders this recoverable state.
 * The server still requires a usable DB identity before opening private pages.
 */
export default function AccountConnectionPending({ next }: { next: string }) {
  const [language, setLanguage] = useState<Language>('ko');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('street-label-language');
      if (saved && Object.hasOwn(copy, saved)) setLanguage(saved as Language);
    } catch { /* Optional display preference; never identity storage. */ }
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function selectLanguage(value: string) {
    if (!Object.hasOwn(copy, value)) return;
    setLanguage(value as Language);
    try { localStorage.setItem('street-label-language', value); } catch { /* Preference only. */ }
  }
  const text = copy[language];
  const retry = `/auth/sign-in?next=${encodeURIComponent(next)}`;
  const signout = `/auth/sign-out?next=${encodeURIComponent(next)}`;
  return <main style={{ maxWidth: 560, margin: '64px auto', padding: 24 }}>
    <select aria-label="Language" value={language} onChange={event => selectLanguage(event.target.value)} style={{ padding: 8, marginBottom: 24, border: '1px solid #bbb', borderRadius: 0 }}>
      <option value="ko">한국어</option><option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="ja">日本語</option>
    </select>
    <h1 style={{ fontSize: 24, fontWeight: 500 }}>{text.title}</h1>
    <p role="status" style={{ lineHeight: 1.8 }}>{text.description}</p>
    <p><a href={retry} style={{ display: 'inline-block', padding: '12px 16px', background: '#111', color: '#fff', textDecoration: 'none' }}>{text.retry}</a></p>
    <p style={{ display: 'flex', gap: 24, flexWrap: 'wrap', lineHeight: 1.8 }}>
      <a href="/" style={{ color: '#111' }}>{text.home}</a>
      <a href={signout} style={{ color: '#111' }}>{text.signout}</a>
    </p>
  </main>;
}
