# 🎨 PIXEL ANIMATION ASSETS & TECH GUIDE

본 문서는 'NO MEMORY' 프로젝트의 시각적 정체성인 **고감도 픽셀 애니메이션** 구현을 위해 사용된 기술과 연출 기법을 집대성한 자산 관리 파일입니다.

---

## 📽️ Reference & Inspiration
- **Source Media**: [PLANDATA/KakaoTalk_20260509_194805553.mp4](file:///c:/1974/PLANDATA/KakaoTalk_20260509_194805553.mp4)
- **Production Brief**: [Animation Production Brief.txt](file:///c:/1974/PLANDATA/Animation%20Production%20Brief.txt)
- **Concept**: 1-bit monochrome, 12 FPS, CRT Aesthetic, Cinematic Square Viewport.

---

## ⚙️ Core Animation Engine
### 1. 12 FPS Ticking System
의도적인 저프레임(Low FPS)을 통해 아날로그 도트 감성을 극대화합니다.
```javascript
this.fps = 12;
this.tickInterval = 1000 / this.fps;
// requestAnimationFrame 내에서 now - lastTick 체크로 구현
```

### 2. Vortex Particle Decay (Scene 03)
텍스트나 이미지가 보텍스(소용돌이)를 그리며 분해되는 고급 입자 효과입니다.
- **Logic**: 각 파티클에 `angle`과 `dist` 속성을 부여하여 중심점에서 회전하며 멀어지도록 계산.
- **Effect**: 기억의 붕괴 또는 의식의 파편화를 상징.

### 3. Dithering Transition & Border
픽셀의 밀도를 조절하여 1비트 환경에서 부드러운 명암과 경계를 연출합니다.
- **Algorithm**: `(x + y + currentFrame) % 8 === 0` 로직을 활용해 체커보드 형태의 깜빡이는 테두리 구현.

---

## 🏃 Character Motion States
기획서의 '성장 서사'를 반영한 4단계 픽셀 애니메이션 데이터입니다.
1. **BABY (Spawned)**: 30x15 사이즈, 기어가는 모션.
2. **KID (Growth)**: 12x25 사이즈, 아장아장 걷는 모션.
3. **RUNNER (Timeline)**: 16x30 사이즈, 역동적인 질주 모션(Bobbing & Glitch 적용).

---

## 🎇 Dynamic Backgrounds
- **Stardust**: Z-axis 깊이감을 활용한 3D 입자 배경.
- **Grid Warp**: 베지어 곡선(Bezier Curve)을 활용해 일렁이는 공간의 왜곡 표현.
- **Speed Lines**: 수평 획의 길이를 조절해 속도감 극대화.

---

## 🌈 Color Transition Strategy
- **Rule**: Scene 01~09까지는 철저히 **1-bit (White/Black)** 유지.
- **Awakening**: Scene 10(오락실) 조우 시 **Cyan(#0ff), Magenta(#f0f), Yellow(#ff0)** 네온 컬러 폭발.
- **Effect**: 디지털 문명과의 첫 접촉에 따른 감각의 확장을 시각적으로 전달.

---

> [!TIP]
> 모든 애니메이션 로직은 `js/scenes/IntroScene.js`에 엔진화 되어 있으며, 새로운 시퀀스 데이터는 `js/data/IntroCutscene.js`에만 추가하면 즉시 화려한 연출이 가능합니다.
