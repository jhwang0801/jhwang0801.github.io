---
title: "Database NULL vs NOT NULL 성능 차이"
date: 2023-11-11
categories: [database]
tags: [mysql, postgresql, performance]
---

## 개요

최근 회사에서 새로운 프로젝트를 진행하면서 DBA와 협업할 기회가 있었다. 데이터베이스 테이블 설계를 리뷰하던 중, DBA가 의외의 조언을 해주었다.

> "가능하면 모든 컬럼을 NOT NULL로 설계하는게 좋겠습니다. 성능상 이점이 있어서요."

```sql
-- 최초 설계한 테이블 예시
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),          -- NULL 허용
    phone VARCHAR(20),           -- NULL 허용
    created_at TIMESTAMP
);

-- DBA가 권장한 설계 예시
CREATE TABLE users_optimized (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL DEFAULT '',
    phone VARCHAR(20) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

솔직히 처음엔 "그게 그렇게 큰 차이가 날까?" 싶었다. 하지만 DBA의 설명을 듣고 직접 테스트해보니 생각보다 차이가 컸다.\
이 글에서는 내가 경험한 내용들을 정리해보려고 한다.

---

## NULL이 성능에 영향을 주는 이유

### 💾 저장 공간의 차이

DBA가 첫 번째로 설명해준 건 저장 공간 문제였다.

> "NULL 값을 저장하려면 추가 공간이 필요해요. NULL 비트맵이라는 걸 사용하거든요."

```sql
-- 간단한 실험
CREATE TABLE test_null (
    id INT AUTO_INCREMENT PRIMARY KEY,
    col1 VARCHAR(10),     -- NULL 허용
    col2 VARCHAR(10),     -- NULL 허용  
    col3 VARCHAR(10)      -- NULL 허용
);

CREATE TABLE test_not_null (
    id INT AUTO_INCREMENT PRIMARY KEY,
    col1 VARCHAR(10) NOT NULL DEFAULT '',
    col2 VARCHAR(10) NOT NULL DEFAULT '',
    col3 VARCHAR(10) NOT NULL DEFAULT ''
);
```
**NULL이 저장되는 방식:**

MySQL은 각 행(row)마다 "NULL 비트맵"이라는 걸 만든다. 이건 어떤 컬럼이 NULL인지 아닌지를 기록하는 지도 같은 거다.

```
-- 예시 테이블
CREATE TABLE example (
    id INT NOT NULL,           -- NULL 불가능 → 비트맵에 포함 안됨
    name VARCHAR(50),          -- NULL 가능 → 1비트 필요
    email VARCHAR(100),        -- NULL 가능 → 1비트 필요  
    phone VARCHAR(20),         -- NULL 가능 → 1비트 필요
    address TEXT              -- NULL 가능 → 1비트 필요
);
-- 총 4개 NULL 가능 컬럼 = 4비트 = 1바이트 NULL 비트맵
```

**실제 데이터가 저장될 때:**
```
행 1: [NULL비트맵: 0101] [id: 1] [name: "김철수"] [email: NULL] [phone: "010-1234"] [address: NULL]
     ↳ 0101은 이진수로 "name=있음, email=없음, phone=있음, address=없음"
     
행 2: [NULL비트맵: 1111] [id: 2] [name: "이영희"] [email: "lee@test.com"] [phone: "010-5678"] [address: "서울시..."]
     ↳ 1111은 "모든 컬럼에 값이 있음"
```

**비트맵 크기 계산:**
- 1-8개 NULL 가능 컬럼 → 1바이트 (8비트)
- 9-16개 NULL 가능 컬럼 → 2바이트 (16비트)
- 17-24개 NULL 가능 컬럼 → 3바이트 (24비트)

**실제 저장 공간 차이 계산해보기:**
```
-- NULL 허용 테이블 (3개 컬럼이 NULL 가능)
CREATE TABLE users_nullable (
    id INT AUTO_INCREMENT PRIMARY KEY,  -- 4바이트
    username VARCHAR(50),                -- 최대 50바이트 + NULL비트
    email VARCHAR(100),                  -- 최대 100바이트 + NULL비트  
    phone VARCHAR(20)                    -- 최대 20바이트 + NULL비트
);
-- 각 행마다 1바이트 NULL 비트맵 추가!

-- NOT NULL 테이블
CREATE TABLE users_not_null (
    id INT AUTO_INCREMENT PRIMARY KEY,  -- 4바이트
    username VARCHAR(50) NOT NULL DEFAULT '',   -- 최대 50바이트
    email VARCHAR(100) NOT NULL DEFAULT '',     -- 최대 100바이트
    phone VARCHAR(20) NOT NULL DEFAULT ''       -- 최대 20바이트  
);
-- NULL 비트맵 없음!
```

**100만 행에서의 차이:**
- NULL 허용 테이블: 100만 행 × 1바이트 = 1MB 추가 공간
- 실제 데이터까지 포함하면 전체 테이블 크기의 3-5% 정도

**그런데 사실 더 큰 문제는 메모리다:**
- 데이터베이스는 자주 쓰는 데이터를 메모리에 캐싱함
- NULL 비트맵 때문에 같은 메모리에 더 적은 행을 담을 수 있음
- 결과적으로 캐시 효율이 떨어져서 디스크 I/O가 더 많이 발생

### 🔍 인덱스에서의 성능 차이

두 번째는 인덱스 성능이었다. 이 부분이 가장 놀라웠다.

```sql
-- 인덱스 성능 테스트
CREATE TABLE performance_test (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email_nullable VARCHAR(100),
    email_not_null VARCHAR(100) NOT NULL DEFAULT '',
    INDEX idx_nullable (email_nullable),
    INDEX idx_not_null (email_not_null)
);

-- 테스트 데이터 삽입 (10만 건)
INSERT INTO performance_test (email_nullable, email_not_null)
SELECT 
    CASE WHEN RAND() < 0.3 THEN NULL 
         ELSE CONCAT('user', FLOOR(RAND() * 10000), '@test.com') END,
    CONCAT('user', FLOOR(RAND() * 10000), '@test.com')
FROM information_schema.tables 
LIMIT 100000;
```

실제 쿼리 성능을 비교해봤다:

```sql
-- NULL 허용 컬럼 검색
EXPLAIN ANALYZE 
SELECT COUNT(*) FROM performance_test 
WHERE email_nullable LIKE 'user1%';

-- NOT NULL 컬럼 검색  
EXPLAIN ANALYZE 
SELECT COUNT(*) FROM performance_test 
WHERE email_not_null LIKE 'user1%';
```

정확히 몇 퍼센트인지는 측정하기 어려웠지만, 여러 번 실행해보니 확실히 차이가 났다.\
구체적인 수치를 확인해보고자 다양한 루트를 통해 검색해보았지만, `NULL 처리에 오버헤드가 있다`는 이론적 설명이 대부분이었으며 차이의 이유는 MySQL이 NULL 값을 처리할 때 추가적인 체크 과정이 필요하기 때문이다.

---

## MySQL vs PostgreSQL 차이점

내가 주로 사용하는 DB는 PostgreSQL이기에 비교해봤다.

### MySQL의 NULL 처리
```sql
-- MySQL에서는 이런 쿼리도 인덱스를 사용하지만 느리다
SELECT * FROM users WHERE email IS NULL;
SELECT * FROM users WHERE email IS NOT NULL;
```

### PostgreSQL의 부분 인덱스(Partial Index)
```sql
-- PostgreSQL만의 기능: 부분 인덱스
CREATE INDEX idx_email_not_null ON users (email) 
WHERE email IS NOT NULL;

-- 이렇게 하면 NULL이 아닌 값들만 인덱스에 저장됨
-- 인덱스 크기도 작아지고 검색도 빨라짐
```

PostgreSQL을 쓴다면 이런 방법으로 어느 정도 최적화가 가능하다.

---

## OLTP 환경에서 왜 중요한가?

DBA가 강조한 또 다른 포인트는 **OLTP 환경**이었다.

**OLTP(Online Transaction Processing)**란?
- 우리가 만드는 대부분의 웹 서비스가 OLTP
- 사용자 로그인, 주문 처리, 게시글 작성 등
- 특징: 짧고 빠른 쿼리가 엄청 많이 실행됨

```sql
-- 하루에 수만 번 실행되는 전형적인 OLTP 쿼리들
SELECT id FROM users WHERE email = 'user@example.com';  -- 로그인
INSERT INTO orders (user_id, amount) VALUES (123, 50000);  -- 주문
UPDATE products SET stock = stock - 1 WHERE id = 456;      -- 재고 감소
```

이런 환경에서는 **개별 쿼리가 10ms 느려져도 전체적으로는 큰 영향**이 있다. 

---

## 그러면 언제나 NOT NULL을 써야 할까?

물론 무조건 NOT NULL이 답은 아니다. 상황에 따라 다르다.

### ✅ NOT NULL을 써야 하는 경우
```sql
-- 1. 명백히 필수인 데이터
CREATE TABLE users (
    id INT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,        -- 필수
    email VARCHAR(100) NOT NULL,          -- 필수
    created_at TIMESTAMP NOT NULL         -- 필수
);

-- 2. 기본값으로 대체 가능한 데이터
CREATE TABLE posts (
    id INT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    view_count INT NOT NULL DEFAULT 0,    -- 0으로 초기화
    status ENUM('draft', 'published') NOT NULL DEFAULT 'draft'
);
```

### ✅ NULL을 허용해야 하는 경우
```sql
-- 정말 선택적인 데이터
CREATE TABLE user_profiles (
    user_id INT PRIMARY KEY,
    bio TEXT,                    -- 자기소개 (선택)
    website VARCHAR(200),        -- 웹사이트 (선택)
    birth_date DATE             -- 생년월일 (선택)
);
```

### 🤔 애매한 경우의 해결책
정말 애매한 경우에는 **테이블을 분리**하는 것도 방법이다.

```sql
-- 필수 정보만 담는 메인 테이블
CREATE TABLE users (
    id INT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL
);

-- 선택적 정보는 별도 테이블
CREATE TABLE user_details (
    user_id INT PRIMARY KEY,
    phone VARCHAR(20),
    address TEXT,
    bio TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

이렇게 하면 메인 테이블은 성능 최적화가 되고, 선택적 데이터는 자연스럽게 NULL을 허용할 수 있다.

---

## 결론

DBA에게 배운 이 경험은 꽤 인상적이었다. 사실 개발하면서 NULL vs NOT NULL을 그렇게 신경 쓰지 않았는데, 생각보다 성능에 미치는 영향이 컸다.

**핵심 포인트들:**
1. **저장 공간**: NULL은 추가 공간이 필요함
2. **인덱스 성능**: RDBMS에 따라 차이는 있지만, NOT NULL이 더 빠름
3. **OLTP 환경**: 작은 차이도 누적되면 큰 영향
4. **PostgreSQL**: 부분 인덱스로 어느 정도 최적화 가능

완벽한 정답은 없지만, **성능이 중요한 서비스라면 NOT NULL 우선으로 설계**하는 게 좋겠다. 특히 사용자가 많거나 트래픽이 높은 서비스에서는 이런 최적화가 실제로 체감될 수 있을 것 같다.

물론 무엇보다 중요한 건 **비즈니스 로직에 맞는 올바른 데이터 모델링**이다. 성능 최적화는 그 다음 단계에서 고려할 문제다. 하지만 처음 설계할 때부터 이런 부분을 알고 있다면 더 나은 선택을 할 수 있을 것 같다.

---