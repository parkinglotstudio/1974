/**
 * Sand Engine — AssetLoader
 * PixelJSON Sparse 및 상태 정의 JSON 비동기 로드 + 캐싱.
 * 같은 경로는 두 번 fetch하지 않음. 병렬 로드 지원.
 */
export default class AssetLoader {
    constructor() {
        this._cache   = new Map(); // path → parsed JSON
        this._pending = new Map(); // path → Promise (in-flight 중복 방지)
        this._base    = '';        // 상대 경로 앞에 붙일 베이스 (에디터에서 게임 폴더 지정용)
    }

    // 상대 경로(data/..., 절대/프로토콜 경로 제외) 앞에 붙일 베이스 경로 설정
    setBase(base) {
        this._base = base ?? '';
    }

    // 단일 에셋 로드. 캐시에 있으면 즉시 반환.
    async load(path) {
        if (this._cache.has(path))   return this._cache.get(path);
        if (this._pending.has(path)) return this._pending.get(path);

        const url = (this._base && !/^([a-z]+:)?\//i.test(path)) ? this._base + path : path;
        const promise = fetch(url)
            .then(r => {
                if (!r.ok) throw new Error(`[AssetLoader] ${r.status} — ${path}`);
                return r.json();
            })
            .then(data => {
                this._cache.set(path, data);
                this._pending.delete(path);
                console.log(`[AssetLoader] loaded: ${path}`);
                return data;
            })
            .catch(err => {
                this._pending.delete(path);
                throw err;
            });

        this._pending.set(path, promise);
        return promise;
    }

    // 여러 에셋 병렬 로드. 순서 보장된 배열 반환.
    async loadMany(paths) {
        return Promise.all(paths.map(p => this.load(p)));
    }

    // 캐시에서 즉시 반환 (없으면 null)
    get(path) {
        return this._cache.get(path) ?? null;
    }

    has(path) {
        return this._cache.has(path);
    }

    // 특정 에셋 캐시에서 제거
    evict(path) {
        this._cache.delete(path);
    }

    // 전체 캐시 비우기
    evictAll() {
        this._cache.clear();
    }
}
