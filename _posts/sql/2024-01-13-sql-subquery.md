---
title: "SQL 문법 정리 - 서브쿼리와 CTE"
date: 2024-01-13
categories: [sql]
tags: [sql, subquery, cte]
---

## **서브쿼리(Subquery) 기본 개념**

> 서브쿼리는 다른 쿼리 안에 포함된 SELECT 문. 메인 쿼리의 실행을 위해 보조적인 데이터를 제공.

```sql
-- 평균 급여보다 높은 급여를 받는 직원 조회
SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);
```

### 서브쿼리의 종류

> 1. **스칼라 서브쿼리**: 단일 값을 반환
> 2. **인라인 뷰**: FROM 절에서 임시 테이블 역할
> 3. **중첩 서브쿼리**: WHERE 절에서 조건 검사

---

## **스칼라 서브쿼리**

> 스칼라 서브쿼리는 정확히 하나의 행과 하나의 열을 반환해야 합니다.

```sql
-- 각 부서별 평균 급여와 전체 평균 급여 비교
SELECT 
    department_id,
    AVG(salary) as dept_avg_salary,
    (SELECT AVG(salary) FROM employees) as company_avg_salary,
    AVG(salary) - (SELECT AVG(salary) FROM employees) as diff
FROM employees
GROUP BY department_id;


-- 실행 결과
department_id | dept_avg_salary | company_avg_salary | diff
-------------|-----------------|-------------------|-------
1            | 75000          | 65000             | 10000
2            | 60000          | 65000             | -5000
3            | 70000          | 65000             | 5000
```

---

## **인라인 뷰 (FROM 절 서브쿼리)**

> 인라인 뷰는 FROM 절에서 서브쿼리를 테이블처럼 사용하는 방식입니다.

```sql
-- 부서별 최고 급여자 정보
SELECT 
    d.department_name,
    e.name,
    e.salary
FROM departments d
JOIN (
    SELECT 
        department_id,
        name,
        salary,
        ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY salary DESC) as rn
    FROM employees
) e ON d.id = e.department_id
WHERE e.rn = 1;
```

---

## **중첩 서브쿼리와 연산자**

### EXISTS 연산자

> EXISTS는 서브쿼리의 결과가 존재하는지 확인합니다.

```sql
-- 주문이 있는 고객만 조회
SELECT customer_id, name, email
FROM customers c
WHERE EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.customer_id = c.id
);

-- 주문이 없는 고객 조회
SELECT customer_id, name, email
FROM customers c
WHERE NOT EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.customer_id = c.id
);
```

### IN 연산자

```sql
-- 특정 카테고리에 속한 상품들
SELECT product_name, price
FROM products
WHERE category_id IN (
    SELECT id 
    FROM categories 
    WHERE name IN ('Electronics', 'Books')
);

-- NOT IN 사용시 주의사항 (NULL 값 문제)
SELECT product_name, price
FROM products
WHERE category_id NOT IN (
    SELECT id 
    FROM categories 
    WHERE name IN ('Electronics', 'Books')
    AND id IS NOT NULL  -- NULL 값 제외 필수
);
```

### ANY/ALL 연산자

```sql
-- 어떤 부서의 평균 급여보다라도 높은 급여를 받는 직원
SELECT name, salary
FROM employees
WHERE salary > ANY (
    SELECT AVG(salary)
    FROM employees
    GROUP BY department_id
);

-- 모든 부서의 평균 급여보다 높은 급여를 받는 직원
SELECT name, salary
FROM employees
WHERE salary > ALL (
    SELECT AVG(salary)
    FROM employees
    GROUP BY department_id
);
```

## **Common Table Expression (CTE)**

### WITH 절 기본 사용법

> CTE는 임시 결과 집합을 정의하여 쿼리의 가독성을 높입니다.

```sql
-- 기본 CTE 문법
WITH department_stats AS (
    SELECT 
        department_id,
        AVG(salary) as avg_salary,
        COUNT(*) as employee_count
    FROM employees
    GROUP BY department_id
)
SELECT 
    d.department_name,
    ds.avg_salary,
    ds.employee_count
FROM departments d
JOIN department_stats ds ON d.id = ds.department_id
WHERE ds.avg_salary > 60000;
```

### 다중 CTE 사용

```sql
-- 여러 CTE를 연결하여 사용
WITH 
sales_summary AS (
    SELECT 
        product_id,
        SUM(quantity) as total_quantity,
        SUM(amount) as total_amount
    FROM order_items
    GROUP BY product_id
),
product_performance AS (
    SELECT 
        p.product_name,
        ss.total_quantity,
        ss.total_amount,
        ss.total_amount / ss.total_quantity as avg_price
    FROM products p
    JOIN sales_summary ss ON p.id = ss.product_id
)
SELECT 
    product_name,
    total_quantity,
    total_amount,
    avg_price,
    CASE 
        WHEN total_amount > 100000 THEN 'High'
        WHEN total_amount > 50000 THEN 'Medium'
        ELSE 'Low'
    END as performance_level
FROM product_performance
ORDER BY total_amount DESC;
```

---

## 윈도우 함수 기초

> 윈도우 함수는 그룹화 없이 집계 함수를 사용할 수 있게 해줍니다.

### 순위 함수
```sql
SELECT 
    name, salary,
    ROW_NUMBER() OVER (ORDER BY salary DESC) as row_num,  -- 연속된 순위
    RANK() OVER (ORDER BY salary DESC) as rank_num,       -- 동점시 같은 순위, 다음 순위 건너뜀
    DENSE_RANK() OVER (ORDER BY salary DESC) as dense_rank -- 동점시 같은 순위, 다음 순위 연속
FROM employees;
```

### 집계 함수
```sql
SELECT 
    name, department_id, salary,
    AVG(salary) OVER (PARTITION BY department_id) as dept_avg,
    SUM(salary) OVER (ORDER BY hire_date) as running_total
FROM employees;
```

### 위치 함수
```sql
SELECT 
    order_date, amount,
    LAG(amount, 1) OVER (ORDER BY order_date) as prev_amount,    -- 이전 행
    LEAD(amount, 1) OVER (ORDER BY order_date) as next_amount   -- 다음 행
FROM orders;
```

---

## 성능 고려사항

### 서브쿼리 최적화

```sql
-- 비효율적인 서브쿼리 (매번 실행)
SELECT name, salary
FROM employees e1
WHERE salary > (
    SELECT AVG(salary) 
    FROM employees e2 
    WHERE e2.department_id = e1.department_id
);

-- 효율적인 윈도우 함수 사용
SELECT name, salary
FROM (
    SELECT 
        name, 
        salary,
        AVG(salary) OVER (PARTITION BY department_id) as dept_avg
    FROM employees
) e
WHERE salary > dept_avg;
```

### EXISTS vs IN

```sql
-- EXISTS 사용 (일반적으로 더 빠름)
SELECT c.name
FROM customers c
WHERE EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.customer_id = c.id
);

-- IN 사용 (서브쿼리 결과가 작을 때 유리)
SELECT c.name
FROM customers c
WHERE c.id IN (
    SELECT DISTINCT customer_id 
    FROM orders
);
```

### CTE vs 서브쿼리

```sql
-- CTE 사용 (가독성 우수, 재사용 가능)
WITH active_customers AS (
    SELECT customer_id
    FROM orders
    WHERE order_date >= CURRENT_DATE - INTERVAL '1 year'
    GROUP BY customer_id
    HAVING COUNT(*) > 5
)
SELECT c.name, c.email
FROM customers c
JOIN active_customers ac ON c.id = ac.customer_id;

-- 서브쿼리 사용 (때로는 더 빠를 수 있음)
SELECT c.name, c.email
FROM customers c
WHERE c.id IN (
    SELECT customer_id
    FROM orders
    WHERE order_date >= CURRENT_DATE - INTERVAL '1 year'
    GROUP BY customer_id
    HAVING COUNT(*) > 5
);
```

---

## 주의사항

### NULL 값 처리

```sql
-- NOT IN에서 NULL 값 문제
SELECT product_name
FROM products
WHERE category_id NOT IN (1, 2, NULL);  -- 결과 없음!

-- 올바른 처리
SELECT product_name
FROM products
WHERE category_id NOT IN (
    SELECT id FROM categories 
    WHERE name IN ('Electronics', 'Books')
    AND id IS NOT NULL
);
```

### 스칼라 서브쿼리 주의사항

```sql
-- 여러 행을 반환하면 에러 발생
SELECT name, 
       (SELECT salary FROM employees WHERE department_id = 1) -- 에러 가능성
FROM departments;

-- 안전한 방법
SELECT name, 
       (SELECT MAX(salary) FROM employees WHERE department_id = d.id)
FROM departments d;
```

### 성능 고려사항

- 서브쿼리보다 JOIN이 더 효율적일 수 있음
- EXISTS는 첫 번째 매치에서 중단되므로 IN보다 빠를 수 있음
- 윈도우 함수는 GROUP BY보다 유연하지만 더 많은 메모리 사용

