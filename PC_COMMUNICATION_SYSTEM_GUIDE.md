# 📡 PC COMMUNICATION SYSTEM GUIDE (Chapter 04)

본 문서는 'NO MEMORY' 프로젝트의 메타 커뮤니티인 **KETEL PC 통신 시스템**의 아키텍처와 구축 가이드를 정리한 자산 관리 파일입니다.

---

## 🏗️ System Philosophy
- **Identity**: 게임 내 한 스테이지를 넘어, 프로젝트 전체의 **공지, 랭킹, 유저 소통**을 담당하는 메타 인터페이스.
- **UX Concept**: 90년대 터미널 환경의 100% 재현과 현대적인 가독성의 조화.

---

## 🛠️ Technical Architecture
### 1. Layer-Based Navigation
화면 전체를 새로고침하지 않고 CSS 클래스(`on` / `off`) 전환을 통해 페이지를 이동하는 **Single Page Application (SPA)** 구조입니다.
- **`layerMain`**: 공지사항 및 1~5번 메뉴가 포함된 대문.
- **`layerBBS`**: 게시판 리스트 및 글 읽기 화면.
- **`layerChat`**: 실시간 채팅 인터페이스.

### 2. Input & Command System
마우스 클릭뿐만 아니라, 향후 텍스트 명령어를 통한 인터랙션을 고려한 설계입니다.
- **Menu Logic**: 1(뉴스), 2(우편), 3(동호회), 4(자료실), 5(게임실)의 숫자 기반 맵핑.

---

## 🎨 Design & Visual Assets
### 1. Blue-Screen Monochrome Theme
- **Color Variable**: `--cyan` (#00ffff)과 `--bg` (#000033)를 주력으로 사용.
- **Font**: `VT323` (Pixel Mono Font)를 적용하여 터미널 감성 극대화.

### 2. High-Detail Pixel Art Integration
AI로 생성된 고해상도 이미지를 PC 통신 환경에 맞게 최적화하는 필터 기법입니다.
- **Filter**: `grayscale(1) brightness(1.2) sepia(1) hue-rotate(140deg)`
- **Rendering**: `image-rendering: pixelated` 속성을 통해 이미지 외곽선을 도트 단위로 선명하게 유지.

---

## 💬 Community Features (Planned)
- **BBS Sync**: `data.js`의 게시글 데이터와 실시간 연동하여 실제 프로젝트 공지 노출.
- **NPC Chat Bot**: 채팅방에서 유저의 키워드에 반응하여 정보를 제공하는 가이드봇 기능.
- **Member Rank**: 게임 스코어를 기반으로 한 유저 등급 및 명예의 전당 게시판.

---

## 📂 Related Files
- **Logic**: [js/scenes/PCCommunicationScene.js](file:///c:/1974/js/scenes/PCCommunicationScene.js)
- **Style**: [css/chapter4.css](file:///c:/1974/css/chapter4.css)
- **Reference**: [PLANDATA/ch4_ketel_full.html](file:///c:/1974/PLANDATA/ch4_ketel_full.html)

---

> [!IMPORTANT]
> 챕터 4는 '게임'이 아닌 '커뮤니티 서비스'입니다. 모든 업데이트 시 유저 간의 **상호작용성**과 **정보 전달력**을 최우선으로 고려해야 합니다.
