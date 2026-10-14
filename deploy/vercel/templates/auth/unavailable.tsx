export default function AuthUnavailable() {
  return <main style={{ maxWidth: 560, margin: '64px auto', padding: 24 }}>
    <h1 style={{ fontSize: 24, fontWeight: 500 }}>로그인 연결 준비 중</h1>
    <p style={{ lineHeight: 1.7 }}>현재 이메일 로그인 서비스가 연결되지 않았습니다. 운영자가 인증 서비스와 데이터베이스를 연결한 뒤 이용할 수 있습니다.</p>
    <a href="/">홈페이지로 돌아가기</a>
  </main>;
}
