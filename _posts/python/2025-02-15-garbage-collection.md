---
title: "Python Garbage Collection (가비지 컬렉션)"
date: 2025-02-15
categories: [python]
tags: [python, garbage-collection, memory]
---

## 개요

얼마 전 회사에서 이상한 현상을 겪었다. Python 스크립트가 끝났는데도 메모리가 해제되지 않는 것이었다.

```python
def process_data():
    big_list = [i for i in range(1000000)]  # 약 40MB 메모리 사용
    # 여기서 뭔가 처리...
    return "완료"

result = process_data()
print("함수 끝났는데 메모리가 왜 안 줄어들지?")
```

분명히 함수가 끝났으니까 `big_list`는 사라져야 하는데, 메모리 모니터를 보면 여전히 40MB를 차지하고 있었다.

> "Python이 자동으로 메모리 관리해준다면서 왜 이런 일이?"

그래서 Python 가비지 컬렉터(Garbage Collector)에 대해 제대로 알아보려한다.

---

## Python 메모리 관리 기본 원리

### 📌 참조 카운팅 (Reference Counting)

Python의 기본 메모리 관리 방식은 **참조 카운팅**이다.

```python
# 참조 카운팅 예시
import sys

data = [1, 2, 3, 4, 5]
print(f"참조 카운트: {sys.getrefcount(data)}")  # 2 (data 변수 + getrefcount 함수)

backup = data  # 참조 카운트 증가
print(f"참조 카운트: {sys.getrefcount(data)}")  # 3

del backup     # 참조 카운트 감소
print(f"참조 카운트: {sys.getrefcount(data)}")  # 2

del data       # 참조 카운트 0 → 즉시 메모리 해제
```

**참조 카운팅의 동작:**
- 객체를 참조할 때마다 카운트 +1
- 참조가 사라질 때마다 카운트 -1  
- 카운트가 0이 되면 **즉시 메모리 해제**

### 🤔 그런데 왜 메모리가 안 해제될까?

참조 카운팅만으로는 해결할 수 없는 경우가 있다. **순환 참조**다.

```python
class Node:
    def __init__(self, value):
        self.value = value
        self.children = []
        self.parent = None

# 순환 참조 상황 만들기
parent = Node("부모")
child = Node("자식")

parent.children.append(child)  # 부모 → 자식 참조
child.parent = parent          # 자식 → 부모 참조

# 이제 둘 다 삭제해보자
del parent
del child

# 그런데 메모리가 해제될까?
# 답: 안 된다! 서로를 참조하고 있어서 참조 카운트가 0이 안 됨
```

**순환 참조 문제:**
- `parent`는 `child`를 참조
- `child`는 `parent`를 참조  
- 변수를 삭제해도 서로의 참조 카운트는 1로 유지
- 결과적으로 메모리 누수 발생

---

## Python 가비지 컬렉터의 역할

### 🗑️ 순환 참조 감지와 해제

Python은 이런 문제를 해결하기 위해 **가비지 컬렉터**를 사용한다.

```python
import gc

# 가비지 컬렉터 상태 확인
print(f"가비지 컬렉터 활성화: {gc.isenabled()}")
print(f"현재 객체 수: {len(gc.get_objects())}")

# 순환 참조 객체 생성
def create_circular_reference():
    parent = Node("부모")
    child = Node("자식")
    parent.children.append(child)
    child.parent = parent
    return "순환 참조 생성 완료"

result = create_circular_reference()
print(f"생성 후 객체 수: {len(gc.get_objects())}")

# 수동으로 가비지 컬렉션 실행
collected = gc.collect()
print(f"수집된 객체 수: {collected}")
print(f"수집 후 객체 수: {len(gc.get_objects())}")
```

### 📊 세대별 가비지 컬렉션

Python은 **세대별(Generational) 가비지 컬렉션**을 사용한다.

```python
# 가비지 컬렉션 통계 확인
print(gc.get_stats())

# 새로 생성된 객체들 (세대 0)
temp1 = [1, 2, 3]      # 함수 안에서 잠깐 쓰고 버릴 객체
temp2 = "hello"        # 임시 문자열
temp3 = {"key": "val"} # 임시 딕셔너리

# 시간이 지나도 살아남은 객체들 (세대 1)
class_instance = MyClass()  # 클래스 인스턴스
global_config = {...}      # 전역 설정

# 프로그램 내내 쓰이는 객체들 (세대 2)  
imported_modules = sys.modules  # 임포트된 모듈들

# 출력 예시:
# [{'collections': 123, 'collected': 45, 'uncollectable': 0},    # 세대 0
#  {'collections': 11,  'collected': 12, 'uncollectable': 0},    # 세대 1  
#  {'collections': 1,   'collected': 3,  'uncollectable': 0}]    # 세대 2
```

**세대별 분류 원리:**
- **세대 0**: 새로 생성된 객체들 (자주 검사)
- **세대 1**: 세대 0에서 살아남은 객체들 (가끔 검사)
- **세대 2**: 세대 1에서 살아남은 객체들 (드물게 검사)

**왜 이렇게 할까?**
- 새로운 객체들은 금방 사용되지 않을 가능성이 높음
- 오래 살아남은 객체들은 계속 쓰일 가능성이 높음
- 따라서 새 객체들을 더 자주 검사하는 게 효율적

### 🔧 가비지 컬렉션 임계값

```python
# 현재 임계값 확인
print(f"가비지 컬렉션 임계값: {gc.get_threshold()}")
# 출력: (700, 10, 10)

# 의미:
# - 세대 0: 새 객체 700개 생성되면 가비지 컬렉션 실행
# - 세대 1: 세대 0에서 10번 컬렉션이 일어나면 실행
# - 세대 2: 세대 1에서 10번 컬렉션이 일어나면 실행
```

---

## 실제 문제 상황과 해결법

### 🚨 문제 상황 : 큰 객체가 해제되지 않는 경우

```python
import gc
from memory_profiler import profile

@profile
def memory_leak_example():
    # 큰 데이터 구조 생성
    big_data = {}
    for i in range(100000):
        big_data[i] = {
            'data': [j for j in range(100)],
            'reference': big_data  # 자기 자신을 참조!
        }
    
    print("데이터 생성 완료")
    # 함수가 끝나도 순환 참조 때문에 메모리 해제 안됨
    return "완료"

# 실행 전 메모리 확인
print(f"실행 전 객체 수: {len(gc.get_objects())}")

result = memory_leak_example()

print(f"실행 후 객체 수: {len(gc.get_objects())}")

# 수동으로 가비지 컬렉션 실행
collected = gc.collect()
print(f"가비지 컬렉션으로 수집된 객체: {collected}")
print(f"수집 후 객체 수: {len(gc.get_objects())}")
```

### ✅ 해결법 1: 명시적 참조 해제

```python
def memory_safe_example():
    big_data = {}
    for i in range(100000):
        big_data[i] = {
            'data': [j for j in range(100)],
            # 순환 참조 제거
        }
    
    # 명시적으로 참조 해제
    del big_data
    
    # 필요하면 수동으로 가비지 컬렉션 실행
    gc.collect()
    
    return "완료"
```

### ✅ 해결법 2: weakref 사용

```python
import weakref

class SafeNode:
    def __init__(self, value):
        self.value = value
        self.children = []
        self._parent = None  # 약한 참조로 저장
    
    @property
    def parent(self):
        return self._parent() if self._parent else None
    
    @parent.setter  
    def parent(self, value):
        self._parent = weakref.ref(value) if value else None

# 사용법
parent = SafeNode("부모")
child = SafeNode("자식")

parent.children.append(child)
child.parent = parent  # 약한 참조로 저장

# 이제 부모를 삭제하면 제대로 해제됨
del parent
print(f"자식의 부모: {child.parent}")  # None
```

---

## 실무에서 활용할 수 있는 팁들

### 🔍 메모리 누수 디버깅하기

```python
import gc
import objgraph

def debug_memory_leak():
    # 타입별 객체 수 확인
    objgraph.show_most_common_types(limit=10)
    
    # 특정 타입의 참조 관계 확인
    objgraph.show_backrefs([gc.get_objects()[0]], filename='refs.png')
    
    # 가비지 컬렉션으로 수집할 수 없는 객체들 확인
    if gc.garbage:
        print("수집 불가능한 객체들:")
        for obj in gc.garbage:
            print(type(obj), obj)

# 메모리 사용량 모니터링
def monitor_memory_usage():
    import tracemalloc
    
    tracemalloc.start()
    
    # 여기서 의심스러운 코드 실행
    suspicious_function()
    
    # 메모리 사용량 분석
    current, peak = tracemalloc.get_traced_memory()
    print(f"현재 메모리 사용량: {current / 1024 / 1024:.1f} MB")
    print(f"최대 메모리 사용량: {peak / 1024 / 1024:.1f} MB")
    
    tracemalloc.stop()
```

---

## 결론

### 📝 핵심 포인트들

1. **Python은 참조 카운팅 + 가비지 컬렉션**으로 메모리 관리
2. **순환 참조**는 가비지 컬렉터가 해결하지만 즉시는 아님
3. **세대별 가비지 컬렉션**으로 효율성 확보
4. **필요시 수동 조정**으로 성능 최적화 가능

### 🎯 실무에서 기억할 것들

**언제 신경 써야 하나:**
- 대용량 데이터 처리할 때
- 메모리 사용량이 계속 증가할 때  
- 성능이 점진적으로 느려질 때
- 순환 참조가 발생할 수 있는 구조를 만들 때

**간단한 해결책:**
```python
# 1. 명시적 삭제
del big_object
gc.collect()

# 2. 약한 참조 사용
import weakref
weak_ref = weakref.ref(object)
```
---
