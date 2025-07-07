---
title: "Python 멀티스레딩이 정말 효과 없을까? (GIL의 진실)"
date: 2025-06-28
categories: [python]
tags: [python, threading, multiprocessing, gil, performance]
---

## 개요

Python 멀티스레드는 명확하게 언제 효과가 있고 어떤 상황에서 사용해야하는걸까?

```python
# 웹 크롤링: 멀티스레딩으로 20배 빨라짐
urls = ["https://site1.com", "https://site2.com", ...]
# 순차 실행: 100초 → 멀티스레딩: 5초

# 수학 계산: 멀티스레딩 효과 없음
numbers = [1000000, 1000000, 1000000, 1000000]
# 순차 실행: 2.5초 → 멀티스레딩: 2.6초 (더 느림)
```

---

## 핵심 개념 이해

### 프로세스 vs 스레드

**프로세스 = 각자 다른 집에 사는 가족**
- 실행 중인 프로그램의 독립적인 실행 단위
- 각자 독립된 메모리 공간 보유 (집 안의 물건을 공유하지 않음)
- 다른 프로세스와 완전히 격리

**스레드 = 한 집 안의 여러 가족 구성원**
- 하나의 프로세스 내에서 실행되는 작업 단위
- 같은 프로세스 내 스레드들은 메모리 공간 공유 (냉장고, TV 등을 공유)
- 생성/전환 비용이 프로세스보다 낮음

### GIL(Global Interpreter Lock)

> Python의 핵심 제약사항.  
> **한 번에 하나의 스레드만 Python 바이트코드를 실행**할 수 있게 하는 뮤텍스(Mutual Exclusion).

**GIL의 핵심 원리:**
- Python 인터프리터가 필요한 작업: GIL 필요 (한 번에 하나씩)
- Python 인터프리터가 불필요한 작업: GIL 해제 (동시 실행 가능)

```python
# CPU BOUND
def cpu_task():
    for i in range(1000000):
        result = i * i  # Python 연산 → GIL 필요

# I/O BOUND
def io_task():
    # 요청 준비: Python 코드 → GIL 필요
    print("네트워크 요청 시작")

    # 네트워크 대기: 운영체제가 처리 → GIL 해제
    response = requests.get(url)
    
    # 결과 처리: Python 코드 → GIL 다시 필요
    print("응답 받음")
```

### 작업 유형 분류

**CPU bound(CPU 집약적)**
- CPU 연산이 주를 이루는 작업
- Python 코드로 계속 연산해야 하는 일: 수학 계산, 이미지 편집, 데이터 분석

```python
def find_prime_numbers(max_num):
    primes = []
    for num in range(2, max_num):        # Python 반복문
        is_prime = True
        for i in range(2, int(num ** 0.5) + 1):  # Python 계산
            if num % i == 0:             # Python 연산
                is_prime = False
                break
        if is_prime:
            primes.append(num)           # Python 리스트 조작
    return primes
```

**I/O bound(I/O 집약적)**
- 입출력 대기가 주를 이루는 작업
- 대부분 시간을 운영체제나 외부 시스템이 처리: 네트워크, 파일

```python
def download_image(url):
    print("다운로드 시작...")        # Python 코드 (GIL 필요)
    response = requests.get(url)    # 네트워크 대기 (GIL 해제)
    print("다운로드 완료!")         # Python 코드 (GIL 다시 필요)
    return response.content
```

---

## 실제 테스트

### 웹사이트 크롤링 (I/O 집약적) - 멀티스레딩 효과적

> I/O 작업 중에는 GIL이 해제되어 다른 스레드가 실행될 수 있다.

```python
import threading
import requests
import time

def fetch_url(url):
    response = requests.get(url)
    return response.status_code

urls = ["https://httpbin.org/delay/1"] * 4  # 1초씩 기다리는 가짜 API

# 순차 실행: 한 번에 하나씩
start = time.time()
for url in urls:
    fetch_url(url)
sequential_time = time.time() - start
print(f"순차 실행: {sequential_time:.2f}초")  # 약 4초

# 멀티스레딩: 동시에 여러 개
start = time.time()
threads = []
for url in urls:
    t = threading.Thread(target=fetch_url, args=(url,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()
threading_time = time.time() - start
print(f"멀티스레딩: {threading_time:.2f}초")  # 약 1초
print(f"속도 향상: {sequential_time/threading_time:.1f}배")
```

**왜 빨라졌을까?**
- 각 스레드가 네트워크 요청 시 GIL을 해제
- 다른 스레드들이 동시에 자신의 요청을 시작할 수 있음
- 4개의 네트워크 요청이 거의 동시에 진행됨

### 수학 계산 (CPU 집약적) - 멀티스레딩 비효과적

```python
import threading
import time

def heavy_calculation(n):
    result = 0
    for i in range(n):
        result += i * i
    return result

numbers = [2000000] * 4

# 순차 실행
start = time.time()
for num in numbers:
    heavy_calculation(num)
sequential_time = time.time() - start
print(f"순차 실행: {sequential_time:.2f}초")  # 약 2초

# 멀티스레딩
start = time.time()
threads = []
for num in numbers:
    t = threading.Thread(target=heavy_calculation, args=(num,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()
threading_time = time.time() - start
print(f"멀티스레딩: {threading_time:.2f}초")  # 약 2초 (변화 없음)
```

**왜 효과가 없을까?**
- 계산 작업은 계속 Python 인터프리터가 필요해서 GIL이 해제되지 않음
- 스레드들이 번갈아가며 실행됨 (진정한 병렬 처리 불가)
- **스레드 전환하는 비용(오버헤드)**만 추가됨

### 멀티프로세싱: 독립된 Python 인터프리터 사용

> 각 프로세스가 독립된 Python 인터프리터를 가져 GIL 제약을 우회한다.

```python
import multiprocessing
import time

def heavy_calculation(n):
    result = 0
    for i in range(n):
        result += i * i
    return result

if __name__ == '__main__':
    numbers = [2000000] * 4
    
    # 멀티프로세싱: 각자 독립된 화장실(프로세스)
    start = time.time()
    with multiprocessing.Pool(processes=4) as pool:
        results = pool.map(heavy_calculation, numbers)
    multiprocessing_time = time.time() - start
    
    print(f"멀티프로세싱: {multiprocessing_time:.2f}초")  # 약 0.5초
    print(f"순차 실행 대비 속도: {2.0/multiprocessing_time:.1f}배")
```

**왜 빨라졌을까?**
- 각 프로세스가 독립된 Python 인터프리터를 가짐
- GIL의 제약을 받지 않음 (각자 독립적으로 Python 코드 실행)
- 진정한 병렬 처리 가능

---

## 결론

| 작업 유형 | 추천 방식 | 이유 |
|-----------|-----------|------|
| 🌐 네트워크 요청 | 멀티스레딩 | GIL이 해제됨 |
| 📁 파일 읽기/쓰기 | 멀티스레딩 | GIL이 해제됨 |
| 🧮 수학 계산 | 멀티프로세싱 | GIL 우회 (독립 인터프리터) |
| 🎨 이미지 처리 | 멀티프로세싱 | GIL 우회 (독립 인터프리터) |


- **작업 특성 파악**: `대기 중심` vs `연산 중심`
- **적절한 도구 선택**: `멀티스레딩` vs `멀티프로세싱`


Python의 동시성은 "만능 해결책"이 아니라 "적재적소에 쓰는 도구"다. 작업의 특성을 정확히 파악하고 적절한 방식을 선택하는 것이 핵심이다.