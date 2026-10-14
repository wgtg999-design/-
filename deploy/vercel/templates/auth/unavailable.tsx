export default function AuthUnavailable() {
  return <main style={{ maxWidth: 560, margin: '64px auto', padding: 24 }}>
    <h1 style={{ fontSize: 24, fontWeight: 500 }}>로그인 연결 준비 중</h1>
    <p style={{ lineHeight: 1.7 }}>로그인 연결을 확인하지 못했습니다. 연결 설정과 로그인 서비스 상태를 확인한 뒤 다시 시도해 주세요.</p>
    <p><a href="/setup">대표님 연결 확인 화면 열기</a></p>
    <a href="/">홈페이지로 돌아가기</a>
  </main>;
}
