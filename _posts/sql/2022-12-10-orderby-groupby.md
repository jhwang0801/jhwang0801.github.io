---
title: "SQL 기초문법 정리 - ORDER BY & GROUP BY"
date: 2022-12-10
categories: [sql]
tags: [sql, orderby, groupby]
---

## ORDER BY - 데이터 정렬

> ORDER BY절은 조회된 데이터를 특정 기준으로 정렬할 때 사용한다. SELECT문의 가장 마지막에 위치한다.

### 기본 정렬

```sql
-- 오름차순 정렬 (기본값)
SELECT * FROM users ORDER BY age;
SELECT * FROM users ORDER BY age ASC;

-- 내림차순 정렬
SELECT * FROM users ORDER BY age DESC;

-- 문자열 정렬
SELECT * FROM users ORDER BY name;
SELECT * FROM users ORDER BY city DESC;
```

### 다중 컬럼 정렬

```sql
-- 첫 번째 기준으로 정렬 후, 같은 값일 때 두 번째 기준 적용
SELECT * FROM users ORDER BY city, age;
SELECT * FROM users ORDER BY city ASC, age DESC;

-- 도시별로 그룹화하고, 각 그룹 내에서 나이 내림차순
SELECT name, city, age 
FROM users 
ORDER BY city, age DESC;
```

### 계산된 값으로 정렬

```sql
-- 계산된 컬럼으로 정렬
SELECT name, age, age * 12 AS age_in_months 
FROM users 
ORDER BY age_in_months DESC;

-- 함수 결과로 정렬
SELECT name, email 
FROM users 
ORDER BY LENGTH(name) DESC;
```

---

## 집계 함수

> 집계 함수는 여러 행의 데이터를 하나의 결과값으로 계산하는 함수다.

### 기본 집계 함수

```sql
-- COUNT: 행의 개수
SELECT COUNT(*) AS total_users FROM users;
SELECT COUNT(phone) AS users_with_phone FROM users;  -- NULL 제외

-- SUM: 합계
SELECT SUM(price * quantity) AS total_revenue FROM orders;

-- AVG: 평균
SELECT AVG(age) AS average_age FROM users;
SELECT ROUND(AVG(price), 2) AS average_price FROM orders;

-- MAX/MIN: 최댓값/최솟값
SELECT MAX(age) AS oldest, MIN(age) AS youngest FROM users;
SELECT MAX(order_date) AS latest_order FROM orders;
```

### 조건부 집계

```sql
-- WHERE절과 함께 사용
SELECT COUNT(*) AS seoul_users 
FROM users 
WHERE city = '서울';

-- CASE WHEN을 활용한 조건부 카운트
SELECT 
    COUNT(*) AS total_users,
    COUNT(CASE WHEN age >= 30 THEN 1 END) AS users_over_30,
    COUNT(CASE WHEN city = '서울' THEN 1 END) AS seoul_users
FROM users;
```

---

## GROUP BY - 데이터 그룹화

> GROUP BY절은 특정 컬럼의 값이 같은 행들을 하나의 그룹으로 묶어 집계 함수를 적용할 때 사용한다.

### 기본 그룹화

```sql
-- 도시별 사용자 수
SELECT city, COUNT(*) AS user_count 
FROM users 
GROUP BY city;

-- 도시별 평균 나이
SELECT city, ROUND(AVG(age), 1) AS average_age 
FROM users 
GROUP BY city;

-- 사용자별 주문 통계
SELECT user_id, 
       COUNT(*) AS order_count,
       SUM(price * quantity) AS total_amount,
       AVG(price) AS average_price
FROM orders 
GROUP BY user_id;
```

### 다중 컬럼 그룹화

```sql
-- 도시와 연령대별 그룹화
SELECT city,
       CASE 
         WHEN age < 30 THEN '20대'
         WHEN age < 40 THEN '30대'
         ELSE '40대 이상'
       END AS age_group,
       COUNT(*) AS user_count
FROM users 
GROUP BY city, 
         CASE 
           WHEN age < 30 THEN '20대'
           WHEN age < 40 THEN '30대'
           ELSE '40대 이상'
         END;
```

### 날짜별 그룹화

```sql
-- 일별 주문 통계
SELECT order_date,
       COUNT(*) AS order_count,
       SUM(price * quantity) AS daily_revenue
FROM orders 
GROUP BY order_date 
ORDER BY order_date;
```

---

## HAVING - 그룹 조건

> HAVING절은 GROUP BY로 생성된 그룹에 조건을 적용할 때 사용한다.  
> WHERE절은 그룹화 이전에, HAVING절은 그룹화 이후에 조건을 적용한다.

### 기본 HAVING 사용

```sql
-- 사용자가 2명 이상인 도시만 조회
SELECT city, COUNT(*) AS user_count 
FROM users 
GROUP BY city 
HAVING COUNT(*) >= 2;

-- 평균 나이가 28세 이상인 도시
SELECT city, ROUND(AVG(age), 1) AS average_age
FROM users 
GROUP BY city 
HAVING AVG(age) >= 28;
```

### WHERE와 HAVING 함께 사용

```sql
-- 30세 미만 사용자 중에서 도시별로 2명 이상인 경우
SELECT city, COUNT(*) AS young_user_count
FROM users 
WHERE age < 30 
GROUP BY city 
HAVING COUNT(*) >= 2;

-- 최근 1개월 주문 중 총 주문금액이 50만원 이상인 사용자
SELECT user_id, 
       COUNT(*) AS order_count,
       SUM(price * quantity) AS total_amount
FROM orders 
WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id 
HAVING SUM(price * quantity) >= 500000;
```

---

## 성능 고려사항

### 인덱스 활용

```sql
-- ORDER BY 성능 향상을 위한 인덱스
CREATE INDEX idx_users_age ON users(age);
CREATE INDEX idx_orders_date ON orders(order_date);

-- GROUP BY 성능 향상을 위한 복합 인덱스
CREATE INDEX idx_orders_user_date ON orders(user_id, order_date);
```

### 쿼리 최적화

- GROUP BY절의 컬럼 순서는 인덱스 순서와 일치시키는 것이 유리
- HAVING절보다는 WHERE절을 먼저 사용하여 데이터 양 축소
- 집계 함수 내에서 복잡한 계산은 피하고, 미리 계산된 컬럼 활용
