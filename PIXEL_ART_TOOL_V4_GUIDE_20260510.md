# 🎨 AI Pixel Art Animation Tool v4.0 - Technical Documentation
**Date:** 2026-05-10  
**Project:** Antigravity 1974  
**Developer:** Dani (AI Assistant) & Oppa (Game Designer)

## 🌟 Overview
이 도구는 'Antigravity 1974' 게임의 아바타 애니메이션 데이터를 생성하고 관리하기 위한 **전문가용 AI 픽셀 아트 에디터**입니다. 일반적인 드로잉 도구를 넘어, AI와의 협업 및 고도화된 인터랙션을 통해 고품질의 픽셀 애니메이션을 효율적으로 제작하는 데 최적화되어 있습니다.

---

## 🚀 Key Features (주요 기능)

### 1. AI-Driven Pixel Manipulation (AI 협업 편집)
- **Natural Language Commands:** 채팅창을 통해 "입을 벌려줘", "눈을 깜빡이게 해줘" 등 자연어 명령어로 픽셀 데이터를 조작할 수 있습니다.
- **AI Bridge:** 사용자의 명령을 분석하여 픽셀 좌표 데이터를 직접 수정하는 알고리즘을 내장하고 있습니다.

### 2. Multi-Frame Animation System (다중 프레임 애니메이션)
- **Timeline Management:** 최대 5개의 독립된 애니메이션 프레임을 관리할 수 있습니다.
- **FPS Control:** 1~12 FPS 범위 내에서 실시간으로 애니메이션 속도를 조절하고 프리뷰할 수 있습니다.
- **Frame Duplication:** 현재 프레임을 다음 슬롯으로 복제하여 효율적인 프레임 바이 프레임(Frame-by-frame) 작업을 지원합니다.

### 3. Professional Interaction (피그마 방식 인터랙션)
- **Figma-style Panning:** `Spacebar + Mouse Right Click` (또는 휠 클릭)을 통해 캔버스를 자유롭게 이동(Pan)할 수 있습니다.
- **Smart Zoom:** `Ctrl + Mouse Wheel`을 통해 픽셀 단위까지 정밀하게 확대/축소할 수 있으며, 확대 시 그리드 가이드가 자동으로 활성화됩니다.
- **Drawing Lock:** 의도치 않은 클릭으로 데이터가 오염되는 것을 방지하기 위해 수동 마우스 그리기 기능을 비활성화하고 로드/AI 명령 기반으로만 작동합니다.

### 4. Advanced Asset Workflow (스마트 에셋 관리)
- **Native File Picker:** [LOAD JSON] 클릭 시 윈도우 탐색기를 통해 파일을 직접 선택하여 불러올 수 있습니다.
- **Aspect Ratio Fix:** 이미지를 불러올 때 원래의 비율을 유지하며, 캔버스 크기에 맞춰 자동으로 중앙 정렬 및 픽셀화 처리를 수행합니다.
- **Duplicate Protection:** 저장 시 동일한 파일명이 존재할 경우 사용자에게 덮어쓰기 여부를 확인하는 세이프티 가드가 작동합니다.
- **Path Management:** `assets/pixelart/` 외에도 사용자가 원하는 폴더 경로를 지정하여 파일을 관리할 수 있습니다.

### 5. Session Persistence (세션 유지 기능)
- **Full Refresh Button:** 툴 상단의 `🔄 FULL REFRESH` 버튼을 통해 브라우저를 완전히 새로고침하더라도 작업 중이던 툴로 즉시 복귀할 수 있습니다.
- **Scene Recovery:** `sessionStorage`를 활용하여 마지막 활성 장면을 기억하고, 게임 재부팅 시 인트로를 생략하고 해당 장면으로 자동 이동하는 로직이 구현되어 있습니다.

---

## 🛠️ Technical Stack (사용 기술)

### **Core Technologies**
- **Vanilla JavaScript (ES6+):** 프레임워크 없는 순수 자바스크립트로 구현되어 빠른 성능과 가벼운 로딩 속도를 보장합니다.
- **HTML5 Canvas API:** 픽셀 렌더링, 이미지 프로세싱, 실시간 프리뷰 루프 구현에 사용되었습니다.
- **CSS3 (Modern UI):** Glassmorphism 스타일, Flexbox/Grid 레이아웃을 사용하여 프로페셔널한 에디터 UI를 구현했습니다.

### **Data Architecture**
- **Coordinate-based JSON:** 픽셀을 `[x, y, color]` 형태의 배열로 저장하여 데이터 효율성을 극대화했습니다. (128x128 고해상도 대응)
- **Frame-based Structure:** `{ width, height, fps, frames: [{ pixels }] }` 형태의 구조로 게임 내 렌더러와 완벽하게 호환됩니다.

### **Integration**
- **AvatarRenderer Bridge:** 제작된 JSON은 게임 내 `AvatarRenderer` 및 `ChapterScene`의 애니메이션 엔진과 즉시 연동되어 인벤토리 등에서 살아 움직이는 캐릭터로 표시됩니다.

---

## 📅 Version History
- **v4.0 (2026-05-10):** 피그마 스타일 팬닝, 파일 탐색기 도입, 이미지 비율 유지 로직 추가, 저장 경고 시스템 장착.
- **v3.5 (2026-05-10):** 타임라인 기반 멀티 프레임 시스템 및 AI 채팅 명령 기능 초기 구현.

---
**Documentation by Dani, your sexy & professional assistant.** 🍹✨🪄💖
