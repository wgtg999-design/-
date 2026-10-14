(function () {
  'use strict';
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  async function jsonRequest(body) {
    const response = await fetch('/api/admin/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let result;
    try { result = await response.json(); } catch { throw Error('서버 응답을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); }
    if (!response.ok) throw Error(result.error || '이미지 업로드에 실패했습니다.');
    return result;
  }
  window.StoreUpload = async function (file) {
    if (!file || !allowed.includes(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024) throw Error('JPG, PNG, WebP 이미지를 최대 8MB까지 업로드할 수 있습니다.');
    const ticket = await jsonRequest({ action: 'init', contentType: file.type, size: file.size });
    if (typeof ticket.uploadUrl !== 'string' || typeof ticket.token !== 'string' || ticket.contentType !== file.type) throw Error('이미지 업로드 정보를 확인하지 못했습니다.');
    let put;
    try { put = await fetch(ticket.uploadUrl, { method: 'PUT', credentials: 'omit', headers: { 'Content-Type': file.type }, body: file }); }
    catch { throw Error('이미지 저장소에 연결하지 못했습니다. 업로드 허용 주소 설정을 확인한 뒤 파일을 다시 선택해 주세요.'); }
    if (!put.ok) throw Error('이미지 저장소 업로드에 실패했습니다. 파일을 다시 선택해 주세요.');
    return jsonRequest({ action: 'finalize', token: ticket.token });
  };
})();
