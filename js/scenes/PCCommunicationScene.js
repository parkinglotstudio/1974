/**
 * PC Communication Scene (Chapter 4 - KETEL)
 * 100% PERFECT PORT VERSION (AS REPORTED IN MILESTONE)
 */
export default class PCCommunicationScene {
    constructor(gameManager) {
        this.gm = gameManager;
        this.db = gameManager.db;
        this.timers = [];
        this.state = {
            connSec: 0,
            pct: 0,
            logIdx: 0,
            xp: 0,
            curPost: [0, 0],
            autoIdx: 0,
            sec: 0
        };

        this.myNick = 'TIGER74';
        this.posts0 = [
            {no:247,t:'안녕하세요 가입인사드립니다 ^^ 잘 부탁드려요~',a:'호랑나비74',d:'1993-06-15 12:28',v:12,isNew:true,
             b:`안녕하세요~! 케텔에 가입한 TIGER74 입니다.\n\n요즘 모뎀 속도가 느려서 고생하다가\n드디어 33600 bps 모뎀으로 바꿨어요.\n\n앞으로 자주 올게요~ 잘 부탁드립니다 ^^;\n\n                    (\\ /)\n                    (^.^)\n                   C(")(")` },
            {no:246,t:'[공지] ASCII 아트 공모전 개최!!!',a:'운영자',d:'1993-06-14 09:00',v:381,isNew:true,isNotice:true,
             b:`안녕하세요 케텔 운영팀입니다.\n\n이번에 ASCII 아트 공모전을 개최합니다!\n\n■ 기간: 1993년 6월 15일 ~ 6월 30일\n■ 주제: 동물 ASCII 아트\n■ 상품: 케텔 이용권 3개월\n\n많은 참여 부탁드립니다.\n당선 작품은 동호회 공식 캐릭터로 채택됩니다!\n\n          ,___,\n         (O . O)\n          ( v )\n          )   (\n         (_____)` },
            {no:245,t:'오늘 PC 조립했어요 486DX2 66MHz!',a:'컴퓨터박사',d:'1993-06-14 21:15',v:94,
             b:`드디어 486DX2 66MHz 조립 완료했습니다!!!\n\nCPU: Intel 486DX2 66MHz\nRAM: 8MB / HDD: 210MB\n모뎀: 14400 bps / 사운드: SB16\n\n스타크래프트 나오면 돌릴 수 있겠죠?ㅋㅋ`},
            {no:244,t:'서태지 새 앨범 정말 충격이에요',a:'음악소년',d:'1993-06-13 18:30',v:203,
             b:`서태지와 아이들 2집 들어보셨나요?\n\n교실 이데아... 정말 충격적이에요.\n이런 음악이 나올 수 있다니...\n\n혹시 다른 분들은 어떻게 생각하세요?`},
            {no:242,t:'고양이 ASCII 아트 올립니다 ^^',a:'고양이파',d:'1993-06-12 20:00',v:445,
             b:`  /\\_/\\\n ( ^.^ )\n  > * <\n (     )\n  \\_-_/\n\n이거 동호회 멤버 카드로 써도 됩니다!`}
        ];

        this.posts1 = [
            {no:183,t:'[공지] 동호회 정기 모임 공지 (7월)',a:'운영자',d:'1993-06-15 10:00',v:124,isNew:true,isNotice:true,
             b:`동호회 7월 정기 모임 안내입니다.\n\n■ 일시: 1993년 7월 10일 (토) 오후 2시\n■ 장소: 종로 낙원상가 2층 (모뎀 가게 앞)\n■ 참석: 선착순 20명\n\n참석하실 분은 댓글 달아주세요!`},
            {no:182,t:'호랑이 ASCII 아트 공유해요!',a:'TIGER74',d:'1993-06-14 23:30',v:89,isNew:true,
             b:`74년 호랑이띠 기념 ASCII 아트!\n\n  /\\ M /\\\n ( >   < )\n -( *** )-\n  (  W  )\n   \\_V_/\n\n마음에 드시면 가져가세요~`},
            {no:181,t:'판다 ASCII 모음집 올립니다',a:'판다러버',d:'1993-06-13 19:45',v:267,
             b:`판다 ASCII 아트 모음이에요~\n\n(o o o o)       ʕ •ᴥ• ʔ\n( @   @ )       ( === )\n (  w  )         \\___/`}
        ];

        this.chatNicks = ['고양이파','통신달인','컴퓨터박사','음악소년','74번지','삐삐왕','게임광','올빼미','땜질고수','판다러버','멍멍이','호랑나비74'];
        this.autoMsgs = [
            {nick:'고양이파',body:'안녕하세요~ 오늘도 접속했어요 ^^'},
            {nick:'통신달인',body:'다들 모뎀 잘 돌아가나요?'},
            {nick:'음악소년',body:'서태지 교실이데아 진짜 충격이었어요...'},
            {nick:'컴퓨터박사',body:'486 조립했는데 진짜 빠르다 ㅋㅋ'},
            {nick:'게임광',body:'스타크래프트 기다리는 사람 저뿐인가요?'},
            {nick:'땜질고수',body:'전화요금 폭탄 맞기 전에 로그아웃 해야겠다 ㅠ'}
        ];
        this.chatColors = {'고양이파':'#ccaa44','통신달인':'#44aacc','컴퓨터박사':'#cc6644','음악소년':'#aa44cc','74번지':'#44cc88','삐삐왕':'#cc4488','게임광':'#44ccaa','올빼미':'#8844cc','땜질고수':'#cccc44','판다러버':'#cc8844','멍멍이':'#44cc44','호랑나비74':'#cc4444'};
    }

    enter() {
        const uiLayer = document.getElementById('ui-layer');
        uiLayer.innerHTML = '';
        
        if (!document.getElementById('ch4-css')) {
            const link = document.createElement('link');
            link.id = 'ch4-css'; link.rel = 'stylesheet'; link.href = 'css/chapter4.css';
            document.head.appendChild(link);
        }

        const container = document.createElement('div');
        container.id = 'pc-comm-scene';
        container.innerHTML = `
            <div class="crt-overlay"></div>
            <div class="phone-frame">
                <div id="ch4-timeline" style="position:absolute; top:0; left:0; right:0; z-index:10000; height:0;"></div>
                <div class="layer on" id="layerConnect">
                    <div class="win-box">
                        <div class="win-titlebar"><span class="win-title">연결 중... KETEL</span><div class="win-btns"><div class="win-btn">_</div><div class="win-btn">□</div><div class="win-btn">✕</div></div></div>
                        <div class="connect-body">
                            <div class="connect-icons">
                                <div class="ascii-icon">┌──────┐<br>│ ▓▓▓▓ │<br>│ ▓▓▓▓ │<br>└──┬───┘<br>  ──┴───<br> ▔▔▔▔▔▔▔</div>
                                <div style="font-size:8px;color:var(--text3);letter-spacing:-.05em;">·─·─·─·─·─·</div>
                                <div class="ascii-icon"> ╭──────╮<br> │ ∫∫∫∫ │<br> ╰──────╯<br> ╲______╱<br>  ▔▔▔▔▔▔</div>
                            </div>
                            <div class="connect-status-text" id="connStatusText">케텔 서버에 연결 중입니다...</div>
                            <div class="progress-wrap"><div class="progress-fill" id="progressFill" style="width:0%"></div><span class="progress-pct" id="progressPct">0%</span></div>
                            <div class="status-grid"><span class="sg-label">상태</span><span class="sg-val" id="sgState">전화 걸기 중...</span><span class="sg-label">번호</span><span class="sg-val">013-146-700</span><span class="sg-label">속도</span><span class="sg-val">33600 bps</span><span class="sg-label">시간</span><span class="sg-val" id="sgTime">00:00:00</span></div>
                            <div class="conn-log" id="connLog"></div>
                            <div class="conn-cancel"><button class="kbtn sm" id="skip-btn">취소 [ESC]</button></div>
                        </div>
                    </div>
                </div>

                <div class="layer" id="layerMain">
                    <div class="main-header">
                        <div class="ketel-logo">KETEL</div>
                        <div class="ketel-sub">Korea Electronic Telecommunications End line</div>
                        <div class="ketel-welcome">== 케텔에 오신 것을 환영합니다 ==</div>
                    </div>

                    <div class="main-content-row" style="display:flex; padding:15px 10px; align-items:flex-start;">
                        <!-- Left: Menu List -->
                        <div class="main-menu-section" style="flex:1; border:none; padding:0;">
                            <div class="menu-item" id="mi-1"><span class="menu-num">1.</span><span class="menu-name">케텔 뉴스</span><span class="menu-arrow">▶</span></div>
                            <div class="menu-item" id="mi-2"><span class="menu-num">2.</span><span class="menu-name">전자 우편</span><span class="menu-arrow">▶</span></div>
                            <div class="menu-item" id="mi-3"><span class="menu-num">3.</span><span class="menu-name">동호회 마당</span><span class="menu-arrow">▶</span></div>
                            <div class="menu-item" id="mi-4"><span class="menu-num">4.</span><span class="menu-name">자료실</span><span class="menu-arrow">▶</span></div>
                            <div class="menu-item" id="mi-5"><span class="menu-num">5.</span><span class="menu-name">게임 / 오락실</span><span class="menu-arrow">▶</span></div>
                            <div style="height:1px; background:var(--dim); margin:8px 0; width:80%;"></div>
                            <div class="menu-item" id="mi-h"><span class="menu-num">H.</span><span class="menu-name">도움말</span></div>
                        </div>

                        <!-- Right: Pixel Character -->
                        <div class="character-img-wrap" style="flex:1; display:flex; justify-content:center; padding-top:10px;">
                            <img src="ketel_woman_pixel_art_1778321254022.png" style="width:180px; height:180px; image-rendering:pixelated; object-fit:contain; filter: grayscale(1) brightness(1.2) contrast(1.4) sepia(1) hue-rotate(140deg) saturate(5);">
                        </div>
                    </div>

                    <div style="padding:5px 12px;font-size:10px;color:var(--text3);letter-spacing:.08em;">[ 아이콘 세트 ]</div>
                    <div class="icon-grid" id="main-icon-grid" style="grid-template-columns: repeat(4, 1fr); border:1px solid var(--dim);">
                        ${this.getIconCell('전화기','phone')}
                        ${this.getIconCell('모뎀','modem')}
                        ${this.getIconCell('연결','connect')}
                        ${this.getIconCell('우편','mail')}
                        ${this.getIconCell('게시판','board')}
                        ${this.getIconCell('파일실','files')}
                        ${this.getIconCell('동호회','club')}
                        ${this.getIconCell('게임실','games')}
                    </div>
                    <div class="main-prompt" style="margin-top:10px;"><span class="prompt-label">메뉴를 선택하세요 :</span><span class="prompt-cursor"></span></div>
                    <div class="main-statusbar"><span class="ok">KETEL CONNECTED</span><span id="mainClock">1993-06-15 19:10</span><span>33600bps</span></div>
                </div>

                <div class="layer" id="layerBBS">
                    <div class="topbar"><div class="topbar-title"><span class="logo" id="bbs-logo">◀ [ K·E·T·E·L ]</span><span class="info">TIGER74 | XP:<span class="xp-val" id="xpDisp">0000</span></span></div><div class="tabs"><div class="tab on" id="tab0">자유게시판</div><div class="tab" id="tab1">동호회게시판</div><div class="tab" id="tab2">채팅방</div></div></div>
                    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;position:relative;">
                        <div class="scene on" id="sc0">
                            <div class="bbs-header"><span class="bbs-title">[ 자유 게시판 ]</span><div class="bbs-nav"><span class="on" id="nav0-l">목록</span><span id="nav0-w">글쓰기</span><span id="nav0-c">채팅</span></div></div>
                            <div id="bbsListView0" style="display:flex;flex-direction:column;flex:1;overflow:hidden;"><div class="bbs-cols"><span>번호</span><span>제목</span><span>작성자</span><span>조회</span></div><div class="bbs-list" id="bbsList0"></div><div class="statusbar"><span>목록보기 [Enter]</span><span>조회 [V]</span></div></div>
                            <div id="bbsPostView0" style="display:none;"><div class="post-view"><div class="post-subject" id="pv0Subject"></div><div class="post-meta"><span id="pv0Author"></span><span>|</span><span id="pv0Date"></span><span>|</span><span id="pv0Views"></span></div><div class="post-body" id="pv0Body"></div><div style="padding:10px;"><button class="kbtn" id="pv0-back">목록으로</button></div></div></div>
                        </div>
                        <div class="scene" id="sc1">
                            <div class="bbs-header"><span class="bbs-title">[ 동호회 게시판 ]</span></div>
                            <div class="bbs-cols"><span>번호</span><span>제목</span><span>작성자</span><span>조회</span></div><div class="bbs-list" id="bbsList1"></div>
                        </div>
                        <div class="scene" id="sc2">
                            <div class="chat-msgs" id="chatMsgs"></div>
                            <div class="chat-input-wrap"><input class="chat-input" id="chatInput" placeholder="입력..."><button class="kbtn sm" id="chatSendBtn">전송</button></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        uiLayer.appendChild(container);

        this.renderTimeline();
        this.initEvents();
        this.startLogic();
    }

    getIconCell(label, type) {
        let svg = '';
        if(type==='phone') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="8" cy="8" r="1.2"/><circle cx="11" cy="7" r="1.2"/><circle cx="14" cy="6.5" r="1.2"/><circle cx="17" cy="6.5" r="1.2"/><circle cx="20" cy="7" r="1.2"/><circle cx="23" cy="7.5" r="1.2"/><circle cx="26" cy="8.5" r="1.2"/><circle cx="28" cy="10" r="1.2"/><circle cx="8" cy="11" r="1.2"/><circle cx="29" cy="12" r="1.2"/><circle cx="8" cy="14" r="1.2"/><circle cx="29" cy="15" r="1.2"/><circle cx="8" cy="17" r="1.2"/><circle cx="28" cy="18" r="1.2"/><circle cx="9" cy="20" r="1.2"/><circle cx="11" cy="21.5" r="1.2"/><circle cx="13" cy="22.5" r="1.2"/><circle cx="16" cy="23" r="1.2"/><circle cx="19" cy="23" r="1.2"/><circle cx="22" cy="22.5" r="1.2"/><circle cx="25" cy="21.5" r="1.2"/><circle cx="27" cy="20" r="1.2"/></svg>`;
        if(type==='modem') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="6" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="14" cy="10" r="1.2"/><circle cx="18" cy="10" r="1.2"/><circle cx="22" cy="10" r="1.2"/><circle cx="26" cy="10" r="1.2"/><circle cx="30" cy="10" r="1.2"/><circle cx="34" cy="10" r="1.2"/><circle cx="6" cy="22" r="1.2"/><circle cx="34" cy="22" r="1.2"/><circle cx="28" cy="16" r="1.8" style="fill:var(--green);"/><circle cx="22" cy="16" r="1.4" style="fill:var(--yellow);"/></svg>`;
        if(type==='connect') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="4" cy="10" r="1.1"/><circle cx="13" cy="10" r="1.1"/><circle cx="13" cy="22" r="1.1"/><circle cx="4" cy="22" r="1.1"/><circle cx="18" cy="16" r="1.1"/><circle cx="23" cy="16" r="1.1"/><circle cx="27" cy="10" r="1.1"/><circle cx="36" cy="22" r="1.1"/></svg>`;
        if(type==='mail') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="4" cy="10" r="1.1"/><circle cx="34" cy="10" r="1.1"/><circle cx="4" cy="24" r="1.1"/><circle cx="34" cy="24" r="1.1"/><circle cx="7" cy="13" r="1.1"/><circle cx="19" cy="20" r="1.1"/><circle cx="31" cy="13" r="1.1"/></svg>`;
        if(type==='board') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="6" cy="8" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="14" cy="8" r="1"/><circle cx="18" cy="8" r="1"/><circle cx="22" cy="8" r="1"/><circle cx="26" cy="8" r="1"/><circle cx="30" cy="8" r="1"/><circle cx="34" cy="8" r="1"/><circle cx="6" cy="26" r="1"/><circle cx="34" cy="26" r="1"/><circle cx="10" cy="14" r="1"/><circle cx="14" cy="14" r="1"/><circle cx="18" cy="14" r="1"/><circle cx="10" cy="18" r="1"/><circle cx="14" cy="18" r="1"/><circle cx="10" cy="22" r="1"/></svg>`;
        if(type==='files') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="12" cy="6" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="20" cy="6" r="1"/><circle cx="8" cy="10" r="1"/><circle cx="24" cy="10" r="1"/><circle cx="8" cy="28" r="1"/><circle cx="24" cy="28" r="1"/><circle cx="12" cy="18" r="1"/><circle cx="16" cy="18" r="1"/><circle cx="20" cy="18" r="1"/></svg>`;
        if(type==='club') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="20" cy="10" r="1.5" style="fill:var(--cyan);"/><circle cx="14" cy="18" r="1.2"/><circle cx="20" cy="18" r="1.2"/><circle cx="26" cy="18" r="1.2"/><circle cx="14" cy="24" r="1.2"/><circle cx="20" cy="24" r="1.2"/><circle cx="26" cy="24" r="1.2"/></svg>`;
        if(type==='games') svg = `<svg class="dot-icon" viewBox="0 0 40 34"><circle cx="10" cy="16" r="1.5"/><circle cx="30" cy="16" r="1.5"/><circle cx="20" cy="16" r="1.2"/><circle cx="20" cy="10" r="1.2"/><circle cx="20" cy="22" r="1.2"/><circle cx="28" cy="12" r="1" style="fill:var(--yellow);"/><circle cx="32" cy="20" r="1" style="fill:var(--green);"/></svg>`;
        return `<div class="icon-cell">${svg}<span class="icon-label">${label}</span></div>`;
    }

    initEvents() {
        const $ = (id) => document.getElementById(id);
        if($('skip-btn')) $('skip-btn').onclick = () => this.goToMain();
        
        // Restore Menu Item Events
        ['mi-1','mi-2','mi-3','mi-4','mi-5','mi-h'].forEach(id => {
            const el = $(id);
            if(el) el.onclick = () => {
                if(id==='mi-5') this.goTab(2); // 게임/오락실 -> 채팅방(현재)
                else if(id==='mi-3' || id==='mi-4') this.goTab(1); // 동호회/자료실 -> 동호회게시판
                else if(id==='mi-h') alert('케텔 도움말 시스템입니다.');
                else this.goTab(0); // 뉴스/우편 -> 자유게시판
                if(id !== 'mi-h') this.switchLayer('layerBBS');
            };
        });

        const grid = $('main-icon-grid');
        if (grid) {
            const cells = grid.querySelectorAll('.icon-cell');
            cells.forEach((cell, idx) => {
                cell.onclick = () => {
                    if (idx >= 4) { // Bottom row: 게시판, 파일실, 동호회, 게임실
                        if (idx === 4) this.goTab(0); // 게시판
                        if (idx === 5) this.goTab(1); // 파일실 (동호회 게시판으로 대체)
                        if (idx === 6) this.goTab(1); // 동호회
                        if (idx === 7) alert('게임실은 준비 중입니다.');
                        this.switchLayer('layerBBS');
                    } else {
                        alert('연결 및 설정 메뉴는 준비 중입니다.');
                    }
                };
            });
        }

        if($('bbs-logo')) $('bbs-logo').onclick = () => this.switchLayer('layerMain');
        $('tab0').onclick = () => this.goTab(0);
        $('tab1').onclick = () => this.goTab(1);
        $('tab2').onclick = () => this.goTab(2);
        $('nav0-l').onclick = () => this.backList(0);
        $('pv0-back').onclick = () => this.backList(0);
        $('chatSendBtn').onclick = () => this.sendChat();
        $('chatInput').onkeydown = (e) => { if(e.key==='Enter') this.sendChat(); };
    }

    startLogic() {
        this.renderBBS(0);
        this.renderBBS(1);
        this.startConnectSequence();
        this.startClock();
    }

    switchLayer(id) {
        document.querySelectorAll('#pc-comm-scene .layer').forEach(l => l.classList.remove('on'));
        document.getElementById(id).classList.add('on');
    }

    goToMain() { this.switchLayer('layerMain'); }
    goTab(n) {
        for(let i=0;i<3;i++){
            document.getElementById('sc'+i).classList.remove('on');
            document.getElementById('tab'+i).classList.remove('on');
        }
        document.getElementById('sc'+n).classList.add('on');
        document.getElementById('tab'+n).classList.add('on');
    }

    backList(board) {
        document.getElementById('bbsListView'+board).style.display='flex';
        document.getElementById('bbsPostView'+board).style.display='none';
    }

    renderBBS(board) {
        const posts = board === 0 ? this.posts0 : this.posts1;
        const list = document.getElementById('bbsList'+board);
        list.innerHTML = '';
        posts.forEach((p, i) => {
            const row = document.createElement('div');
            row.className = 'bbs-row';
            row.innerHTML = `<span class="bn">${p.no}</span><span class="bt">${p.t}</span><span class="ba">${p.a}</span><span class="bv">${p.v}</span>`;
            row.onclick = () => this.readPost(board, i);
            list.appendChild(row);
        });
    }

    readPost(board, idx) {
        const posts = board === 0 ? this.posts0 : this.posts1;
        const p = posts[idx]; p.v++;
        document.getElementById('pv'+board+'Subject').textContent = p.t;
        document.getElementById('pv'+board+'Author').textContent = p.a;
        document.getElementById('pv'+board+'Date').textContent = p.d;
        document.getElementById('pv'+board+'Views').textContent = '조회 ' + p.v;
        document.getElementById('pv'+board+'Body').textContent = p.b;
        document.getElementById('bbsListView'+board).style.display = 'none';
        document.getElementById('bbsPostView'+board).style.display = 'block';
    }

    sendChat() {
        const inp = document.getElementById('chatInput');
        const msg = inp.value.trim(); if(!msg) return; inp.value='';
        this.addMsg('TIGER74', msg, 'me');
        setTimeout(() => {
            const r = this.autoMsgs[Math.floor(Math.random()*this.autoMsgs.length)];
            this.addMsg(r.nick, r.body, 'other');
        }, 1000 + Math.random() * 2000);
    }

    addMsg(nick, body, type) {
        const w = document.getElementById('chatMsgs');
        const div = document.createElement('div');
        div.className = 'cmsg ' + type;
        div.innerHTML = `<span class="ts">[${new Date().toLocaleTimeString()}]</span><span class="nick">${nick}:</span><span class="body"> ${body}</span>`;
        w.appendChild(div); w.scrollTop = w.scrollHeight;
    }

    startConnectSequence() {
        const logLines = [
            {t:'sys', m:'KETEL v2.0 for MS-DOS'}, {t:'info',m:'ATZ'}, {t:'ok', m:'OK'}, {t:'info',m:'ATDT 013146700'},
            {t:'info',m:'DIALING...'}, {t:'ok', m:'CONNECT 33600'}, {t:'ok', m:'CONNECTED TO KETEL BBS'}
        ];
        let logIdx = 0;
        const addLogSeq = () => {
            if(logIdx >= logLines.length) return;
            const l = logLines[logIdx];
            const div = document.createElement('div');
            div.className = 'log-line ' + l.t; div.textContent = l.m;
            document.getElementById('connLog').appendChild(div);
            logIdx++;
            this.timers.push(setTimeout(addLogSeq, 400 + Math.random() * 400));
        };
        this.timers.push(setTimeout(addLogSeq, 600));

        let pct = 0;
        const progTimer = setInterval(() => {
            if(pct >= 100) { clearInterval(progTimer); setTimeout(() => this.goToMain(), 600); return; }
            pct = Math.min(100, pct + Math.random() * 10 + 5);
            document.getElementById('progressFill').style.width = pct + '%';
            document.getElementById('progressPct').textContent = Math.floor(pct) + '%';
        }, 300);
        this.timers.push(progTimer);
    }

    startClock() {
        setInterval(() => {
            const now = new Date();
            const str = '1993-06-15 ' + now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
            if(document.getElementById('mainClock')) document.getElementById('mainClock').textContent = str;
        }, 1000);
    }

    renderTimeline() {
        const tlContainer = document.getElementById('ch4-timeline');
        // Use global styles from style.css
        let html = `<div class="timeline-container" id="timeline-scroll" style="position: absolute; top: 0; left: 0; right: 0; z-index: 10000; height: 40px; background-color: #080808; border-bottom: 1px solid #222;">`;
        this.db.chapters.forEach((ch, index) => {
            const startYear = ch.year_range.split('~')[0];
            const isCurrent = ch.id == 4;
            const stateClass = isCurrent ? 'active' : 'unlocked';
            html += `<div class="timeline-item ${stateClass}" data-id="${ch.id}" style="cursor:pointer; display: inline-flex; align-items: center; color: ${isCurrent ? '#f5f5dc' : '#888'}; font-size: 0.9rem; font-family: 'VT323', monospace;"><span class="timeline-year" style="${isCurrent ? 'border: 1px solid #f5f5dc; padding: 2px 5px;' : 'padding: 2px 5px;'}">[${startYear}]</span></div>`;
            if (index < this.db.chapters.length - 1) html += `<div class="timeline-connector" style="width: 20px; height: 1px; background-color: #333; margin: 0 5px;"></div>`;
        });
        html += `</div>`;
        tlContainer.innerHTML = html;
        tlContainer.querySelectorAll('.timeline-item').forEach(item => {
            item.onclick = () => {
                const id = Number(item.dataset.id);
                if (id !== 4) { this.exit(); this.gm.changeScene('ChapterScene', id); }
            };
        });
    }

    exit() {
        this.timers.forEach(t => { clearInterval(t); clearTimeout(t); });
        this.timers = [];
        document.getElementById('ui-layer').innerHTML = '';
        const css = document.getElementById('ch4-css');
        if (css) css.remove();
    }
}
