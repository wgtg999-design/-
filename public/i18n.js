/* Customer interface translations. Brand names, legal text and prices remain operator controlled. */
(function (global) {
  'use strict';
  if (global.StoreI18n) return;
  const languages = Object.freeze(['ko', 'zh-CN', 'zh-TW', 'ja']);
  const languageNames = Object.freeze({ko: '한국어', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', ja: '日本語'});
  const localeNames = {ko: 'ko-KR', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', ja: 'ja-JP'};
  const storageKey = 'street-label-language';
  const rows = {
    'nav.best': ['BEST ITEM', '热门商品', '熱門商品', '人気アイテム'],
    'nav.product': ['PRODUCT', '商品', '商品', '商品'],
    'nav.about': ['ABOUT', '品牌介绍', '品牌介紹', 'ブランドについて'],
    'nav.collection': ['COLLECTION', '系列', '系列', 'コレクション'],
    'nav.community': ['COMMUNITY', '顾客服务', '顧客服務', 'カスタマーサービス'],
    'nav.language': ['LANGUAGE', '语言', '語言', '言語'],
    'nav.login': ['로그인 / 회원가입', '登录 / 注册', '登入 / 註冊', 'ログイン / 会員登録'],
    'nav.myAccount': ['MYPAGE', '我的账户', '我的帳戶', 'マイページ'],
    'nav.cart': ['CART', '购物袋', '購物袋', 'カート'],
    'nav.search': ['SEARCH', '搜索', '搜尋', '検索'],
    'nav.wishlist': ['WISHLIST', '收藏', '收藏', 'お気に入り'],
    'nav.instagram': ['INSTAGRAM', 'INSTAGRAM', 'INSTAGRAM', 'INSTAGRAM'],
    'nav.kakaotalk': ['KAKAOTALK', 'KAKAOTALK', 'KAKAOTALK', 'KAKAOTALK'],
    'general.close': ['닫기', '关闭', '關閉', '閉じる'],
    'home.skip': ['상품으로 건너뛰기', '跳转到商品', '跳至商品', '商品へ移動'],
    'home.collection': ['COLLECTION 001', '系列 001', '系列 001', 'コレクション 001'],
    'home.discover': ['DISCOVER ↗', '探索系列 ↗', '探索系列 ↗', 'コレクションを見る ↗'],
    'home.photoSelect': ['룩북 이미지 선택', '选择造型图片', '選擇造型圖片', 'ルックブックの画像を選択'],
    'home.firstSlide': ['첫 번째 룩북', '第一张造型图片', '第一張造型圖片', '1枚目のルックブック'],
    'home.secondSlide': ['두 번째 룩북', '第二张造型图片', '第二張造型圖片', '2枚目のルックブック'],
    'home.shopTitle': ['NEW COLLECTION', '新品系列', '新品系列', 'ニューコレクション'],
    'home.shopSubtitle': ['ESSENTIAL FORMS / 001', 'ESSENTIAL FORMS / 001', 'ESSENTIAL FORMS / 001', 'ESSENTIAL FORMS / 001'],
    'home.categoryLabel': ['상품 분류', '商品分类', '商品分類', '商品カテゴリー'],
    'home.sort': ['SORT', '排序', '排序', '並び替え'],
    'home.sortDefault': ['기본순', '默认排序', '預設排序', '標準順'],
    'home.sortLow': ['낮은 가격순', '价格从低到高', '價格由低至高', '価格が安い順'],
    'home.sortHigh': ['높은 가격순', '价格从高到低', '價格由高至低', '価格が高い順'],
    'home.searchLabel': ['상품 검색', '搜索商品', '搜尋商品', '商品検索'],
    'home.searchPlaceholder': ['상품명 또는 색상 검색', '搜索商品名称或颜色', '搜尋商品名稱或顏色', '商品名または色を検索'],
    'home.resetFilters': ['초기화', '重置', '重設', 'リセット'],
    'home.noProducts': ['검색된 상품이 없습니다.', '没有找到商品。', '找不到商品。', '該当する商品がありません。'],
    'home.journal': ['COLLECTION JOURNAL', '系列影像', '系列影像', 'コレクションジャーナル'],
    'home.journalVolume': ['VOLUME 01', 'VOLUME 01', 'VOLUME 01', 'VOLUME 01'],
    'home.viewEditorial': ['VIEW THE EDITORIAL ↗', '查看造型特辑 ↗', '查看造型特輯 ↗', 'ルックブックを見る ↗'],
    'home.editorialUniform': ['INDEPENDENT UNIFORM', 'INDEPENDENT UNIFORM', 'INDEPENDENT UNIFORM', 'INDEPENDENT UNIFORM'],
    'home.editorialLocation': ['SEOUL — COLLECTION 001', '首尔 — 系列 001', '首爾 — 系列 001', 'SEOUL — コレクション 001'],
    'home.aboutTagline': ['남들과 다른 결. 방향은 분명하게.', '不同的质感，明确的方向。', '不同的質感，明確的方向。', '異なる質感。確かな方向。'],
    'home.aboutDescription': ['일상의 실루엣을 다시 바라보는 독립 스트릿웨어.', '重新审视日常轮廓的独立街头服饰。', '重新審視日常輪廓的獨立街頭服飾。', '日常のシルエットを見つめ直す、独立したストリートウェア。'],
    'home.footerUniform': ['INDEPENDENT UNIFORM.', 'INDEPENDENT UNIFORM.', 'INDEPENDENT UNIFORM.', 'INDEPENDENT UNIFORM.'],
    'home.footerLocation': ['SEOUL, SOUTH KOREA', '韩国，首尔', '韓國，首爾', '韓国・ソウル'],
    'home.shoppingGuide': ['SHOPPING GUIDE', '购物指南', '購物指南', 'ショッピングガイド'],
    'home.contact': ['CONTACT', '联系我们', '聯絡我們', 'お問い合わせ'],
    'home.footerAccount': ['로그인 / 회원가입', '登录 / 注册', '登入 / 註冊', 'ログイン / 会員登録'],
    'home.demoNotice': ['© 2026 {brand} · 디자인 시안: 임시 브랜드명 · AI 이미지 · 가상 상품 및 가격', '© 2026 {brand} · 设计样稿：临时品牌名称 · AI 图片 · 示例商品与价格', '© 2026 {brand} · 設計樣稿：暫時品牌名稱 · AI 圖片 · 範例商品與價格', '© 2026 {brand} · デザイン案：仮のブランド名・AI画像・サンプル商品と価格'],
    'home.bagTitle': ['YOUR BAG', '购物袋', '購物袋', 'カート'],
    'home.bagLocalNotice': ['장바구니는 이 브라우저에 저장됩니다. 회원정보와 주문은 서버에서 관리합니다.', '购物袋保存在此浏览器中。会员资料和订单由服务器管理。', '購物袋儲存在此瀏覽器中。會員資料和訂單由伺服器管理。', 'カートはこのブラウザに保存されます。会員情報と注文はサーバーで管理します。'],
    'home.subtotal': ['SUBTOTAL', '商品小计', '商品小計', '商品小計'],
    'home.orderNotice': ['주문은 회원 로그인 후 접수합니다. 카드 결제는 제공하지 않습니다.', '登录会员账户后可提交订单。目前不提供信用卡支付。', '登入會員帳戶後可提交訂單。目前不提供信用卡付款。', '注文は会員ログイン後に受け付けます。カード決済には対応していません。'],
    'home.checkout': ['주문서 작성', '填写订单', '填寫訂單', '注文手続きへ'],
    'home.continue': ['계속 둘러보기', '继续购物', '繼續購物', '買い物を続ける'],
    'home.menuOpen': ['메뉴 열기', '打开菜单', '開啟選單', 'メニューを開く'],
    'home.menuClose': ['메뉴 닫기', '关闭菜单', '關閉選單', 'メニューを閉じる'],
    'home.cartOpen': ['장바구니 열기', '打开购物袋', '開啟購物袋', 'カートを開く'],
    'home.productClose': ['상품 닫기', '关闭商品详情', '關閉商品詳情', '商品詳細を閉じる'],
    'home.bagClose': ['장바구니 닫기', '关闭购物袋', '關閉購物袋', 'カートを閉じる'],
    'home.infoClose': ['안내 닫기', '关闭信息', '關閉資訊', '案内を閉じる'],
    'home.languageTitle': ['언어 선택', '选择语言', '選擇語言', '言語を選択'],
    'home.languageDescription': ['화면 언어를 선택해 주세요. 가격은 원화(KRW)이며, 운영자가 등록한 안내는 원문으로 표시될 수 있습니다.', '请选择界面语言。价格以韩元（KRW）显示，运营者发布的信息可能保留原文。', '請選擇介面語言。價格以韓元（KRW）顯示，營運者發布的資訊可能保留原文。', '表示言語を選択してください。価格は韓国ウォン（KRW）で、運営者の案内は原文で表示される場合があります。'],
    'home.communityTitle': ['COMMUNITY', '顾客服务', '顧客服務', 'カスタマーサービス'],
    'home.communityIntro': ['이용 안내와 자주 묻는 질문을 확인하세요.', '查看购物指南和常见问题。', '查看購物指南和常見問題。', 'ご利用案内とよくある質問をご確認ください。'],
    'category.ALL': ['ALL', '全部', '全部', 'すべて'],
    'category.OUTER': ['OUTER', '外套', '外套', 'アウター'],
    'category.BOTTOMS': ['BOTTOMS', '下装', '下身', 'ボトムス'],
    'category.TOPS': ['TOPS', '上装', '上衣', 'トップス'],
    'category.ACC': ['ACC', '配饰', '配飾', 'アクセサリー'],
    'common.originalNotice': ['운영자가 등록한 원문 안내입니다.', '以下为运营者发布的原文说明。', '以下為營運者發布的原文說明。', '以下は運営者が登録した案内の原文です。'],
    'common.connectionPending': ['연결 준비 중', '连接准备中', '連結準備中', '接続準備中'],
    'common.loading': ['불러오는 중…', '正在加载…', '正在載入…', '読み込み中…'],
    'common.language': ['언어', '语言', '語言', '言語'],
    'common.retry': ['다시 시도', '重试', '重試', '再試行'],
    'common.close': ['닫기', '关闭', '關閉', '閉じる'],
    'common.cancel': ['취소', '取消', '取消', 'キャンセル'],
    'common.save': ['저장', '保存', '儲存', '保存'],
    'common.saving': ['저장 중…', '正在保存…', '正在儲存…', '保存中…'],
    'common.requestError': ['요청을 처리하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.', '无法处理请求。请检查输入内容后重试。', '無法處理請求。請檢查輸入內容後重試。', 'リクエストを処理できませんでした。入力内容を確認して再度お試しください。'],
    'common.networkError': ['서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.', '无法连接服务器。请检查网络连接后重试。', '無法連接伺服器。請檢查網路連線後重試。', 'サーバーに接続できません。接続状況を確認して再度お試しください。'],
    'common.responseError': ['서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', '无法读取服务器响应。请稍后重试。', '無法讀取伺服器回應。請稍後重試。', 'サーバーの応答を確認できません。しばらくしてから再度お試しください。'],
    'auth.expired': ['로그인이 만료되었습니다. ChatGPT로 다시 로그인해 주세요.', '登录已过期。请使用 ChatGPT 重新登录。', '登入已過期。請使用 ChatGPT 重新登入。', 'ログインの有効期限が切れました。ChatGPTで再度ログインしてください。'],
    'auth.required': ['로그인이 필요합니다.', '请先登录。', '請先登入。', 'ログインが必要です。'],
    'auth.chatgpt': ['ChatGPT로 로그인', '使用 ChatGPT 登录', '使用 ChatGPT 登入', 'ChatGPTでログイン'],
    'auth.loginAgain': ['ChatGPT로 다시 로그인', '使用 ChatGPT 重新登录', '使用 ChatGPT 重新登入', 'ChatGPTで再度ログイン'],
    'auth.logout': ['로그아웃', '退出登录', '登出', 'ログアウト'],
    'product.details': ['{name} 상세 보기', '查看 {name} 详情', '查看 {name} 詳情', '{name} の詳細を見る'],
    'product.soldOut': ['품절 / 판매 준비 중', '售罄 / 销售准备中', '售罄 / 販售準備中', '在庫切れ / 販売準備中'],
    'product.size': ['SIZE', '尺码', '尺寸', 'サイズ'],
    'product.chooseSize': ['사이즈 선택', '选择尺码', '選擇尺寸', 'サイズを選択'],
    'product.maxQuantity': ['최대 {count}개', '最多 {count} 件', '最多 {count} 件', '最大 {count} 点'],
    'product.addToBag': ['ADD TO BAG', '加入购物袋', '加入購物袋', 'カートに入れる'],
    'product.selectSizeFirst': ['사이즈를 먼저 선택해 주세요.', '请先选择尺码。', '請先選擇尺寸。', '先にサイズを選択してください。'],
    'product.unavailable': ['현재 품절이거나 판매 준비 중입니다.', '目前售罄或正在准备销售。', '目前售罄或正在準備販售。', '現在在庫切れ、または販売準備中です。'],
    'product.quantityLimit': ['재고 또는 주문당 구매 한도를 초과했습니다.', '已超过库存或每笔订单的购买上限。', '已超過庫存或每筆訂單的購買上限。', '在庫数または1回の注文上限を超えています。'],
    'product.paymentNote': ['무통장 입금 주문 · 입금 확인 후 출고합니다.', '银行转账订单 · 确认到账后发货。', '銀行轉帳訂單 · 確認入帳後出貨。', '銀行振込による注文・入金確認後に発送します。'],
    'product.loadingError': ['상품을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.', '无法加载商品。请稍后刷新页面。', '無法載入商品。請稍後重新整理頁面。', '商品を読み込めませんでした。しばらくしてから再読み込みしてください。'],
    'cart.empty': ['장바구니가 비어 있습니다.', '购物袋为空。', '購物袋是空的。', 'カートは空です。'],
    'cart.decrease': ['수량 줄이기', '减少数量', '減少數量', '数量を減らす'],
    'cart.increase': ['수량 늘리기', '增加数量', '增加數量', '数量を増やす'],
    'cart.remove': ['삭제', '移除', '移除', '削除'],
    'guide.title': ['SHOPPING GUIDE', '购物指南', '購物指南', 'ショッピングガイド'],
    'guide.message': ['로그인 후 주문서를 작성할 수 있습니다. 무통장 입금 확인 후 출고하며, 내 계정에서 주문·취소·반품 상태를 확인하세요.', '登录后可填写订单。确认银行转账到账后发货，可在我的账户中查看订单、取消和退货状态。', '登入後可填寫訂單。確認銀行轉帳入帳後出貨，可在我的帳戶中查看訂單、取消及退貨狀態。', 'ログイン後に注文できます。銀行振込の入金確認後に発送し、注文・キャンセル・返品状況はマイページで確認できます。'],
    'guide.contact': ['CONTACT', '联系我们', '聯絡我們', 'お問い合わせ'],
    'guide.contactPending': ['고객센터 정보는 아직 등록되지 않았습니다.', '客服信息尚未登记。', '客服資訊尚未登記。', 'お問い合わせ先はまだ登録されていません。'],
    'status.received': ['주문 접수', '已接单', '已接單', '注文受付'],
    'status.preparing': ['배송 준비', '准备发货', '準備出貨', '発送準備中'],
    'status.shipped': ['배송 중', '运输中', '配送中', '配送中'],
    'status.delivered': ['배송 완료', '已送达', '已送達', '配送完了'],
    'status.cancel_requested': ['취소 요청', '已申请取消', '已申請取消', 'キャンセル申請'],
    'status.return_requested': ['반품 요청', '已申请退货', '已申請退貨', '返品申請'],
    'status.return_approved': ['반품 승인 · 회수 대기', '退货已批准 · 等待回收', '退貨已核准 · 等待回收', '返品承認・回収待ち'],
    'status.cancelled': ['취소 완료', '已取消', '已取消', 'キャンセル完了'],
    'status.returned': ['반품 회수 완료', '退货已回收', '退貨已回收', '返品回収完了'],
    'status.awaiting_payment': ['입금 대기', '等待转账', '等待匯款', '入金待ち'],
    'status.confirmed': ['입금 확인', '已确认到账', '已確認入帳', '入金確認済み'],
    'status.refund_pending': ['환불 처리 대기', '等待退款处理', '等待退款處理', '返金処理待ち'],
    'status.refunded': ['환불 완료 기록', '退款完成记录', '退款完成紀錄', '返金完了の記録'],
    'account.nav': ['계정 메뉴', '账户菜单', '帳戶選單', 'アカウントメニュー'],
    'account.orders': ['내 주문', '我的订单', '我的訂單', '注文履歴'],
    'account.shop': ['쇼핑 계속하기', '继续购物', '繼續購物', '買い物を続ける'],
    'account.logout': ['로그아웃', '退出登录', '登出', 'ログアウト'],
    'account.title': ['회원정보와 주문', '会员资料与订单', '會員資料與訂單', '会員情報と注文'],
    'account.documentTitle': ['내 계정 · 주문 · {brand}', '我的账户 · 订单 · {brand}', '我的帳戶 · 訂單 · {brand}', 'マイページ・注文 · {brand}'],
    'account.loading': ['회원정보를 불러오는 중…', '正在加载会员资料…', '正在載入會員資料…', '会員情報を読み込み中…'],
    'account.retry': ['다시 불러오기', '重新加载', '重新載入', '再読み込み'],
    'account.reason': ['요청 사유', '申请原因', '申請原因', '申請理由'],
    'account.close': ['닫기', '关闭', '關閉', '閉じる'],
    'account.request': ['요청하기', '提交申请', '提交申請', '申請する'],
    'account.profileTitle': ['회원정보 수정', '修改会员资料', '修改會員資料', '会員情報の変更'],
    'account.profileInfo': ['현재 로그인한 ChatGPT 계정에 연결된 회원정보입니다.', '此会员资料关联当前登录的 ChatGPT 账户。', '此會員資料關聯目前登入的 ChatGPT 帳戶。', '現在ログイン中のChatGPTアカウントに紐づく会員情報です。'],
    'account.save': ['회원정보 저장', '保存会员资料', '儲存會員資料', '会員情報を保存'],
    'account.saving': ['저장 중…', '正在保存…', '正在儲存…', '保存中…'],
    'account.savePending': ['회원정보를 저장하고 있습니다.', '正在保存会员资料。', '正在儲存會員資料。', '会員情報を保存しています。'],
    'account.saved': ['회원정보를 저장했습니다.', '会员资料已保存。', '會員資料已儲存。', '会員情報を保存しました。'],
    'auth.nav': ['회원 메뉴', '会员菜单', '會員選單', '会員メニュー'],
    'auth.title': ['로그인 / 회원가입', '登录 / 注册', '登入 / 註冊', 'ログイン / 会員登録'],
    'auth.entryDocumentTitle': ['로그인 / 회원가입 · {brand}', '登录 / 注册 · {brand}', '登入 / 註冊 · {brand}', 'ログイン / 会員登録 · {brand}'],
    'auth.start': ['ChatGPT 계정으로 시작하세요.', '使用 ChatGPT 账户开始。', '使用 ChatGPT 帳戶開始。', 'ChatGPTアカウントで始めましょう。'],
    'auth.method': ['ChatGPT 계정 연동', '关联 ChatGPT 账户', '關聯 ChatGPT 帳戶', 'ChatGPTアカウント連携'],
    'auth.instructions': ["ChatGPT에 로그인한 뒤 이름을 입력하고 이용약관과 개인정보 안내에 동의하면 회원가입이 완료됩니다.", "登录 ChatGPT 后，填写姓名，阅读并同意使用条款及个人信息说明，即可完成注册。", "登入 ChatGPT 後，填寫姓名，閱讀並同意使用條款及個人資料說明，即可完成註冊。", "ChatGPTにログイン後、氏名を入力し、利用規約と個人情報の案内に同意すると会員登録が完了します。"],
    'auth.existing': ['이미 가입한 회원은 내 계정으로 연결됩니다. 별도 쇼핑몰 비밀번호는 만들지 않습니다.', '已注册会员将进入我的账户。无需另设商城密码。', '已註冊會員將進入我的帳戶。無需另設商城密碼。', '登録済みの方はマイページへ移動します。ショップ専用のパスワードは作成しません。'],
    'auth.login': ['ChatGPT로 로그인 / 회원가입', '使用 ChatGPT 登录 / 注册', '使用 ChatGPT 登入 / 註冊', 'ChatGPTでログイン / 会員登録'],
    'auth.linked': ['회원가입과 주문 내역은 로그인한 ChatGPT 계정에 연결됩니다.', '注册资料和订单记录关联当前登录的 ChatGPT 账户。', '註冊資料和訂單紀錄關聯目前登入的 ChatGPT 帳戶。', '会員登録情報と注文履歴は、ログインしたChatGPTアカウントに紐づきます。'],
    'auth.signup': ['회원가입', '会员注册', '會員註冊', '会員登録'],
    'auth.documentTitle': ['회원가입 · {brand}', '会员注册 · {brand}', '會員註冊 · {brand}', '会員登録 · {brand}'],
    'auth.enterInfo': ['내 정보 입력', '填写个人资料', '填寫個人資料', '会員情報を入力'],
    'auth.verified': ['ChatGPT 로그인을 확인했습니다. 가입 정보는 이 계정에 연결됩니다.', '已确认 ChatGPT 登录。注册资料将关联此账户。', '已確認 ChatGPT 登入。註冊資料將關聯此帳戶。', 'ChatGPTへのログインを確認しました。登録情報はこのアカウントに紐づきます。'],
    'auth.prepare': ['회원가입 안내를 준비 중입니다. 운영자가 이용약관과 개인정보 안내를 등록한 후 가입할 수 있습니다.', '注册说明正在准备中。运营者登记使用条款和个人信息说明后即可注册。', '註冊說明正在準備中。營運者登記使用條款和個人資料說明後即可註冊。', '会員登録の案内を準備中です。運営者が利用規約と個人情報の案内を登録した後に登録できます。'],
    'auth.prepareUpdate': ['회원가입 안내를 준비 중입니다. 운영자가 이용약관과 개인정보 안내를 등록한 후 회원정보를 저장할 수 있습니다.', '注册说明正在准备中。运营者登记使用条款和个人信息说明后即可保存会员资料。', '註冊說明正在準備中。營運者登記使用條款和個人資料說明後即可儲存會員資料。', '会員登録の案内を準備中です。運営者が利用規約と個人情報の案内を登録した後に会員情報を保存できます。'],
    'auth.checkAgain': ['안내 다시 확인', '重新检查说明', '重新檢查說明', '案内を再確認'],
    'auth.name': ['이름', '姓名', '姓名', '氏名'],
    'auth.phone': ['연락처', '联系电话', '聯絡電話', '電話番号'],
    'auth.nameInvalid': ['이름을 2글자 이상 입력해 주세요.', '姓名请输入至少 2 个字符。', '姓名請輸入至少 2 個字元。', '氏名は2文字以上で入力してください。'],
    'auth.phoneInvalid': ['연락처는 숫자 8자리 이상으로 입력해 주세요.', '联系电话请至少输入 8 位数字。', '聯絡電話請至少輸入 8 位數字。', '電話番号は8桁以上の数字で入力してください。'],
    'auth.terms': ['이용약관 확인', '查看使用条款', '查看使用條款', '利用規約を確認'],
    'auth.termsConsent': ['[필수] 이용약관을 확인하고 동의합니다.', '[必选] 已阅读并同意使用条款。', '[必選] 已閱讀並同意使用條款。', '[必須] 利用規約を確認し、同意します。'],
    'auth.privacy': ['개인정보 수집·이용 안내 확인', '查看个人信息收集与使用说明', '查看個人資料蒐集與使用說明', '個人情報の収集・利用について確認'],
    'auth.privacyConsent': ['[필수] 회원·주문 처리를 위한 개인정보 안내를 확인하고 동의합니다.', '[必选] 已阅读并同意用于会员及订单处理的个人信息说明。', '[必選] 已閱讀並同意用於會員及訂單處理的個人資料說明。', '[必須] 会員・注文処理のための個人情報の案内を確認し、同意します。'],
    'auth.noPassword': ['별도 쇼핑몰 비밀번호는 만들지 않습니다.', '无需另设商城密码。', '無需另設商城密碼。', 'ショップ専用のパスワードは作成しません。'],
    'auth.checkoutNext': ['가입 후 주문서를 이어서 작성할 수 있습니다.', '注册后可继续填写订单。', '註冊後可繼續填寫訂單。', '登録後に注文手続きを続けられます。'],
    'auth.register': ['회원가입 완료', '完成注册', '完成註冊', '会員登録を完了'],
    'auth.registering': ['가입 중…', '正在注册…', '正在註冊…', '登録中…'],
    'auth.registerPending': ['회원가입을 처리하고 있습니다.', '正在处理会员注册。', '正在處理會員註冊。', '会員登録を処理しています。'],
    'auth.complete': ['회원가입이 완료되었습니다.', '会员注册已完成。', '會員註冊已完成。', '会員登録が完了しました。'],
    'auth.welcome': ['{name}님, 환영합니다. 다음 방문에도 같은 ChatGPT 계정으로 로그인하면 회원정보와 주문 내역을 확인할 수 있습니다.', '欢迎您，{name}。下次使用同一 ChatGPT 账户登录，即可查看会员资料和订单记录。', '歡迎您，{name}。下次使用同一 ChatGPT 帳戶登入，即可查看會員資料和訂單紀錄。', '{name}様、ようこそ。次回も同じChatGPTアカウントでログインすると、会員情報と注文履歴を確認できます。'],
    'auth.continueCheckout': ['주문서 이어서 작성', '继续填写订单', '繼續填寫訂單', '注文手続きを続ける'],
    'auth.goAccount': ['내 계정으로 이동', '进入我的账户', '進入我的帳戶', 'マイページへ'],
    'status.signup': ["이름을 입력하고 아래 안내를 확인해 주세요.", "请填写姓名，并查看下方说明。", "請填寫姓名，並查看下方說明。", "氏名を入力し、以下の案内をご確認ください。"],
    'status.account': ['ChatGPT 로그인과 연결된 내 계정입니다. 회원정보와 주문 내역은 본인에게만 표시됩니다.', '此账户关联您的 ChatGPT 登录。会员资料和订单记录仅对您本人显示。', '此帳戶關聯您的 ChatGPT 登入。會員資料和訂單紀錄僅對您本人顯示。', 'ChatGPTログインに紐づくマイページです。会員情報と注文履歴はご本人にのみ表示されます。'],
    'status.completeAccount': ['회원가입을 완료했습니다. 아래 버튼으로 내 계정을 확인하세요.', '注册已完成。请点击下方按钮查看我的账户。', '註冊已完成。請點擊下方按鈕查看我的帳戶。', '会員登録が完了しました。以下のボタンからマイページをご確認ください。'],
    'status.completeCheckout': ['회원가입을 완료했습니다. 아래 버튼으로 주문서를 이어서 작성하세요.', '注册已完成。请点击下方按钮继续填写订单。', '註冊已完成。請點擊下方按鈕繼續填寫訂單。', '会員登録が完了しました。以下のボタンから注文手続きを続けてください。'],
    'status.failed': ['요청을 처리하지 못했습니다. 다시 시도해 주세요.', '无法处理请求。请重试。', '無法處理請求。請重試。', 'リクエストを処理できませんでした。再度お試しください。'],
    'order.checkout': ['주문서', '订单填写', '訂單填寫', '注文手続き'],
    'order.notAccepting': ['현재 주문 접수 준비 중입니다.', '目前正在准备接单。', '目前正在準備接單。', '現在注文受付の準備中です。'],
    'order.emptyCart': ['장바구니가 비어 있습니다. 홈페이지에서 상품을 담아 주세요.', '购物袋为空。请返回首页添加商品。', '購物袋是空的。請返回首頁加入商品。', 'カートは空です。ホームページで商品を追加してください。'],
    'order.shipping': ['배송비', '运费', '運費', '送料'],
    'order.total': ['총 주문금액', '订单总额', '訂單總額', '注文合計'],
    'order.recipient': ['받는 분', '收件人', '收件人', 'お届け先氏名'],
    'order.postcode': ['우편번호', '邮政编码', '郵遞區號', '郵便番号'],
    'order.address1': ['기본 주소', '基本地址', '基本地址', '住所'],
    'order.address2': ['상세 주소', '详细地址', '詳細地址', '建物名・部屋番号'],
    'order.memo': ['배송 요청사항', '配送备注', '配送備註', '配送に関するご要望'],
    'order.bank': ['무통장 입금 안내', '银行转账说明', '銀行轉帳說明', '銀行振込のご案内'],
    'order.paymentNotice': ['주문 접수만으로 결제되지 않습니다. 관리자가 실제 입금을 확인한 뒤 출고합니다.', '提交订单并不代表已付款。管理员确认实际到账后发货。', '提交訂單並不代表已付款。管理員確認實際入帳後出貨。', '注文受付だけでは決済されません。管理者が実際の入金を確認した後に発送します。'],
    'order.returnGuide': ['배송·취소·반품 안내', '配送、取消与退货说明', '配送、取消與退貨說明', '配送・キャンセル・返品のご案内'],
    'order.consent': ['상품, 배송지, 총 금액과 배송·반품 안내를 확인했습니다.', '已确认商品、配送地址、总额和配送及退货说明。', '已確認商品、配送地址、總額和配送及退貨說明。', '商品、お届け先、合計金額、配送・返品の案内を確認しました。'],
    'order.submit': ['{total} 주문 접수', '提交订单 · {total}', '提交訂單 · {total}', '{total} の注文を送信'],
    'order.submitting': ['주문 접수 중…', '正在提交订单…', '正在提交訂單…', '注文送信中…'],
    'order.submitted': ['주문이 접수되었습니다. 입금 안내와 주문 상태를 확인해 주세요.', '订单已受理。请查看转账说明和订单状态。', '訂單已受理。請查看匯款說明和訂單狀態。', '注文を受け付けました。振込の案内と注文状況をご確認ください。'],
    'order.myOrders': ['내 주문 내역', '我的订单记录', '我的訂單紀錄', '注文履歴'],
    'order.empty': ['접수한 주문이 없습니다.', '暂无订单。', '尚無訂單。', '受け付けた注文はありません。'],
    'order.support': ['문의: {support}', '咨询：{support}', '諮詢：{support}', 'お問い合わせ：{support}'],
    'order.supportPending': ['고객센터 준비 중', '客服准备中', '客服準備中', 'お問い合わせ窓口を準備中'],
    'order.previous': ['이전', '上一页', '上一頁', '前へ'],
    'order.next': ['다음', '下一页', '下一頁', '次へ'],
    'order.page': ['{page} 페이지', '第 {page} 页', '第 {page} 頁', '{page} ページ'],
    'order.cancel': ['취소 요청', '申请取消', '申請取消', 'キャンセルを申請'],
    'order.return': ['반품 요청', '申请退货', '申請退貨', '返品を申請'],
    'order.requestPending': ['요청 중…', '正在提交申请…', '正在提交申請…', '申請中…'],
    'order.requested': ['요청을 접수했습니다. 주문 상태를 확인해 주세요.', '申请已受理。请查看订单状态。', '申請已受理。請查看訂單狀態。', '申請を受け付けました。注文状況をご確認ください。'],
    'order.amount': ['주문 금액', '订单金额', '訂單金額', '注文金額'],
    'order.deliveryAddress': ['배송지 확인', '查看配送地址', '查看配送地址', 'お届け先を確認'],
    'order.trackingNotice': ['배송 상태는 관리자 확인으로 갱신됩니다.', '配送状态由管理员确认后更新。', '配送狀態由管理員確認後更新。', '配送状況は管理者の確認により更新されます。'],
    'order.refundRecord': ['환불 처리 기록: {reference}', '退款处理记录：{reference}', '退款處理紀錄：{reference}', '返金処理の記録：{reference}'],
    'errors.policiesPending': ['회원가입 안내를 준비 중입니다.', '注册说明正在准备中。', '註冊說明正在準備中。', '会員登録の案内を準備中です。'],
    'errors.policiesChanged': ['약관이 변경되었습니다. 새로고침 후 확인하세요.', '条款已变更。请刷新页面后确认。', '條款已變更。請重新整理頁面後確認。', '規約が変更されました。再読み込みしてご確認ください。'],
    'errors.ordersClosed': ['현재 주문 접수가 중지되어 있습니다.', '目前暂停接单。', '目前暫停接單。', '現在、注文受付を停止しています。'],
    'errors.settingsChanged': ['운영 안내가 변경되었습니다. 새로고침 후 확인하세요.', '商店信息已变更。请刷新页面后确认。', '商店資訊已變更。請重新整理頁面後確認。', '運営の案内が変更されました。再読み込みしてご確認ください。'],
    'errors.registerFirst': ['회원가입을 먼저 완료하세요.', '请先完成会员注册。', '請先完成會員註冊。', '先に会員登録を完了してください。'],
    'errors.pendingLimit': ['미입금 주문은 최대 3건입니다. 기존 주문을 확인하거나 취소하세요.', '未付款订单最多 3 笔。请查看或取消现有订单。', '未付款訂單最多 3 筆。請查看或取消現有訂單。', '未入金の注文は3件までです。既存の注文を確認するか、キャンセルしてください。'],
    'errors.productUnavailable': ['판매 가능한 상품/사이즈가 아닙니다.', '此商品或尺码目前无法购买。', '此商品或尺寸目前無法購買。', '購入可能な商品・サイズではありません。'],
    'errors.duplicateOption': ['같은 상품 옵션은 하나의 항목으로 주문하세요.', '同一商品规格请合并为一个订单项目。', '同一商品規格請合併為一個訂單項目。', '同じ商品オプションは1つの項目にまとめて注文してください。'],
    'errors.priceChanged': ['가격이나 배송비가 변경되었습니다. 새로고침 후 다시 확인하세요.', '价格或运费已变更。请刷新页面后重新确认。', '價格或運費已變更。請重新整理頁面後重新確認。', '価格または送料が変更されました。再読み込みしてご確認ください。'],
    'errors.orderNotFound': ['주문을 찾을 수 없습니다.', '找不到订单。', '找不到訂單。', '注文が見つかりません。'],
    'errors.stockChanged': ['재고가 부족하거나 판매가 중지되었습니다. 수량을 확인하세요.', '库存不足或销售已停止。请检查数量。', '庫存不足或販售已停止。請檢查數量。', '在庫が不足しているか、販売が停止されています。数量をご確認ください。'],
    'errors.conflict': ['처리 중 충돌이 발생했습니다. 새로고침 후 확인해 주세요.', '处理时发生冲突。请刷新页面后确认。', '處理時發生衝突。請重新整理頁面後確認。', '処理中に競合が発生しました。再読み込みしてご確認ください。'],
    'errors.checkoutChanged': ['재고·구매 한도·판매 설정이 변경되었거나 미입금 주문 한도를 초과했습니다. 새로고침 후 확인하세요.', '库存、购买上限或销售设置已变更，或已超出未付款订单上限。请刷新页面后确认。', '庫存、購買上限或販售設定已變更，或已超出未付款訂單上限。請重新整理頁面後確認。', '在庫・購入上限・販売設定が変更されたか、未入金注文の上限を超えています。再読み込みしてご確認ください。'],
    'errors.orderChanged': ['주문이 변경되었습니다. 새로고침 후 다시 처리하세요.', '订单已变更。请刷新页面后重试。', '訂單已變更。請重新整理頁面後重試。', '注文が変更されました。再読み込みして再度お試しください。'],
    'errors.orderState': ['현재 주문 상태에서 처리할 수 없습니다. 새로고침 후 확인하세요.', '当前订单状态无法执行此操作。请刷新页面后确认。', '目前訂單狀態無法執行此操作。請重新整理頁面後確認。', '現在の注文状況では処理できません。再読み込みしてご確認ください。'],
    'errors.invalidOrigin': ['잘못된 요청 출처입니다.', '请求来源无效。请从本站重试。', '請求來源無效。請從本站重試。', 'リクエストの送信元が無効です。当サイトから再度お試しください。'],
    'preview.disclaimer': ['디자인 미리보기 · 초기 예시 상품만 포함하며 실제 회원·주문·운영 데이터와 업로드 이미지는 포함하지 않습니다.', '设计预览 · 仅包含初始示例商品，不包含真实会员、订单、运营数据和上传图片。', '設計預覽 · 僅包含初始範例商品，不包含真實會員、訂單、營運資料和上傳圖片。', 'デザインプレビュー・初期サンプル商品のみで、実際の会員・注文・運営データやアップロード画像は含みません。'],
    'shop.bestTitle': ['추천 상품', '推荐商品', '推薦商品', 'おすすめ商品'],
    'shop.productTitle': ['전체 상품', '全部商品', '全部商品', 'すべての商品'],
    'shop.wishlistTitle': ['관심 상품', '收藏商品', '收藏商品', 'お気に入り'],
    'shop.bestEmpty': ['추천 상품을 준비 중입니다.', '推荐商品正在准备中。', '推薦商品正在準備中。', 'おすすめ商品を準備中です。'],
    'shop.wishlistEmpty': ['관심 상품이 없습니다. 상품 상세에서 관심 상품으로 저장해 보세요.', '尚无收藏商品。可在商品详情中添加收藏。', '尚無收藏商品。可在商品詳情中加入收藏。', 'お気に入りはありません。商品詳細から保存できます。'],
    'shop.noMatches': ['조건에 맞는 상품이 없습니다.', '没有符合条件的商品。', '沒有符合條件的商品。', '条件に一致する商品がありません。'],
    'shop.showAll': ['전체 상품 보기', '查看全部商品', '查看全部商品', 'すべての商品を見る'],
    'shop.detailAria': ['{name} 상세 보기', '查看 {name} 详情', '查看 {name} 詳情', '{name} の詳細を見る'],
    'shop.results': ['{count}개 상품', '{count} 件商品', '{count} 件商品', '{count} 点の商品'],
    'shop.currencyNote': ['표시 가격: 원화 KRW', '显示价格：韩元 KRW', '顯示價格：韓元 KRW', '表示価格：韓国ウォン KRW'],
    'shop.originalText': ['상품 설명은 운영자가 등록한 원문으로 표시될 수 있습니다.', '商品说明可能显示运营者登记的原文。', '商品說明可能顯示營運者登記的原文。', '商品説明は運営者が登録した原文で表示される場合があります。'],
    'product.sizeGuide': ['사이즈 가이드', '尺码指南', '尺寸指南', 'サイズガイド'],
    'product.sizeGuideEmpty': ['실측표는 아직 등록되지 않았습니다. 구매 전 상품 안내와 고객센터를 확인해 주세요.', '尚未登记实际尺寸表。购买前请查看商品说明并咨询客服。', '尚未登記實際尺寸表。購買前請查看商品說明並諮詢客服。', '実寸表はまだ登録されていません。購入前に商品案内とお問い合わせ先をご確認ください。'],
    'product.measureIntro': ['가지고 있는 옷을 평평하게 놓고 아래 부위를 비교해 주세요.', '请将您已有的衣服平放后，比较以下部位。', '請將您已有的衣服平放後，比較以下部位。', 'お手持ちの服を平らに置いて、以下の箇所を比較してください。'],
    'product.measureChest': ['가슴: 양쪽 겨드랑이 사이의 너비', '胸宽：两侧腋下之间的宽度', '胸寬：兩側腋下之間的寬度', '身幅：左右の脇下の間の幅'],
    'product.measureShoulder': ['어깨: 양쪽 어깨 봉제선 사이의 너비', '肩宽：两侧肩部缝线之间的宽度', '肩寬：兩側肩部縫線之間的寬度', '肩幅：左右の肩の縫い目の間の幅'],
    'product.measureLength': ['총장: 어깨의 가장 높은 곳부터 밑단까지', '衣长：肩部最高点至下摆的长度', '衣長：肩部最高點至下擺的長度', '着丈：肩の最も高い位置から裾までの長さ'],
    'product.measureNote': ['이 안내는 측정 방법이며 실제 상품 치수가 아닙니다. 상품별 실측 정보가 필요합니다.', '此说明仅介绍测量方法，并非商品实际尺寸。请确认各商品的实际尺寸信息。', '此說明僅介紹測量方法，並非商品實際尺寸。請確認各商品的實際尺寸資訊。', 'これは測り方の案内で、商品の実寸ではありません。商品ごとの実寸情報をご確認ください。'],
    'product.save': ['관심 상품 저장', '添加收藏', '加入收藏', 'お気に入りに保存'],
    'product.unsave': ['관심 상품 해제', '取消收藏', '取消收藏', 'お気に入りから削除'],
    'product.saveAria': ['{name} 관심 상품 저장', '收藏 {name}', '收藏 {name}', '{name} をお気に入りに保存'],
    'product.unsaveAria': ['{name} 관심 상품 해제', '取消收藏 {name}', '取消收藏 {name}', '{name} をお気に入りから削除'],
    'cart.maxQuantity': ['재고 또는 주문당 구매 한도를 초과했습니다.', '已超过库存或每笔订单的购买上限。', '已超過庫存或每筆訂單的購買上限。', '在庫数または1回の注文上限を超えています。'],
    'cart.updated': ['장바구니를 변경했습니다.', '购物袋已更新。', '購物袋已更新。', 'カートを更新しました。'],
    'community.noticeTitle': ['이용 안내', '使用说明', '使用說明', 'ご利用案内'],
    'community.faqTitle': ['자주 묻는 질문', '常见问题', '常見問題', 'よくある質問'],
    'community.supportTitle': ['고객센터', '客户服务', '顧客服務', 'お問い合わせ'],
    'community.supportPending': ['고객센터 연결을 준비 중입니다.', '客服联系信息正在准备中。', '客服聯絡資訊正在準備中。', 'お問い合わせ先を準備中です。'],
    'community.paymentQuestion': ['어떻게 결제하나요?', '如何付款？', '如何付款？', '支払い方法を教えてください。'],
    'community.paymentAnswer': ['현재 무통장 입금 주문만 접수합니다. 주문 접수만으로 결제되지 않으며, 관리자가 실제 입금을 확인합니다. 카드 결제와 자동 환불 송금은 연결되지 않았습니다.', '目前仅接受银行转账订单。提交订单不代表已付款，管理员会确认实际到账。信用卡支付和自动退款转账尚未接入。', '目前僅接受銀行轉帳訂單。提交訂單不代表已付款，管理員會確認實際入帳。信用卡付款和自動退款轉帳尚未接入。', '現在は銀行振込の注文のみ受け付けます。注文受付だけでは決済されず、管理者が実際の入金を確認します。カード決済と自動返金は未対応です。'],
    'community.shippingQuestion': ['배송 상태는 어디서 확인하나요?', '在哪里查看配送状态？', '在哪裡查看配送狀態？', '配送状況はどこで確認できますか？'],
    'community.shippingAnswer': ['내 계정에서 주문 상태와 등록된 송장번호를 확인할 수 있습니다. 상태는 관리자가 갱신하며, 택배사 실시간 조회는 연결되지 않았습니다.', '可在我的账户中查看订单状态和已登记的物流单号。状态由管理员更新，尚未接入物流公司的实时查询。', '可在我的帳戶中查看訂單狀態和已登記的物流單號。狀態由管理員更新，尚未接入物流公司的即時查詢。', 'マイページで注文状況と登録された追跡番号を確認できます。状況は管理者が更新します。配送会社のリアルタイム追跡は未対応です。'],
    'community.cancelQuestion': ['주문을 취소하려면 어떻게 하나요?', '如何取消订单？', '如何取消訂單？', '注文をキャンセルするにはどうすればよいですか？'],
    'community.cancelAnswer': ['내 계정의 주문 내역에서 가능한 주문의 취소를 요청하세요. 요청만으로 취소나 환불이 완료되지 않으며 관리자가 확인 후 처리합니다.', '请在我的账户的订单记录中，对支持取消的订单提交取消申请。提交申请并不代表取消或退款已完成，管理员确认后会处理。', '請在我的帳戶的訂單紀錄中，對支援取消的訂單提交取消申請。提交申請並不代表取消或退款已完成，管理員確認後會處理。', 'マイページの注文履歴で、対象の注文にキャンセル申請をしてください。申請だけではキャンセルや返金は完了せず、管理者が確認して処理します。'],
    'community.returnQuestion': ['반품과 환불은 어떻게 진행되나요?', '如何退货和退款？', '如何退貨和退款？', '返品・返金はどのように進みますか？'],
    'community.returnAnswer': ['내 계정에서 반품을 요청하고 운영자가 등록한 반품 안내를 확인하세요. 회수와 확인을 거쳐 처리하며, 실제 환불 후 관리자가 완료 기록을 남깁니다.', '请在我的账户中申请退货，并查看运营者发布的退货说明。商品回收及确认后进行处理，实际退款后管理员会登记完成记录。', '請在我的帳戶中申請退貨，並查看營運者發布的退貨說明。商品回收及確認後進行處理，實際退款後管理員會登記完成紀錄。', 'マイページから返品を申請し、運営者が登録した返品案内をご確認ください。回収・確認後に処理し、実際の返金後に管理者が完了を記録します。'],
    'community.accountQuestion': ['회원가입은 어떤 계정으로 하나요?', '使用什么账户注册？', '使用什麼帳戶註冊？', 'どのアカウントで会員登録しますか？'],
    'community.accountAnswer': ["ChatGPT 계정을 연동해 가입합니다. 이름 입력과 약관·개인정보 안내 동의가 필요합니다. 가입할 때 전화번호를 입력하지 않습니다. 일반 이메일·비밀번호 및 카카오·네이버 가입은 제공하지 않습니다.", "注册关联 ChatGPT 账户。需要填写姓名并同意条款及个人信息说明，注册时不填写电话号码。暂不提供普通邮箱密码、Kakao 或 Naver 注册。", "註冊關聯 ChatGPT 帳戶。需要填寫姓名並同意條款及個人資料說明，註冊時不填寫電話號碼。暫不提供一般電子郵件密碼、Kakao 或 Naver 註冊。", "ChatGPTアカウントを連携して登録します。氏名と規約・個人情報の案内への同意が必要です。登録時の電話番号入力はありません。メールとパスワード、Kakao・Naverでの登録には対応していません。"],
    'community.policyOriginal': ['운영자가 등록한 원문 안내입니다.', '以下为运营者发布的原文说明。', '以下為營運者發布的原文說明。', '以下は運営者が登録した案内の原文です。'],
    'community.returnGuideTitle': ['배송·취소·반품 안내', '配送、取消与退货说明', '配送、取消與退貨說明', '配送・キャンセル・返品のご案内'],
    'social.pendingTitle': ['연결 준비 중', '连接准备中', '連結準備中', '接続準備中'],
    'social.pendingMessage': ['SNS 주소 연결을 준비 중입니다.', '社交媒体链接正在准备中。', '社群媒體連結正在準備中。', 'SNSのリンクを準備中です。'],
    'preview.title': ['디자인 미리보기', '设计预览', '設計預覽', 'デザインプレビュー'],
    'preview.message': ['이 파일은 디자인 미리보기입니다. 실제 로그인·회원가입·주문은 기존 사이트에 배포한 뒤 이용할 수 있습니다.', '此文件为设计预览。实际登录、注册和订单功能需部署至现有网站后使用。', '此檔案為設計預覽。實際登入、註冊和訂單功能需部署至現有網站後使用。', 'このファイルはデザインプレビューです。実際のログイン・会員登録・注文は既存サイトへの公開後に利用できます。']
  };
  const aliases = {'nav.mypage': 'nav.myAccount', 'nav.kakao': 'nav.kakaotalk', 'shop.empty': 'home.noProducts', 'shop.title': 'home.shopTitle', 'status.network': 'common.networkError', 'status.session': 'auth.expired', 'status.response': 'common.responseError'};
  for (const name of ['received', 'preparing', 'shipped', 'delivered', 'cancel_requested', 'return_requested', 'return_approved', 'cancelled', 'returned', 'awaiting_payment', 'confirmed', 'refund_pending', 'refunded']) aliases['order.' + name] = 'status.' + name;
  function normalize(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.toLowerCase();
    const variants = {ko: 'ko', 'ko-kr': 'ko', 'zh-cn': 'zh-CN', 'zh-hans': 'zh-CN', 'zh-tw': 'zh-TW', 'zh-hant': 'zh-TW', ja: 'ja', 'ja-jp': 'ja'};
    return Object.prototype.hasOwnProperty.call(variants, normalized) ? variants[normalized] : null;
  }
  function initialLanguage() {
    try { const fromUrl = normalize(new URL(global.location.href).searchParams.get('lang')); if (fromUrl) return fromUrl; } catch {}
    try { const saved = normalize(global.localStorage.getItem(storageKey)); if (saved) return saved; } catch {}
    return 'ko';
  }
  let language = initialLanguage();
  const boundSelects = new WeakSet();
  function t(key, parameters = {}) {
    const targetKey = Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : key;
    const row = Object.prototype.hasOwnProperty.call(rows, targetKey) ? rows[targetKey] : null;
    const value = row ? row[languages.indexOf(language)] : String(key);
    const safeParameters = parameters && typeof parameters === 'object' ? parameters : {};
    return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(safeParameters, name) ? String(safeParameters[name] ?? '') : match);
  }
  function each(root, selector, action) {
    if (root.matches?.(selector)) action(root);
    root.querySelectorAll?.(selector).forEach(action);
  }
  function apply(root = global.document) {
    if (!root) return;
    if (global.document?.documentElement) global.document.documentElement.lang = language;
    each(root, '[data-i18n]', element => {
      let parameters = {};
      try { const value = JSON.parse(element.getAttribute('data-i18n-params') || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) parameters = value; } catch {}
      element.textContent = t(element.dataset.i18n, parameters);
    });
    for (const attribute of ['placeholder', 'aria-label', 'title']) {
      each(root, '[data-i18n-' + attribute + ']', element => { element.setAttribute(attribute, t(element.getAttribute('data-i18n-' + attribute))); });
    }
    each(root, '[data-language-label]', element => { element.textContent = languageNames[language]; });
    each(root, '[data-language-select]', select => {
      select.value = language;
      if (!boundSelects.has(select)) { select.addEventListener('change', () => setLanguage(select.value)); boundSelects.add(select); }
    });
    each(root, '[data-set-language]', button => { button.setAttribute('aria-pressed', String(normalize(button.dataset.setLanguage) === language)); });
  }
  function setLanguage(value) {
    const next = normalize(value);
    if (!next) return false;
    const changed = next !== language;
    language = next;
    try { global.localStorage.setItem(storageKey, language); } catch {}
    apply();
    if (changed) global.dispatchEvent(new CustomEvent('street-label:languagechange', {detail: {language}}));
    return true;
  }
  function formatNumber(value, options) { return new Intl.NumberFormat(localeNames[language], options).format(Number(value)); }
  function formatCurrency(value) { return '₩' + formatNumber(value, {maximumFractionDigits: 0}); }
  function catalogValue(item, field) {
    const translated = item?.translations?.[language]?.[field];
    return typeof translated === 'string' && translated.trim() ? translated : item?.[field] ?? '';
  }
  const errorKeys = {
    '서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.': 'common.networkError',
    '서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.': 'common.responseError',
    '로그인이 만료되었습니다. ChatGPT로 다시 로그인해 주세요.': 'auth.expired',
    '로그인이 필요합니다.': 'auth.required',
    '회원가입 안내를 준비 중입니다.': 'errors.policiesPending',
    '약관이 변경되었습니다. 새로고침 후 확인하세요.': 'errors.policiesChanged',
    '현재 주문 접수가 중지되어 있습니다.': 'errors.ordersClosed',
    '운영 안내가 변경되었습니다. 새로고침 후 확인하세요.': 'errors.settingsChanged',
    '회원가입을 먼저 완료하세요.': 'errors.registerFirst',
    '미입금 주문은 최대 3건입니다. 기존 주문을 확인하거나 취소하세요.': 'errors.pendingLimit',
    '판매 가능한 상품/사이즈가 아닙니다.': 'errors.productUnavailable',
    '같은 상품 옵션은 하나의 항목으로 주문하세요.': 'errors.duplicateOption',
    '가격이나 배송비가 변경되었습니다. 새로고침 후 다시 확인하세요.': 'errors.priceChanged',
    '주문을 찾을 수 없습니다.': 'errors.orderNotFound',
    '재고가 부족하거나 판매가 중지되었습니다. 수량을 확인하세요.': 'errors.stockChanged',
    '상품 또는 운영 설정이 변경되었습니다. 새로고침 후 다시 주문하세요.': 'errors.settingsChanged',
    '처리 중 충돌이 발생했습니다. 새로고침 후 확인해 주세요.': 'errors.conflict',
    '재고·구매 한도·판매 설정이 변경되었거나 미입금 주문 한도를 초과했습니다. 새로고침 후 확인하세요.': 'errors.checkoutChanged',
    '주문이 변경되었습니다. 새로고침 후 다시 처리하세요.': 'errors.orderChanged',
    '동시 변경이 발생했습니다. 새로고침 후 확인하세요.': 'errors.conflict',
    '현재 주문 상태에서 처리할 수 없습니다. 새로고침 후 확인하세요.': 'errors.orderState',
    '잘못된 요청 출처입니다.': 'errors.invalidOrigin'
  };
  function translateError(message) {
    const original = String(message || '');
    const key = Object.prototype.hasOwnProperty.call(errorKeys, original) ? errorKeys[original] : null;
    return key ? t(key) : language === 'ko' && original ? original : t('common.requestError');
  }
  global.StoreI18n = Object.freeze({t, getLanguage: () => language, setLanguage, apply, translateError, formatNumber, localeNumber: formatNumber, formatCurrency, currencyKRW: formatCurrency, catalogValue, languages, languageNames, locale: () => localeNames[language], formatDate: value => new Date(value).toLocaleString(localeNames[language]), keys: () => Object.keys(rows).concat(Object.keys(aliases))});
  try { global.localStorage.setItem(storageKey, language); } catch {}
  if (global.document?.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', () => apply(), {once: true});
  else apply();
})(window);
