---
title: "DRF 커스텀 스로틀링 구현하기 - 페널티 시스템까지"
date: 2025-03-02
categories: [django]
tags: [django, drf, throttling, freeze]
---

## **커스텀 스로틀링을 구현하게된 배경:**
> 프로젝트 중 이벤트성으로 발급된 난수쿠폰을 등록하여 특정 조건을 만족하면 추가 혜택을 받을 수 있는 시스템이었다.  
> 사용자가 잘못된 쿠폰 번호를 지속적으로 입력하며 등록을 시도할 경우 시스템에 부담을 줄 수 있다고 예상했다. 특히 쿠폰 유효성 검증 과정에서 DB 조회가 빈번하게 발생하고, 악의적인 사용자가 무작위 번호를 대량으로 시도할 가능성 또한 배제할 수 없었다.  
>그 결과, 단순히 시간당 횟수 제한이 아니라, 악용 시도에 대해서는 더 강력한 제재가 필요하다는 결론에 이르렀다.

#### 기획 협의 사항
> - 5분에 10번까지 요청 허용
> - 그 이상 시도 시, 10분 간 완전 차단 (악의적 사용자로 판단)

#### 기술적 도전 과제
> - DRF 내장 스로틀링만으로는 **페널티 시스템** 구현 불가능
> - **두 가지 다른 시간 기준**을 동시에 관리해야 함 (5분 제한 + 10분 차단)
> - **성공/실패에 따른 다른 처리** 로직 필요

---

## **기술적 분석: 왜 DRF 기본 스로틀링으로는 부족한가**

### DRF 기본 스로틀링의 한계

```python
# DRF 기본 방식으로는 이것만 가능
'DEFAULT_THROTTLE_RATES': {
    'bonus_plan': '10/5min',  # 5분에 10번
}

# 우리가 원하는 것
'10/5min + 10분 페널티' # 이런 설정은 존재하지 않음
```

> #### 1. 단일 시간 기준의 한계
> 
> ```python
> # DRF SimpleRateThrottle.allow_request()의 기본 로직
> def allow_request(self, request, view):
>     if len(self.history) >= self.num_requests:
>         return False
>     
>     self.history.insert(0, self.now)
>     return True
> 
> # 문제점: 5분 후에는 바로 다시 요청 가능
> # 우리가 원하는 "10분 페널티"는 구현 불가능
> ```
>
> #### 2. 페널티 개념의 부재
> ```python
> # 악의적 사용자의 패턴 (DRF 기본으로는 막을 수 없음)
> 
> # 09:00 - 09:05: 10번 요청 (모두 허용)
> # 09:05 - 09:10: 10번 요청 (모두 허용) 
> # 09:10 - 09:15: 10번 요청 (모두 허용)
> # ...계속 반복
> 
> # 결과: 5분마다 10번씩 무한 반복 가능!
> ```
> - **DRF 기본 스로틀링:**
>   - 시간 경과 → 자동 해제
> 
> - **기획 협의 사항:**
>   - 제한 위반 → 페널티 부여
> 

---

## **해결책 설계: 이중 캐시 시스템 & 페널티 메커니즘**
### 두 개의 독립적인 캐시 관리
> - **일반 스로틀링**: 정상적인 사용 패턴 관리
> - **Freeze 시스템**: 악의적 사용 패턴 차단
>
> ```python
> class CustomThrottle(SimpleRateThrottle):
>     rate = True
>     ...
>     freeze_duration = 10 * 60  # 10분 페널티
>     
>     def parse_rate(self, rate):
>         num_requests = 10    # 5분에 10번
>         duration = 5 * 60    # 5분
>         return num_requests, duration
> ```
> 
> 
> #### 1. 이중 캐시 키 전략
>> 
>> ```python
>> def get_cache_key(self, request, view):
>>     """일반 스로틀링용 - 5분간 요청 기록 관리"""
>>     self.scope = "normal"
>>     ident = request.user.pk
>>     return self.cache_format % {"scope": self.scope, "ident": ident}
>>     # 결과: 'throttle_normal_123'
>> 
>> def get_freeze_cache_key(self, request):
>>     """페널티 관리용 - 10분간 차단 상태 관리"""
>>     self.scope = "freeze"  
>>     ident = request.user.pk
>>     return self.cache_format % {"scope": self.scope, "ident": ident}
>>     # 결과: 'throttle_freeze_123'
>> ```
>
> #### 2. **`3단계`** 검증 로직
>> - **1단계**: 정상적인 시간 경과 처리
>> - **2단계**: 페널티 중인 사용자 차단
>> - **3단계**: 새로운 위반 발생 시 페널티 부여
>> 
>> ```python
>> def allow_request(self, request, view):
>>     """3단계로 구성된 정교한 검증"""
>>     
>>     self.key = self.get_cache_key(request, view)
>>     self.freeze_key = self.get_freeze_cache_key(request)
>>     self.history = self.cache.get(self.key, [])
>>     self.now = self.timer()
>>     
>>     # 1단계: 만료된 기록 정리 (기본 슬라이딩 윈도우)
>>     while self.history and self.history[-1] <= self.now - self.duration:
>>         self.history.pop()
>>     
>>     # 2단계: Freeze 상태 우선 확인
>>     if self.cache.get(self.freeze_key):
>>         return self.throttle_failure()  # 페널티 중이면 무조건 차단
>>     
>>     # 3단계: 일반 제한 확인 + 위반 시 페널티 적용
>>     if len(self.history) >= self.num_requests:
>>         self.set_freeze_throttle()  # 페널티 즉시 적용!
>>         return self.throttle_failure()
>>     
>>     return self.throttle_success()
>> ```


---

## **핵심 구현: Freeze 시스템의 동작 원리**

### 페널티 적용 메커니즘
> 
> ```python
> def set_freeze_throttle(self):
>     """제한 위반 시 즉시 페널티 적용"""
>     # freeze_duration = 10 * 60 (10분)
>     self.cache.set(self.freeze_key, self.history, self.freeze_duration)
> ```
> 
> **Freeze 시스템의 실제 동작:**
> 
> ```python
> # 사용자 행동 시나리오
> 
> # 1차: 정상 사용 (5분간 8번 요청) → 모두 허용
> history = [timestamp8, timestamp7, ..., timestamp1]  # 8개
> freeze_cache = None  # 페널티 없음
> 
> # 2차: 한계 테스트 (추가로 3번 더 요청)
> # 9번째 요청: 허용 (9 < 10)
> # 10번째 요청: 허용 (10 = 10, 아직 경계선)
> # 11번째 요청: 거부 + 페널티 발동!
> 
> if len(self.history) >= 10:  # 10개 >= 10개
>     self.set_freeze_throttle()  # freeze__123에 10분 TTL 설정
>     return False
> 
> # 3차: 페널티 기간 (10분간)
> if self.cache.get(self.freeze_key):  # freeze 캐시 존재 확인
>     return False  # 어떤 요청이든 무조건 차단
> 
> # 4차: 페널티 해제 (10분 후 자동)
> # freeze 캐시 TTL 만료 → 다시 정상적인 5분/10번 제한 적용
> ```

### 성공/실패 분리 처리의 정교함
> - 틀린 시도만 제한하는 것이 쿠폰 시스템에서는 더 합리적
> - 올바른 쿠폰을 입력하면 다시 깨끗한 상태로 시작
> - 계속 틀린 쿠폰만 입력하는 사용자만 제재
> 
> ```python
> def throttle_success(self):
>     self.history.insert(0, self.now)
>     return True
> 
> def set_throttle(self):
>     self.cache.set(self.key, self.history, self.duration)
> 
> def delete_throttle_cache(self):
>     self.cache.delete(self.key)
> ```
>
> **ViewSet에서의 실제 사용**:
>
> ```python
> throttle.allow_request(request, self)  # 검사만
> 
> try:
>     serializer.is_valid(raise_exception=True)
>     throttle.delete_throttle_cache()  # 성공 → 캐시 삭제
> except ValidationError:
>     throttle.set_throttle()  # 실패 → 캐시 저장
> ```

---

## **향후 개선 방향과 고려사항**
### 1. 사용자 경험 개선 필요성
> - **상황별 맞춤 메시지**: 의도적 악용 vs 실수 구분
> - **남은 시간 정확히 표시**: 사용자 혼란 최소화
> - **대안 제시**: 다른 기능 이용 안내

### 2. 정상 사용자 보호 강화
> **우려사항:**
> - 네트워크 불안정 환경에서 자동 재시도로 인한 정상 사용자에게 페널티 부여
> 
> **개선 방향:**
> - **패턴 인식**: 네트워크 오류 vs 악의적 시도 구분
> - **적응형 제한**: 사용자별 평소 패턴 고려
> - **화이트리스트**: 신뢰도 높은 사용자 예외 처리

### 3. 성능 최적화 여지
> **우려사항:**
> - (2개의 캐시 키 사용으로 인한) 사용자 증가 시 메모리 사용량 급증 예상
> - 최적화 방향에 대해서는 더 고민이 필요...
