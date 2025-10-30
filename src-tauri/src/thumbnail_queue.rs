use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock, Semaphore};
use tokio::time::{sleep, Duration};
use tauri::{AppHandle, Emitter};

use crate::thumbnail::{self, ThumbnailResult};
use crate::idle_detector;

/// 고화질 썸네일 생성 취소 플래그 (전역)
static HQ_GENERATION_CANCELLED: AtomicBool = AtomicBool::new(false);

// HQ 썸네일 생성 상수
/// HQ 썸네일 최대 동시 생성 개수
const HQ_MAX_CONCURRENT: usize = 3;
/// 유휴 시간 감지 임계값 (밀리초)
const IDLE_THRESHOLD_MS: u64 = 3000;
/// 유휴 상태 재확인 간격 (밀리초)
const IDLE_CHECK_INTERVAL_MS: u64 = 500;

/// 썸네일 생성 요청
#[derive(Debug, Clone)]
pub struct ThumbnailRequest {
    pub path: String,
    pub priority: i32, // 높을수록 우선순위 높음
    pub index: usize,  // 이미지 목록에서의 인덱스
}

/// 진행 상태
#[derive(Debug, Clone, serde::Serialize)]
pub struct ThumbnailProgress {
    pub completed: usize,
    pub total: usize,
    pub current_path: String,
}

/// 썸네일 큐 관리자
pub struct ThumbnailQueueManager {
    /// 대기 중인 요청들
    queue: Arc<Mutex<VecDeque<ThumbnailRequest>>>,
    /// 완료된 썸네일들 (path -> result)
    completed: Arc<RwLock<HashMap<String, ThumbnailResult>>>,
    /// 전체 이미지 수
    total: Arc<RwLock<usize>>,
    /// 일시정지 상태
    paused: Arc<RwLock<bool>>,
    /// 처리 중 플래그
    is_processing: Arc<RwLock<bool>>,
    /// Tauri 앱 핸들
    app_handle: AppHandle,
}

impl ThumbnailQueueManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            completed: Arc::new(RwLock::new(HashMap::new())),
            total: Arc::new(RwLock::new(0)),
            paused: Arc::new(RwLock::new(false)),
            is_processing: Arc::new(RwLock::new(false)),
            app_handle,
        }
    }

    /// 이미지 목록으로 큐 초기화
    pub async fn initialize(&self, image_paths: Vec<String>) {
        let mut queue = self.queue.lock().await;
        let mut total = self.total.write().await;
        let mut completed = self.completed.write().await;

        // 기존 큐 초기화
        queue.clear();
        completed.clear();

        // 전체 개수 설정
        *total = image_paths.len();

        // 큐에 추가 (초기 우선순위는 인덱스 순서)
        for (index, path) in image_paths.into_iter().enumerate() {
            queue.push_back(ThumbnailRequest {
                path,
                priority: index as i32,
                index,
            });
        }
    }

    /// 우선순위 업데이트 (뷰포트 내 이미지들)
    pub async fn update_priorities(&self, visible_indices: Vec<usize>) {
        let mut queue = self.queue.lock().await;

        // 뷰포트 내 이미지는 높은 우선순위 (음수로)
        let mut requests: Vec<_> = queue.drain(..).collect();

        for request in &mut requests {
            if visible_indices.contains(&request.index) {
                // 뷰포트 내: 음수 우선순위 (인덱스가 작을수록 더 높음)
                request.priority = -(request.index as i32 + 1000);
            } else {
                // 뷰포트 밖: 인덱스 그대로
                request.priority = request.index as i32;
            }
        }

        // 우선순위 순으로 정렬 (낮은 값이 먼저)
        requests.sort_by_key(|r| r.priority);

        // 다시 큐에 넣기
        *queue = requests.into_iter().collect();
    }

    /// 일시정지
    pub async fn pause(&self) {
        let mut paused = self.paused.write().await;
        *paused = true;
    }

    /// 재개
    pub async fn resume(&self) {
        let mut paused = self.paused.write().await;
        *paused = false;
    }

    /// 일시정지 상태 확인
    pub async fn is_paused(&self) -> bool {
        *self.paused.read().await
    }

    /// 진행 중인지 확인
    pub async fn is_processing(&self) -> bool {
        *self.is_processing.read().await
    }

    /// 완료된 썸네일 가져오기
    pub async fn get_completed(&self, path: &str) -> Option<ThumbnailResult> {
        let completed = self.completed.read().await;
        completed.get(path).cloned()
    }

    /// 모든 완료된 썸네일 가져오기
    pub async fn get_all_completed(&self) -> HashMap<String, ThumbnailResult> {
        let completed = self.completed.read().await;
        completed.clone()
    }

    /// 큐에서 다음 작업 가져오기
    async fn pop_next(&self) -> Option<ThumbnailRequest> {
        let mut queue = self.queue.lock().await;
        queue.pop_front()
    }

    /// 썸네일 생성 워커 시작
    pub async fn start_worker(&self) {
        // 이미 실행 중이면 무시
        {
            let mut is_processing = self.is_processing.write().await;
            if *is_processing {
                return;
            }
            *is_processing = true;
        }

        let queue = Arc::clone(&self.queue);
        let completed = Arc::clone(&self.completed);
        let total = Arc::clone(&self.total);
        let paused = Arc::clone(&self.paused);
        let is_processing = Arc::clone(&self.is_processing);
        let app_handle = self.app_handle.clone();

        // 워커 스레드 시작
        tokio::spawn(async move {
            // CPU 코어의 25% 사용 (최소 1개)
            let max_workers = (num_cpus::get() / 4).max(1);
            let semaphore = Arc::new(tokio::sync::Semaphore::new(max_workers));

            let mut handles = vec![];

            loop {
                // 일시정지 확인
                if *paused.read().await {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    continue;
                }

                // 큐에서 다음 작업 가져오기
                let request = {
                    let mut q = queue.lock().await;
                    q.pop_front()
                };

                match request {
                    Some(req) => {
                        let permit = semaphore.clone().acquire_owned().await.unwrap();
                        let completed_clone = Arc::clone(&completed);
                        let total_clone = Arc::clone(&total);
                        let app_handle_clone = app_handle.clone();

                        let handle = tokio::spawn(async move {
                            // 썸네일 생성
                            match thumbnail::generate_thumbnail(&app_handle_clone, &req.path).await {
                                Ok(result) => {
                                    // 완료 목록에 추가
                                    {
                                        let mut comp = completed_clone.write().await;
                                        comp.insert(req.path.clone(), result.clone());
                                    }

                                    // 진행 상태 전송
                                    let completed_count = {
                                        let comp = completed_clone.read().await;
                                        comp.len()
                                    };
                                    let total_count = *total_clone.read().await;

                                    let progress = ThumbnailProgress {
                                        completed: completed_count,
                                        total: total_count,
                                        current_path: req.path.clone(),
                                    };

                                    // Tauri 이벤트 전송
                                    let _ = app_handle_clone.emit("thumbnail-progress", &progress);
                                    let _ = app_handle_clone.emit("thumbnail-completed", &result);
                                }
                                Err(e) => {
                                    eprintln!("Failed to generate thumbnail for {}: {}", req.path, e);
                                }
                            }

                            drop(permit);
                        });

                        handles.push(handle);
                    }
                    None => {
                        // 큐가 비었으면 완료
                        break;
                    }
                }
            }

            // 모든 작업 완료 대기
            for handle in handles {
                let _ = handle.await;
            }

            // 처리 완료 플래그
            *is_processing.write().await = false;

            // 완료 이벤트 전송
            let _ = app_handle.emit("thumbnail-all-completed", true);
        });
    }
}

/// 기존 HQ 썸네일 즉시 로드 (유휴 시간 대기 없음)
pub async fn load_existing_hq_thumbnails(app_handle: AppHandle, image_paths: Vec<String>) {
    let total = image_paths.len();

    tokio::spawn(async move {
        let completed = Arc::new(AtomicUsize::new(0));
        let semaphore = Arc::new(Semaphore::new(HQ_MAX_CONCURRENT));

        let mut tasks = Vec::new();

        for (_index, path) in image_paths.iter().enumerate() {
            let app_handle = app_handle.clone();
            let path = path.clone();
            let completed = Arc::clone(&completed);
            let semaphore = Arc::clone(&semaphore);

            let task = tokio::spawn(async move {
                // 세마포어 획득
                let _permit = semaphore.acquire().await.unwrap();

                // 기존 HQ 썸네일 로드 (유휴 시간 대기 없음)
                match thumbnail::generate_hq_thumbnail(&app_handle, &path).await {
                    Ok(result) => {
                        let count = completed.fetch_add(1, Ordering::SeqCst) + 1;

                        // 진행 상태 전송
                        let progress = ThumbnailProgress {
                            completed: count,
                            total,
                            current_path: path.clone(),
                        };

                        let _ = app_handle.emit("thumbnail-hq-progress", &progress);
                        let _ = app_handle.emit("thumbnail-hq-completed", &result);
                    }
                    Err(e) => {
                        eprintln!("Failed to load existing HQ thumbnail for {}: {}", path, e);
                    }
                }
            });

            tasks.push(task);
        }

        // 모든 작업 완료 대기
        for task in tasks {
            let _ = task.await;
        }

        // 완료 이벤트 전송
        let _ = app_handle.emit("thumbnail-hq-existing-loaded", true);
    });
}

/// 고화질 DCT 썸네일 생성 워커 (병렬 처리, 유휴 시간 대기)
pub async fn start_hq_thumbnail_worker(app_handle: AppHandle, image_paths: Vec<String>) {
    let total = image_paths.len();

    // 새 작업 시작 전 취소 플래그 초기화
    HQ_GENERATION_CANCELLED.store(false, Ordering::SeqCst);

    tokio::spawn(async move {
        let completed = Arc::new(AtomicUsize::new(0));
        let semaphore = Arc::new(Semaphore::new(HQ_MAX_CONCURRENT));

        let mut tasks = Vec::new();

        for (_index, path) in image_paths.iter().enumerate() {
            // 취소 플래그 확인
            if HQ_GENERATION_CANCELLED.load(Ordering::SeqCst) {
                eprintln!("HQ thumbnail generation cancelled");
                let _ = app_handle.emit("thumbnail-hq-cancelled", true);
                break;
            }

            let app_handle = app_handle.clone();
            let path = path.clone();
            let completed = Arc::clone(&completed);
            let semaphore = Arc::clone(&semaphore);

            let task = tokio::spawn(async move {
                // 세마포어 획득
                let _permit = semaphore.acquire().await.unwrap();

                // HQ 생성 가능 여부 확인 (백그라운드면 즉시, 포그라운드면 유휴 시간 대기)
                while !idle_detector::should_generate_hq(IDLE_THRESHOLD_MS) {
                    // 조건 충족 안되면 재확인 간격만큼 대기 후 재확인
                    sleep(Duration::from_millis(IDLE_CHECK_INTERVAL_MS)).await;

                    // 대기 중에도 취소 플래그 확인
                    if HQ_GENERATION_CANCELLED.load(Ordering::SeqCst) {
                        return;
                    }
                }

                // 취소 확인
                if HQ_GENERATION_CANCELLED.load(Ordering::SeqCst) {
                    return;
                }

                // 고화질 DCT 썸네일 생성
                match thumbnail::generate_hq_thumbnail(&app_handle, &path).await {
                    Ok(result) => {
                        let count = completed.fetch_add(1, Ordering::SeqCst) + 1;

                        // 진행 상태 전송
                        let progress = ThumbnailProgress {
                            completed: count,
                            total,
                            current_path: path.clone(),
                        };

                        let _ = app_handle.emit("thumbnail-hq-progress", &progress);
                        let _ = app_handle.emit("thumbnail-hq-completed", &result);
                    }
                    Err(e) => {
                        eprintln!("Failed to generate HQ thumbnail for {}: {}", path, e);
                    }
                }
            });

            tasks.push(task);
        }

        // 모든 작업 완료 대기
        for task in tasks {
            let _ = task.await;
        }

        // 취소되지 않았으면 완료 이벤트 전송
        if !HQ_GENERATION_CANCELLED.load(Ordering::SeqCst) {
            let _ = app_handle.emit("thumbnail-hq-all-completed", true);
        } else {
            let _ = app_handle.emit("thumbnail-hq-cancelled", true);
        }
    });
}

/// 고화질 썸네일 생성 취소
pub fn cancel_hq_thumbnail_generation() {
    HQ_GENERATION_CANCELLED.store(true, Ordering::SeqCst);
}
