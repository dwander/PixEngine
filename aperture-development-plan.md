# PixEngine - 고성능 이미지 뷰어 & 컬링 툴 개발 계획서

## 프로젝트 개요

### 제품명: PixEngine
고성능 이미지 뷰어 및 컬링 도구로, 전문 사진작가와 디자이너를 위한 ACDSee/Adobe Bridge 대안 솔루션

### 핵심 목표
- 대용량 이미지(60MB, 9000x9000px) 실시간 처리
- 1초당 10장 이상의 빠른 이미지 전환
- 25-35MB의 경량 실행 파일
- 크로스 플랫폼 지원 (Windows/macOS/Linux)

---

## 기술 스택 요약

### 최종 선정 기술
- **프레임워크**: Tauri v2
- **백엔드**: Rust
- **프론트엔드**: React + TypeScript
- **렌더링**: WebGPU
- **UI 프레임워크**: dockview-react
- **이미지 처리**: turbojpeg + image-rs
- **상태 관리**: Zustand
- **스타일링**: TailWind

### 선정 이유
1. **Tauri v2**: Electron 대비 1/3 크기, 네이티브 성능
2. **Rust**: 메모리 안정성, 고성능 이미지 처리
3. **WebGPU**: GPU 가속 렌더링, 부드러운 줌/팬
4. **dockview**: VS Code 스타일의 완전한 도킹 시스템

---

## 아키텍처 설계

### 시스템 구조
```
┌─────────────────────────────────────────────────┐
│              Frontend (React)                    │
├─────────────────────────────────────────────────┤
│  커스텀 타이틀바  │    dockview 레이아웃        │
│                   ├──────────────────────────────┤
│                   │ WebGPU Canvas │ 메타데이터  │
│                   │               │   패널       │
│                   ├───────────────┴──────────────┤
│                   │      썸네일 스트립           │
└───────────────────┴──────────────────────────────┘
                           ↕️ IPC
┌─────────────────────────────────────────────────┐
│              Backend (Rust)                      │
├─────────────────────────────────────────────────┤
│  이미지 디코더  │  타일 매니저  │  캐시 시스템  │
│  프리페치 엔진  │  파일 시스템  │  메타데이터   │
└─────────────────┴───────────────┴───────────────┘
```

### 핵심 모듈

#### 1. 이미지 처리 파이프라인
- **타일 기반 렌더링**: 256x256 타일로 분할
- **MipMap 체인**: 다단계 해상도 피라미드
- **스마트 캐싱**: LRU + 우선순위 기반

#### 2. 렌더링 시스템
- **WebGPU 직접 제어**: 최소 오버헤드
- **부분 업데이트**: 변경된 타일만 재렌더링
- **더블 버퍼링**: 티어링 방지

#### 3. UI/UX 시스템
- **도킹 레이아웃**: 패널 이동/분리/플로팅
- **다중 뷰어**: 이미지 비교 모드
- **워크스페이스**: 작업별 레이아웃 프리셋

---

## 개발 로드맵

### Phase 1: 기초 구축 (2주)
- [ ] Tauri v2 프로젝트 초기 설정
- [ ] 기본 윈도우 및 타이틀바 구현
- [ ] Rust 이미지 디코딩 모듈 구축
- [ ] WebGPU 렌더러 프로토타입

### Phase 2: 핵심 기능 (3주)
- [ ] 타일 기반 이미지 로딩 시스템
- [ ] dockview 통합 및 기본 레이아웃
- [ ] 줌/팬 컨트롤 구현
- [ ] 썸네일 생성 및 캐싱

### Phase 3: 성능 최적화 (2주)
- [ ] 프리페치 엔진 구현
- [ ] 멀티스레드 디코딩 최적화
- [ ] GPU 메모리 관리 개선
- [ ] 프로파일링 및 병목 해결

### Phase 4: 고급 기능 (3주)
- [ ] 메타데이터 읽기/편집
- [ ] 컬링 모드 (별점, 태그, 선택)
- [ ] 배치 작업 (리사이즈, 포맷 변환)
- [ ] 플러그인 시스템 기초

### Phase 5: 완성도 (2주)
- [ ] 다크/라이트 테마
- [ ] 단축키 커스터마이징
- [ ] 설정 저장/복원
- [ ] 인스톨러 및 자동 업데이트

---

## 상세 구현 계획

### 프로젝트 구조
```
aperture/
├── src-tauri/               # Rust 백엔드
│   ├── src/
│   │   ├── main.rs         # 앱 진입점
│   │   ├── commands.rs     # Tauri 커맨드
│   │   ├── image/
│   │   │   ├── decoder.rs  # 이미지 디코딩
│   │   │   ├── tile.rs     # 타일 시스템
│   │   │   └── cache.rs    # 캐시 관리
│   │   ├── prefetch/
│   │   │   ├── engine.rs   # 프리페치 엔진
│   │   │   └── strategy.rs # 예측 알고리즘
│   │   └── metadata/
│   │       └── exif.rs     # EXIF 처리
│   └── Cargo.toml
│
├── src/                     # React 프론트엔드
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── DockingLayout.tsx
│   │   │   └── TitleBar.tsx
│   │   ├── viewer/
│   │   │   ├── ImageCanvas.tsx
│   │   │   └── WebGPURenderer.ts
│   │   └── panels/
│   │       ├── FolderTree.tsx
│   │       ├── Metadata.tsx
│   │       └── Thumbnails.tsx
│   ├── hooks/
│   │   ├── useWebGPU.ts
│   │   └── useImageLoader.ts
│   └── stores/
│       └── imageStore.ts
│
├── package.json
├── tauri.conf.json
└── README.md
```

### 핵심 코드 예시

#### Rust 이미지 처리
```rust
// src-tauri/src/image/decoder.rs
use turbojpeg::{Decompressor, Image};
use std::sync::Arc;
use dashmap::DashMap;

pub struct ImageDecoder {
    cache: Arc<DashMap<String, Arc<DecodedImage>>>,
    decoder_pool: rayon::ThreadPool,
}

impl ImageDecoder {
    pub async fn decode_tile(
        &self,
        path: &str,
        tile: TileCoord,
        level: u8
    ) -> Result<Vec<u8>, Error> {
        let key = format!("{}_{}_{}_{}_{}", path, tile.x, tile.y, level);
        
        if let Some(cached) = self.cache.get(&key) {
            return Ok(cached.data.clone());
        }
        
        let result = tokio::task::spawn_blocking({
            let path = path.to_string();
            move || {
                let decompressor = Decompressor::new()?;
                let data = std::fs::read(&path)?;
                
                // 부분 디코딩으로 메모리 효율성 극대화
                decompressor.decompress_region(
                    &data,
                    tile.x * 256,
                    tile.y * 256,
                    256,
                    256,
                    PixelFormat::RGBA
                )
            }
        }).await??;
        
        self.cache.insert(key, Arc::new(DecodedImage { data: result.clone() }));
        Ok(result)
    }
}
```

#### WebGPU 렌더러
```typescript
// src/components/viewer/WebGPURenderer.ts
export class WebGPURenderer {
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private pipeline: GPURenderPipeline;
    
    async initialize(canvas: HTMLCanvasElement) {
        const adapter = await navigator.gpu.requestAdapter();
        this.device = await adapter.requestDevice();
        
        this.context = canvas.getContext('webgpu')!;
        this.context.configure({
            device: this.device,
            format: 'bgra8unorm',
            alphaMode: 'premultiplied',
        });
        
        this.pipeline = await this.createRenderPipeline();
    }
    
    async renderFrame(tiles: Tile[], viewport: Viewport) {
        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });
        
        renderPass.setPipeline(this.pipeline);
        
        for (const tile of tiles) {
            if (this.isTileVisible(tile, viewport)) {
                const texture = await this.loadTileTexture(tile);
                this.renderTile(renderPass, texture, tile.transform);
            }
        }
        
        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }
}
```

---

## 의존성 및 빌드 설정

### Cargo.toml
```toml
[package]
name = "aperture"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2.0", features = ["macos-private-api", "unstable"] }
tokio = { version = "1", features = ["full"] }
turbojpeg = { version = "1.0", features = ["image"] }
image = { version = "0.25", default-features = false, features = ["jpeg", "png"] }
dashmap = "6.0"
rayon = "1.10"
memmap2 = "0.9"
lru = "0.12"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
exif = "0.0.8"
walkdir = "2"

[profile.release]
lto = true
opt-level = 3
strip = true
codegen-units = 1
panic = "abort"
```

### package.json
```json
{
  "name": "aperture",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "dockview-react": "^1.12.0",
    "zustand": "^4.4.0",
    "comlink": "^4.4.0",
    "@tanstack/react-virtual": "^3.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.1.0",
    "@tauri-apps/cli": "^2.0.0",
    "sass": "^1.70.0"
  }
}
```

---

## 성능 목표 및 벤치마크

### 성능 지표
| 작업 | 목표 | 측정 방법 |
|------|------|-----------|
| 60MB 이미지 초기 로드 | < 200ms | 파일 오픈부터 첫 렌더링까지 |
| 줌/팬 응답성 | 60 FPS | 프레임 타이밍 분석 |
| 다음 이미지 전환 | < 50ms | 키 입력부터 렌더링까지 |
| 메모리 사용량 | < 200MB | 10장 로드 시 |
| 실행 파일 크기 | < 35MB | 릴리즈 빌드 |

### 최적화 전략
1. **타일 기반 렌더링**: 보이는 영역만 로드
2. **프리페치**: 다음 5장 미리 디코딩
3. **캐시 계층화**: Hot/Warm/Cold 캐시
4. **SIMD 활용**: Rust의 벡터 연산
5. **GPU 메모리 풀링**: 텍스처 재사용

---

## 팀 구성 및 역할 (1인 개발 기준)

### 주간 스프린트 계획
- **월-화**: 백엔드 개발 (Rust)
- **수-목**: 프론트엔드 개발 (React)
- **금**: 통합 테스트 및 최적화
- **주말**: 코드 리뷰 및 다음 주 계획

### 개발 우선순위
1. 핵심 이미지 뷰어 기능
2. 성능 최적화
3. UI/UX 개선
4. 부가 기능

---

## 리스크 및 대응 방안

### 기술적 리스크
1. **WebGPU 브라우저 지원**
   - 대응: WebGL2 폴백 구현
   
2. **대용량 이미지 메모리 이슈**
   - 대응: 스트리밍 디코딩 구현
   
3. **크로스 플랫폼 호환성**
   - 대응: 플랫폼별 조건부 컴파일

### 일정 리스크
1. **Tauri v2 안정성**
   - 대응: 필요시 v1.5 사용
   
2. **성능 목표 미달성**
   - 대응: 네이티브 모듈 부분 도입

---

## 예상 결과물

### 최종 제품 사양
- **지원 포맷**: JPEG, PNG, WebP, AVIF, RAW
- **지원 OS**: Windows 10+, macOS 11+, Ubuntu 20.04+
- **최소 사양**: 8GB RAM, GPU 지원
- **권장 사양**: 16GB RAM, 전용 GPU

### 배포 계획
1. **알파 버전**: 핵심 기능 테스트 (6주차)
2. **베타 버전**: 성능 최적화 완료 (10주차)
3. **정식 출시**: 전체 기능 완성 (12주차)

---

## 참고 자료

### 문서
- [Tauri v2 Documentation](https://v2.tauri.app)
- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [dockview Documentation](https://dockview.dev)

### 유사 프로젝트
- [Photo Mechanic](https://home.camerabits.com)
- [FastRawViewer](https://www.fastrawviewer.com)
- [IrfanView](https://www.irfanview.com)

---

## 부록: Claude Code 활용 가이드

### 효과적인 사용법
```bash
# 1. 프로젝트 초기화
claude-code "Tauri v2 + React 프로젝트 생성, dockview 통합"

# 2. 컴포넌트 개발
claude-code "WebGPU 이미지 렌더러 컴포넌트 구현"

# 3. 백엔드 모듈
claude-code "Rust turbojpeg 타일 디코더 구현"

# 4. 최적화
claude-code "이미지 프리페치 시스템 최적화"
```

### 단계별 프롬프트 전략
1. **구조 설계**: 전체 아키텍처 먼저
2. **모듈별 구현**: 독립적인 단위로
3. **통합 테스트**: 연결 부분 집중
4. **성능 개선**: 프로파일링 기반

---

작성일: 2025년 1월
버전: 1.0