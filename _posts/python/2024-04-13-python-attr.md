---
title: "Python 속성 조작 함수 (getattr, setattr, hasattr, delattr)"
date: 2024-04-13
categories: [python]
tags: [python, getattr, setattr, hasattr, delattr, 동적속성, 메타프로그래밍]
---

## 개요

```python
# 일반적인 속성 접근
config.debug  # 속성명이 확정된 경우

# 동적 속성 접근이 필요한 경우
setting_name = "debug"  # 문자열로 속성명이 주어짐
getattr(config, setting_name)  # 이때 동적 함수가 필요!
```

---

## 핵심 개념 이해

### 정적 vs 동적 속성 접근

> **정적 접근 = 컴파일 타임에 결정**
> - 코드 작성 시점에 속성명이 확정됨
> - `obj.attribute` 형태로 직접 접근
> - 빠르고 명확하지만 유연성 부족
> 
> **동적 접근 = 런타임에 결정**
> - 실행 중에 속성명이 문자열로 결정됨
> - `getattr(obj, 'attribute')` 형태로 접근
> - 약간 느리지만 매우 유연함

```python
# 정적: 코드에서 속성명이 고정
user.name
user.age

# 동적: 실행 중에 속성명이 결정
fields = ['name', 'age', 'email']
for field in fields:
    value = getattr(user, field)  # 필드명이 변수로 주어짐
```

### 4가지 함수의 역할 분담

> **getattr**: 안전한 속성 읽기 (기본값 제공)  
> **setattr**: 동적 속성 설정 (런타임에 속성 추가/수정)  
> **hasattr**: 속성 존재 확인 (에러 없이 검사)  
> **delattr**: 속성 삭제 (동적으로 제거)

```python
class Config:
    debug = True

config = Config()

# 각 함수의 핵심 특징
hasattr(config, 'timeout')           # False (존재 확인)
getattr(config, 'timeout', 30)       # 30 (기본값 반환)
setattr(config, 'timeout', 60)       # 새 속성 생성
delattr(config, 'timeout')           # 속성 삭제
```

---

## 실제 활용 사례

### 설정 파일 처리 - 동적 함수로 코드 간소화

> 수십 개의 설정 항목을 if문 없이 깔끔하게 처리

```python
# ❌ 기존 방식: 설정마다 개별 처리
class AppConfig:
    def __init__(self):
        self.debug = False
        self.host = "localhost"
        self.port = 8000
        # ... 50개 설정 항목
    
    def load_from_dict(self, config_dict):
        if 'debug' in config_dict:
            self.debug = config_dict['debug']
        if 'host' in config_dict:
            self.host = config_dict['host']
        if 'port' in config_dict:
            self.port = config_dict['port']
        # ... 50개 설정마다 if문 (코드 중복!)

# ✅ 개선된 방식: 동적 함수로 간소화
class AppConfig:
    def __init__(self):
        self.debug = False
        self.host = "localhost" 
        self.port = 8080
    
    def load_from_dict(self, config_dict):
        for key, value in config_dict.items():
            if hasattr(self, key):  # 기존 설정만 업데이트
                setattr(self, key, value)
    
    def get_setting(self, name, default=None):
        return getattr(self, name, default)

# 사용 예시
config = AppConfig()
config.load_from_dict({
    'debug': True,
    'host': '0.0.0.0',
    'new_setting': 'ignored'  # 기존에 없는 설정은 무시
})

print(config.get_setting('debug'))      # True
print(config.get_setting('timeout', 30)) # 30 (기본값)
```

- 50개 설정을 처리하는 코드가 3줄로 단축
- 새로운 설정 추가 시 코드 수정 불필요
- 타입 안전성과 유연성을 동시에 확보

### 동적 데이터 클래스 - 런타임 클래스 생성

```python
def create_data_class(class_name, fields, validations=None):
    """필드 정보를 기반으로 데이터 클래스를 동적 생성"""
    
    class DynamicDataClass:
        def __init__(self, **kwargs):
            # 필드 초기화
            for field in fields:
                default_value = kwargs.get(field)
                setattr(self, field, default_value)
            
            # 검증 실행
            if validations:
                self.validate()
        
        def validate(self):
            """동적 검증 실행"""
            for field, validator in (validations or {}).items():
                if hasattr(self, field):
                    value = getattr(self, field)
                    if not validator(value):
                        raise ValueError(f"{field} 검증 실패: {value}")
        
        def to_dict(self):
            """모든 필드를 딕셔너리로 변환"""
            result = {}
            for field in fields:
                if hasattr(self, field):
                    result[field] = getattr(self, field)
            return result
        
        def update(self, **kwargs):
            """필드 업데이트"""
            for key, value in kwargs.items():
                if key in fields:
                    setattr(self, key, value)
        
        def __repr__(self):
            field_strs = []
            for field in fields:
                if hasattr(self, field):
                    value = getattr(self, field)
                    field_strs.append(f"{field}={value!r}")
            return f"{class_name}({', '.join(field_strs)})"
    
    DynamicDataClass.__name__ = class_name
    return DynamicDataClass

# 사용 예시: API 응답 모델 동적 생성
User = create_data_class(
    'User', 
    ['id', 'name', 'email', 'age'],
    validations={
        'email': lambda x: '@' in str(x) if x else False,
        'age': lambda x: isinstance(x, int) and x >= 0
    }
)

# 인스턴스 생성 및 사용
user = User(id=1, name='Alice', email='alice@example.com', age=30)
print(user)  # User(id=1, name='Alice', email='alice@example.com', age=30)

user.update(age=31)
print(user.to_dict())  # {'id': 1, 'name': 'Alice', 'email': 'alice@example.com', 'age': 31}
```

---

## 성능 비교

```python
import time

class TestClass:
    value = 42

obj = TestClass()
iterations = 1000000

# 직접 접근
start = time.time()
for _ in range(iterations):
    x = obj.value
direct_time = time.time() - start

# getattr 사용
start = time.time()
for _ in range(iterations):
    x = getattr(obj, 'value')
getattr_time = time.time() - start

print(f"직접 접근: {direct_time:.4f}초")
print(f"getattr 사용: {getattr_time:.4f}초")
print(f"성능 차이: {getattr_time/direct_time:.1f}배 느림")

# 결과 예시:
# 직접 접근: 0.0521초
# getattr 사용: 0.1032초  
# 성능 차이: 2.0배 느림
```
---

## 결론
- **속성명이 고정**: 직접 접근 (`obj.attr`)
- **속성명이 변수**: 동적 함수 (`getattr(obj, attr_name)`)
- **확장성 필요**: 동적 함수로 유연한 구조 설계

Python의 동적 속성 조작은 `편의를 위한 기능`이 아니라 **`확장 가능한 아키텍처를 위한 핵심 도구`**다.  
적절히 사용하면 코드의 유연성과 재사용성을 크게 향상시킬 수 있다.