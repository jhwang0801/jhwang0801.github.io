---
title: "Django QuerySet 레이지 로딩과 캐싱 메커니즘 분석"
date: 2022-12-17
categories: [django]
tags: [django]
---

## 개요

최근 대용량 데이터를 처리하는 Django 프로젝트를 진행하던 중, 예상과 다른 데이터베이스 쿼리 패턴을 발견하였다.  
신경 쓰지 못했던 동일한 데이터를 여러 번 조회하는 로직에서 예상했던 성능 최적화가 이루어지지 않았고, 일부 구간에서 메모리 사용량이 급증하는 현상이 발생했다.

```python
# 문제가 발생했던 초기 코드 예시
def process_user_data(request):
    users = User.objects.filter(is_active=True)
    ...
    # 여러 곳에서 동일한 쿼리 재사용
    user_count = User.objects.filter(is_active=True).count()
    user_emails = [u.email for u in User.objects.filter(is_active=True)]
    
    # 3번의 개별 DB 쿼리 실행
```

이러한 경험을 기회삼아 Django QuerySet의 레이지 로딩과 캐싱 메커니즘에 대해 체계적으로 분석하고자 한다.

---

## Django QuerySet의 레이지 로딩 (Lazy Loading)

### 📌 정의 및 동작 원리

레이지 로딩은 QuerySet 객체가 생성되는 시점이 아닌, **실제 데이터가 필요한 시점에 데이터베이스 쿼리를 실행**하는 메커니즘이다.

### 🔍 쿼리 실행 시점

QuerySet은 다음과 같은 상황에서만 데이터베이스 쿼리를 실행한다:

1. **반복(Iteration)**: `for` 루프나 `list()` 함수 호출
2. **길이 확인**: `len()`, `count()` 메서드 호출  
3. **불린 평가**: `bool()`, `if` 문에서의 조건 검사
4. **인덱스 접근**: `qs[0]`, `qs[-1]` 등 특정 인덱스 접근
5. **특정 슬라이싱**: 스텝이 포함된 슬라이싱 (`qs[::2]`)
6. **문자열 변환**: `repr()`, `str()` 호출

```python
qs = User.objects.filter(is_active=True)

# ✅ 평가 발생하는 경우들
len(qs)                    # 전체 데이터를 가져와서 개수 계산
bool(qs)                   # 데이터 존재 여부 확인
if qs:                     # 불린 컨텍스트에서 평가
    pass
first_user = qs[0]         # 첫 번째 요소 접근
last_user = qs[-1]         # 마지막 요소 접근 (전체 로드 필요)
print(qs)                  # __repr__ 호출로 평가 발생

# ❌ 평가 발생하지 않는 경우들  
qs.count()                 # COUNT 쿼리만 실행
qs.exists()                # EXISTS 쿼리만 실행
filtered_qs = qs.filter(age__gt=18)  # 새로운 QuerySet 생성만
```

### 🧪 평가(Evaluation) 트리거 검증

```python
from django.db import connection
from django.db import reset_queries

def analyze_query_execution():
    reset_queries()
    
    # QuerySet 생성 - 쿼리 실행 안됨
    qs = User.objects.filter(is_active=True)
    print(f"QuerySet 생성 후 쿼리 수: {len(connection.queries)}")
    
    # 필터링 추가 - 쿼리 실행 안됨
    qs = qs.filter(age__gte=18)
    print(f"필터링 후 쿼리 수: {len(connection.queries)}")
    
    # 평가 실행 - 쿼리 실행됨
    result = list(qs)
    print(f"평가 후 쿼리 수: {len(connection.queries)}")
    print(f"실행된 SQL: {connection.queries[-1]['sql']}")
```

**📋 실행 결과:**
```
QuerySet 생성 후 쿼리 수: 0
필터링 후 쿼리 수: 0  
평가 후 쿼리 수: 1
실행된 SQL: SELECT "users_user"."id", "users_user"."username", "users_user"."email", "users_user"."is_active", "users_user"."age" FROM "users_user" WHERE ("users_user"."is_active" = True AND "users_user"."age" >= 18)
```

---

## Django QuerySet 캐싱 메커니즘

### 📌 캐싱 범위와 한계

Django QuerySet 캐싱은 **동일한 QuerySet 인스턴스 내에서만** 동작한다.  
새로운 QuerySet 객체가 생성되면 캐싱 효과는 적용되지 않는다.

### 🔍 캐싱 동작 분석

```python
def cache_behavior_analysis():
   from django.db import connection, reset_queries
   
   reset_queries()
   
   # 동일한 QuerySet 인스턴스 사용
   qs = User.objects.all()
   
   # 첫 번째 평가 - DB 쿼리 실행
   print(f"평가 전 쿼리 수: {len(connection.queries)}")
   first_evaluation = list(qs)
   print(f"첫 번째 평가 후 쿼리 수: {len(connection.queries)}")
   
   # 두 번째 평가 - 캐시된 결과 사용
   second_evaluation = list(qs)
   print(f"두 번째 평가 후 쿼리 수: {len(connection.queries)}")
   
   # 캐시 확인
   assert hasattr(qs, '_result_cache')
   assert qs._result_cache is not None
   print(f"캐시 존재 여부: {hasattr(qs, '_result_cache')}")
   
   # 새로운 QuerySet - 캐시 공유되지 않음
   new_qs = User.objects.all()  # 같은 조건이지만 다른 객체
   print(f"객체 동일성 확인: {qs is new_qs}")  # False
   
   third_evaluation = list(new_qs)  # 새로운 DB 쿼리 실행
   print(f"새 QuerySet 평가 후 쿼리 수: {len(connection.queries)}")
```

**📋 실행 결과:**
```
평가 전 쿼리 수: 0
첫 번째 평가 후 쿼리 수: 1
두 번째 평가 후 쿼리 수: 1  ← 증가하지 않음 (캐시 사용)
캐시 존재 여부: True
객체 동일성 확인: False
새 QuerySet 평가 후 쿼리 수: 2  ← 증가함 (새로운 쿼리 실행)
```

각 QuerySet 객체는 독립적인 `_result_cache` 속성을 가지며, 이는 해당 QuerySet이 평가될 때 결과를 저장하는 공간이다.  
동일한 QuerySet 객체를 재사용할 때만 캐싱 효과를 얻을 수 있으며, 객체가 다르면 각각 독립적인 캐시를 가지므로 별도의 데이터베이스 쿼리가 실행된다.

### ⚠️ 캐싱 무효화 조건

다음과 같은 경우 캐싱이 무효화되거나 새로운 QuerySet이 생성된다:

1. **QuerySet 메서드 체이닝**: `filter()`, `exclude()`, `order_by()` 등
2. **슬라이싱**: 대부분의 슬라이싱 연산
3. **클론 생성**: QuerySet의 복사본 생성

```python
def caching_invalidation_test():
    original_qs = User.objects.all()
    list(original_qs)  # 캐시 생성
    
    # 새로운 QuerySet 생성 - 캐시 무효화
    filtered_qs = original_qs.filter(is_active=True)
    sliced_qs = original_qs[:10]
```

---

## 성능 최적화 패턴

### ✅ 올바른 QuerySet 재사용

```python
class OptimizedUserService:
    def get_user_statistics(self):
        # 단일 QuerySet 인스턴스 생성
        active_users = User.objects.filter(is_active=True).select_related('profile')
        
        # 한 번만 평가하여 캐시 생성
        users_list = list(active_users)
        
        # 캐시된 결과를 다양한 용도로 활용
        statistics = {
            'total_count': len(users_list),
            'verified_count': len([u for u in users_list if u.profile.is_verified]),
            'admin_count': len([u for u in users_list if u.is_staff]),
            'emails': [u.email for u in users_list]
        }
        
        return statistics
```

### ❌ 비효율적인 패턴

```python
class IneffientUserService:
    def get_user_statistics(self):
        # 매번 새로운 QuerySet 생성 - 캐싱 효과 없음
        statistics = {
            'total_count': User.objects.filter(is_active=True).count(),
            'verified_count': User.objects.filter(
                is_active=True, 
                profile__is_verified=True
            ).count(),
            'admin_count': User.objects.filter(
                is_active=True, 
                is_staff=True
            ).count(),
        }
        # 총 3번의 개별 DB 쿼리 실행
        
        return statistics
```

---

## 메모리 사용량 고려사항

### ⚠️ 대용량 데이터 처리 시 주의점

```python
def memory_efficient_processing():
    # ❌ 메모리 효율적이지 않은 방법
    all_users = list(User.objects.all())  # 모든 데이터를 메모리에 로드
    
    # ✅ 메모리 효율적인 방법
    for user in User.objects.all().iterator():  # 청크 단위로 처리
        process_user(user)
    
    # ✅ 또는 청크 크기 지정
    for user in User.objects.all().iterator(chunk_size=1000):
        process_user(user)
```

---

## 결론

Django QuerySet의 레이지 로딩과 캐싱 메커니즘은 다음과 같은 특징을 가진다:

1. **레이지 로딩**: 실제 데이터가 필요한 시점까지 쿼리 실행을 지연하여 불필요한 데이터베이스 접근을 방지

2. **QuerySet 캐싱**: 동일한 QuerySet 인스턴스 내에서만 작동하는 제한적 캐싱

3. **성능 최적화**: 적절한 QuerySet 재사용을 통해 데이터베이스 쿼리 수를 최소화 가능

4. **메모리 관리**: 대용량 데이터 처리 시 `iterator()` 사용을 통한 메모리 효율성 확보 필요

이러한 메커니즘을 정확히 이해하고 활용함으로써 Django 애플리케이션의 성능을 효과적으로 최적화할 수 있다.