---
title: "SQL 기초문법 정리 - SELECT & WHERE절"
date: 2022-11-19
categories: [sql]
tags: [sql]
---

## SELECT 문법 구조

> SQL의 SELECT 문은 데이터베이스에서 데이터를 조회하는 기본 명령어다.

```sql
SELECT column1, column2, ...
FROM table_name
WHERE condition;
```

### 기본 조회

```sql
-- 전체 컬럼 조회
SELECT * FROM users;

-- 특정 컬럼 조회
SELECT name, email FROM users;

-- 별칭(alias) 사용
SELECT name AS user_name, email AS user_email FROM users;
```

> `*`는 모든 컬럼을 의미하지만, 운영 환경에서는 필요한 컬럼만 명시하는 것이 성능상 유리하다.

## WHERE 조건절

> WHERE절은 조회할 **데이터의 조건을 지정**한다. 다양한 연산자와 함수를 활용할 수 있다.

### 비교 연산자

```sql
-- 기본 비교 연산자
SELECT * FROM users WHERE age = 25;
SELECT * FROM users WHERE age > 30;
SELECT * FROM users WHERE age >= 25;
SELECT * FROM users WHERE age <> 30;
SELECT * FROM users WHERE age != 30;
```

### 논리 연산자

```sql
-- AND 연산자
SELECT * FROM users WHERE age >= 25 AND city = '서울';

-- OR 연산자
SELECT * FROM users WHERE city = '서울' OR city = '부산';

-- NOT 연산자
SELECT * FROM users WHERE NOT city = '서울';
```

### 패턴 매칭 (LIKE)

```sql
-- 특정 문자로 시작
SELECT * FROM users WHERE email LIKE 'kim%';

-- 특정 문자로 끝남
SELECT * FROM users WHERE email LIKE '%gmail.com';

-- 특정 문자 포함
SELECT * FROM users WHERE name LIKE '%수%';

-- 한 글자 매칭 (_)
SELECT * FROM users WHERE name LIKE '김_수';
```

### 범위 조건

```sql
-- BETWEEN 연산자
SELECT * FROM users WHERE age BETWEEN 25 AND 35;

-- IN 연산자
SELECT * FROM users WHERE city IN ('서울', '부산', '대구');

-- NOT IN 연산자
SELECT * FROM users WHERE city NOT IN ('서울', '부산');
```

### NULL 처리

```sql
-- NULL 값 확인
SELECT * FROM users WHERE phone IS NULL;
SELECT * FROM users WHERE phone IS NOT NULL;

-- NULL 값은 = 연산자로 비교할 수 없음
-- WHERE phone = NULL (잘못된 방법)
-- WHERE phone IS NULL (올바른 방법)
```

---

## 기본 함수 활용

### 문자열 함수

```sql
-- 문자열 길이
SELECT name, LENGTH(name) AS name_length FROM users;

-- 대소문자 변환
SELECT name, UPPER(name) AS upper_name FROM users;
SELECT name, LOWER(name) AS lower_name FROM users;

-- 문자열 추출
SELECT email, SUBSTRING(email, 1, POSITION('@' IN email)-1) AS username FROM users;

-- 문자열 연결
SELECT name || ' (' || city || ')' AS user_info FROM users;
```

### 숫자 함수

```sql
-- 반올림
SELECT product_name, price, ROUND(price/1000, 1) AS price_k FROM orders;

-- 올림, 내림
SELECT price, CEIL(price/1000) AS ceil_price FROM orders;
SELECT price, FLOOR(price/1000) AS floor_price FROM orders;

-- 절대값
SELECT ABS(-100) AS absolute_value;
```

### 날짜 함수

```sql
-- 현재 날짜/시간
SELECT CURRENT_DATE, CURRENT_TIMESTAMP;

-- 날짜 추출
SELECT name, DATE(created_at) AS created_date FROM users;

-- 날짜 차이 (PostgreSQL)
SELECT name, AGE(CURRENT_DATE, DATE(created_at)) AS signup_period FROM users;
```

---

## 조건부 처리 (CASE WHEN)

```sql
-- 기본 CASE 문
SELECT name, age,
       CASE 
         WHEN age < 30 THEN '청년'
         WHEN age < 40 THEN '중년'
         ELSE '장년'
       END AS age_group
FROM users;

-- 간단한 CASE 문
SELECT name,
       CASE city
         WHEN '서울' THEN '수도권'
         WHEN '인천' THEN '수도권'
         ELSE '지방'
       END AS region
FROM users;
```