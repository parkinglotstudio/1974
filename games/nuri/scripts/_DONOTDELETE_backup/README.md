# ⚠️ 지우지 말 것 (DO NOT DELETE)

이 폴더는 **이동 / 지상 이동 / 공중(점프·rise·spin_fall) 연출** 코드 백업이다.
컨트롤 스킴을 새로 만들면서(키보드+조이스틱 이동, 스페이스/빈클릭 점프) 기존
연출을 잃지 않으려고 보존한다.

- `NuriGame.20260623.movement-aerial.DONOTDELETE.js` — 2026-06-23 시점 NuriGame.js 전체 스냅샷.

## 보존 대상(이 안에 들어있는 핵심 연출)
- 지상 이동: `_startMove` → `_startPixelMoveBlend` / `_renderPixelMove` (모래시계 픽셀무브)
- 공중 이동: `_startAerialMove`, rise / spin_fall / hang / land 상태머신, `_renderSeqOverlay`
- 클릭 타깃 이동(머리 위=공중, 아래=지상) 분기

새 점프(스페이스/빈클릭 = 약 3m 포물선 점프)를 만들더라도 위 연출 로직은
참조/재사용할 수 있게 남겨둔다. 삭제·덮어쓰기 금지.
