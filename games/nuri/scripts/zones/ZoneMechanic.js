// ZoneMechanic.js — 구역(씬) 메커니즘 플러그인 베이스
// ─────────────────────────────────────────────────────────────
// NuriGame은 전투/구역 로직을 직접 들지 않고 이 인터페이스로 위임한다.
// 씬마다 다른 컨셉(테트리스 벽쌓기 등)을 갈아끼우는 "교체 슬롯".
// 1번 구현체 = WallBuildMechanic. 이후 DefaultCombat·기타 컨셉을 형제로 추가.
//
// 호출 규약:
//   onEnter()              구역 진입 1회
//   update(dt, now)        매 프레임 로직
//   render(ctx)            매 프레임 렌더 — ctx는 월드좌표(translate(-cameraX)) 안에서 전달됨
//   onEnemyArrived(enemy)  Builder 등 적이 목표 지점 도달
//   isCleared()            구역 목표 달성 → 통로 활성화(후속 Phase)
//   onExit()               구역 이탈/정리

export default class ZoneMechanic {
    constructor(game, cfg = {}) { this.game = game; this.cfg = cfg; }
    onEnter() {}
    update(dt, now) {}
    render(ctx) {}
    onEnemyArrived(enemy) {}
    isCleared() { return false; }
    onExit() {}
}
