---
title: "DRF 내장 스로틀링 파헤치기"
date: 2024-07-20
categories: [django]
tags: [django, drf, throttling, redis, performance]
---

## **Django REST Framework 스로틀링의 내부 동작 원리**
> 프로젝트 과정에서 스로틀링 관련 설정이 필요하여 우선적으로 DRF의 내장 스로틀링을 상세하게 분석해보았다.

### 스로틀링 방식 비교: 고정 윈도우 vs 슬라이딩 윈도우
#### 1. 고정 윈도우 (`Fixed Window`) 방식
> **문제점:** 경계 시점에서 **버스트 트래픽** 발생 가능
> 
> ```
> |------- 1분 -------|------- 1분 -------|------- 1분 -------|
> 
> 09:00:00 ~~~~~~~~ 09:01:00 ~~~~~~~~ 09:02:00 ~~~~~~~~ 09:03:00
>     |                   |                   |
>     ← 이 1분 동안         ← 이 1분 동안          ← 이 1분 동안
>     최대 10번 허용        최대 10번 허용          최대 10번 허용
>
> # 결과
> - 09:00:50 ~ 09:01:00: 10번 요청 (허용)
> - 09:01:00 ~ 09:01:10: 10번 요청 (허용) 
> → 실제로는 20초 만에 20번 요청이 처리됨!
> ```

> #### 2. 슬라이딩 윈도우 (`Sliding Window`) 방식
> **장점:** 언제든지 정확한 시간 윈도우 내에서만 제한 적용 
> ```
> 현재 시점에서 과거 N분을 항상 확인
> 
> 09:01:30 기준:
>     |←------ 최근 1분 ------|
> 09:00:30 ~~~~~~~~ 09:01:30 (현재)
> 
> 09:01:35 기준:  
>          |←------ 최근 1분 ------|
>      09:00:35 ~~~~~~~~ 09:01:35 (현재)
> ```
> 


### DRF 스로틀링의 핵심: 슬라이딩 윈도우 알고리즘
> DRF는 **슬라이딩 윈도우(Sliding Window)** 방식으로 스로틀링을 구현한다.
> 
> ```python
> # rest_framework/throttling.py의 SimpleRateThrottle 핵심 로직
> def allow_request(self, request, view):
>     """
>     핵심 스로틀링 로직 - 슬라이딩 윈도우 구현
>     """
>     # 1. 캐시에서 이전 요청 기록들을 가져옴
>     self.key = self.get_cache_key(request, view)
>     self.history = self.cache.get(self.key, [])
>     self.now = self.timer()  # 현재 시간 (time.time())
>     
>     # 2. 만료된 요청 기록들을 제거 (**핵심!**)
>     while self.history and self.history[-1] <= self.now - self.duration:
>         self.history.pop()
>     
>     # 3. 현재 윈도우 내 요청 수가 제한을 초과하는지 확인
>     if len(self.history) >= self.num_requests:
>         return self.throttle_failure()
>     
>     return self.throttle_success()
> 
> def throttle_success(self):
>     """
>     요청 허용 시 - 현재 요청을 기록에 추가
>     """
>     self.history.insert(0, self.now)
>     self.cache.set(self.key, self.history, self.duration)
>     return True
> ```


### 슬라이딩 윈도우가 실제로 어떻게 작동하는가
> 
> ```
> # 시나리오: "10초에 3번" 제한 설정
> 
> # T=0초: 첫 번째 요청
> history = [1640000000]  
> 현재 윈도우: [1640000000] (1개) → 허용 ✅
> 
> # T=3초: 두 번째 요청  
> history = [1640000003, 1640000000]
> 현재 윈도우: [1640000003, 1640000000] (2개) → 허용 ✅
> 
> # T=5초: 세 번째 요청
> history = [1640000005, 1640000003, 1640000000]
> 현재 윈도우: [1640000005, 1640000003, 1640000000] (3개) → 허용 ✅
> 
> # T=7초: 네 번째 요청 시도
> 1. 만료 검사: 
>    - 1640000000이 (1640000007 - 10) = 1639999997보다 큰가? 
>    - 1640000000 > 1639999997 → True (아직 10초 안 지남)
> 2. 현재 요청 수: 3개 >= 3개 → 거부! ❌
> 
> # T=12초: 다시 요청 시도
> 1. 만료 검사:
>    - 1640000000이 (1640000012 - 10) = 1640000002보다 큰가?
>    - 1640000000 > 1640000002 → False (10초 지남!)
> 2. history.pop() 실행 → [1640000005, 1640000003]
> 3. 현재 요청 수: 2개 < 3개 → 허용! ✅
> ```
>
> **핵심 포인트:**
> - 매 요청마다 "현재 시점 기준 과거 10초"를 동적으로 계산
> - 윈도우가 시간에 따라 "슬라이딩"하면서 움직임
> - 정확한 시간 기반 제어로 버스트 트래픽 방지


### DRF 내장 스로틀링 클래스(`AnonRate`, `UserRate`, `ScopedRate`)들의 차이점
#### 1. **`AnonRateThrottle`** vs **`UserRateThrottle`**
> - **AnonRateThrottle**: 
>   - 익명 사용자의 API 호출 횟수 제한
>   - 요청의 IP 주소가 고유한 캐시 키로 사용
> - **UserRateThrottle**:
>   - 특정 사용자의 API 호출 횟수 제한
>   - 사용자 ID(인증) / IP 주소(익명)가 고유한 캐시 키로 사용
> 
> ```python
> # AnonRateThrottle의 get_cache_key
> def get_cache_key(self, request, view):
>     if request.user.is_authenticated:
>         return None  # 인증된 사용자는 제외
>     
>     # IP 주소 기반 키 생성
>     ident = self.get_ident(request)  # X-Forwarded-For 또는 REMOTE_ADDR
>     return self.cache_format % {
>         'scope': self.scope,
>         'ident': ident
>     }
> 
> # UserRateThrottle의 get_cache_key  
> def get_cache_key(self, request, view):
>     if request.user.is_authenticated:
>         # 사용자 PK 기반 키 생성
>         ident = request.user.pk
>     else:
>         # 비인증 사용자는 IP 기반
>         ident = self.get_ident(request)
>     
>     return self.cache_format % {
>         'scope': self.scope,
>         'ident': ident
>     }
> ```

#### 2. ScopedRateThrottle의 동적 스코프
> - **ScopedRateThrottle**:
>     - 동적으로 다양한 API 호출 횟수 제한
>     - 사용자 ID와 View의 scope를 연결하여 캐시 키로 사용
>     
> ```python
> class ScopedRateThrottle(UserRateThrottle):
>     def __init__(self):
>         # 동적으로 스코프가 결정됨
>         pass
>     
>     def allow_request(self, request, view):
>         # 뷰에서 throttle_scope 속성을 가져와서 동적으로 스코프 설정
>         self.scope = getattr(view, self.scope_attr, None)
>         if not self.scope:
>             return True
>             
>         self.rate = self.get_rate()
>         self.num_requests, self.duration = self.parse_rate(self.rate)
>         
>         return super().allow_request(request, view)
> ```
