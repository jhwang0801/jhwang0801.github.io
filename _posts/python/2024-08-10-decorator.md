---
title: "Python Decorator (데코레이터)"
date: 2024-08-10
categories: [python]
tags: [python, decorator, functools, django, closure]
---

## **데코레이터가 해결하는 문제**

> 같은 코드를 여러 함수에 반복해서 작성하고 있다면, 데코레이터로 해결
> 
> ```python
> # 로깅이 필요한 여러 함수들
> def transfer_money(from_account, to_account, amount):
>     print(f"transfer_money 실행 시작")
>     # 송금 로직
>     result = "송금 완료"
>     print(f"transfer_money 실행 완료: {result}")
>     return result
> 
> def update_profile(user_id, data):
>     print(f"update_profile 실행 시작")
>     # 프로필 업데이트 로직
>     result = "프로필 업데이트 완료"
>     print(f"update_profile 실행 완료: {result}")
>     return result
> 
> ```

---

## **데코레이터의 기본 구조**
> 원본 함수에서 wrapper 함수로 교체
> 
> ```python
> def log_execution(func):                  # 1. 원본 함수를 받는다
>     def wrapper(*args, **kwargs):         # 2. 새로운 함수를 정의한다
>         print(f"{func.__name__} 실행 시작")
>         result = func(*args, **kwargs)    # 3. 원본 함수를 호출한다
>         print(f"{func.__name__} 실행 완료: {result}")
>         return result                     # 4. 결과를 반환한다
>     return wrapper                        # 5. 새로운 함수를 반환한다
> 
> @log_execution
> def transfer_money(from_account, to_account, amount):
>     return "송금 완료"
> 
> @log_execution
> def update_profile(user_id, data):
>     return "프로필 업데이트 완료"
> ```

---

## **functools.wraps를 사용해야 하는 이유**

> 데코레이터 사용 시 **원본 함수의 정보가 손실되는 것을 방지**하기 위해 `functools.wraps` 사용
> 
> ### 문제
> 
> ```python
> def simple_decorator(func):
>     def wrapper(*args, **kwargs):
>         return func(*args, **kwargs)
>     return wrapper
> 
> @simple_decorator
> def calculate_sum(a, b):
>     """두 수의 합을 계산합니다."""
>     return a + b
> 
> print(calculate_sum.__name__)  # wrapper (원본 함수명 손실!)
> print(calculate_sum.__doc__)   # None (독스트링 손실!)
> ```
> 
> ### 해결
> 
> ```python
> import functools
> 
> def better_decorator(func):
>     @functools.wraps(func)  # 원본 함수의 메타데이터를 보존
>     def wrapper(*args, **kwargs):
>         return func(*args, **kwargs)
>     return wrapper
> 
> @better_decorator
> def calculate_sum(a, b):
>     """두 수의 합을 계산합니다."""
>     return a + b
> 
> print(calculate_sum.__name__)  # calculate_sum (원본 함수명 보존!)
> print(calculate_sum.__doc__)   # 두 수의 합을 계산합니다. (독스트링 보존!)
> ```

---

## **클로저가 데코레이터에서 중요한 이유**

> 데코레이터가 상태를 `기억`할 수 있는 이유 = Python의 클로저 메커니즘
> 
> ```python
> def call_counter(func):
>     count = 0  # 이 변수는 call_counter 함수의 로컬 변수
>     
>     @functools.wraps(func)
>     def wrapper(*args, **kwargs):
>         nonlocal count
>         count += 1  # wrapper가 외부 함수의 변수에 접근
>         print(f"{func.__name__} 호출 횟수: {count}")
>         return func(*args, **kwargs)
>     
>     return wrapper
>     # call_counter 함수가 끝나도 count 변수는 메모리에 살아있음 (클로저)
> 
> @call_counter
> def say_hello():
>     return "Hello"
> 
> say_hello()  # say_hello 호출 횟수: 1
> say_hello()  # say_hello 호출 횟수: 2
> ```

---

## **매개변수가 있는 데코레이터**
> 
> ```python
> def retry(max_attempts=3, delay=1):       # 1단계: 설정 받기
>     def decorator(func):                  # 2단계: 원본 함수 받기
>         @functools.wraps(func)
>         def wrapper(*args, **kwargs):     # 3단계: 실제 실행
>             for attempt in range(max_attempts):
>                 try:
>                     return func(*args, **kwargs)
>                 except Exception as e:
>                     if attempt == max_attempts - 1:
>                         raise e
>                     print(f"시도 {attempt + 1} 실패. {delay}초 후 재시도...")
>                     time.sleep(delay)
>         return wrapper
>     return decorator
> 
> # 사용
> @retry(max_attempts=5, delay=2)
> def unstable_api_call():
>     import random
>     if random.random() < 0.7:
>         raise Exception("API 오류")
>     return "성공"
> ```

---

## **클래스 기반 데코레이터**

> **복잡한 상태 관리**나 **추가 메서드가 필요**할 때는 클래스 데코레이터
> 
> ```python
> class CallTracker:
>     def __init__(self, func):
>         self.func = func
>         self.call_count = 0
>         functools.update_wrapper(self, func)  # 클래스 기반 데코레이터에서는 functools.update_wrapper 사용
>     
>     def __call__(self, *args, **kwargs):
>         self.call_count += 1
>         print(f"{self.func.__name__} 호출 횟수: {self.call_count}")
>         return self.func(*args, **kwargs)
>     
>     def reset_count(self):  # 추가 메서드 제공
>         self.call_count = 0
>     
>     def get_stats(self):
>         return {
>             'function_name': self.func.__name__,
>             'call_count': self.call_count
>         }
> 
> @CallTracker
> def greet(name):
>     return f"Hello, {name}!"
> 
> greet("Alice")  # greet 호출 횟수: 1
> greet("Bob")    # greet 호출 횟수: 2
> 
> print(greet.get_stats())  # {'function_name': 'greet', 'call_count': 2}
> greet.reset_count()       # 함수 기반 데코레이터로는 불가능한 기능
> ```

---

## **유의 사항**

> ### # 1: functools.wraps 누락
> 
> ```python
> # 잘못된 예시
> def bad_decorator(func):
>     def wrapper(*args, **kwargs):
>         return func(*args, **kwargs)
>     return wrapper
> 
> # 올바른 예시
> def good_decorator(func):
>     @functools.wraps(func)  # 반드시 포함
>     def wrapper(*args, **kwargs):
>         return func(*args, **kwargs)
>     return wrapper
> ```
> 
> ### # 2: 매개변수 있는 데코레이터에서 괄호 누락
> 
> ```python
> # 잘못된 사용
> @retry  # 에러! @retry() 이어야 함
> def api_call():
>     pass
> 
> # 올바른 사용
> @retry()  # 괄호 필요
> def api_call():
>     pass
> ```
> 
> ### # 3: 데코레이터 순서
> 
> ```python
> @cache_result
> @measure_time
> @require_login
> def expensive_view(request):
>     pass
> 
> # 실행 순서: require_login → measure_time → cache_result
> # 로그인 체크 후 시간 측정하고 결과를 캐시함
> # 순서가 바뀌면 의도와 다를 수 있음
> ```
