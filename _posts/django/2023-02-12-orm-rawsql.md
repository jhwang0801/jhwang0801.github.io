---
title: "Django에서 JOIN 다루기 - ORM부터 Raw SQL까지"
date: 2022-12-17
categories: [django]
tags: [django]
---

## **Django ORM의 JOIN 메커니즘**

### 모델 관계 정의

```python
# models.py
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=50)
    email = models.EmailField()
    city = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

class Category(models.Model):
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)

class Product(models.Model):
    name = models.CharField(max_length=100)
    category = models.ForeignKey(Category, on_delete=models.CASCADE)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock_quantity = models.IntegerField(default=0)

class Order(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    order_date = models.DateField(auto_now_add=True)
    status = models.CharField(max_length=20, default='pending')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
```

## **select_related - SQL JOIN 활용**

> **`select_related`**는 SQL의 LEFT JOIN을 생성하여 한 번의 쿼리로 관련 객체를 함께 가져온다.

### 기본 사용

> ```python
> # N+1 문제 발생 코드
> orders = Order.objects.all()
> for order in orders:
>     print(f"{order.user.name}: {order.total_amount}")  # 각 order마다 user 쿼리 실행
> 
> # 생성되는 SQL (N+1 문제)
> # SELECT * FROM orders;                    -- 1번째 쿼리
> # SELECT * FROM users WHERE id = 1;        -- 2번째 쿼리 (첫 번째 주문의 사용자)
> # SELECT * FROM users WHERE id = 2;        -- 3번째 쿼리 (두 번째 주문의 사용자)
> # ... 주문 개수만큼 반복
> ```
> 
> ```python
> # select_related로 최적화
> orders = Order.objects.select_related('user').all()
> for order in orders:
>     print(f"{order.user.name}: {order.total_amount}")  # 추가 쿼리 없음
> 
> # 생성되는 SQL (JOIN 사용)
> # SELECT orders.*, users.*
> # FROM orders
> # LEFT OUTER JOIN users ON orders.user_id = users.id;
> ```

### 다중 관계 select_related

> ```python
> # 여러 관계를 한 번에 JOIN
> order_items = OrderItem.objects.select_related(
>     'order__user',           # order → user
>     'product__category'      # product → category
> ).all()
> 
> for item in order_items:
>     print(f"고객: {item.order.user.name}")
>     print(f"상품: {item.product.name}")
>     print(f"카테고리: {item.product.category.name}")
> 
> # 생성되는 SQL
> # SELECT orderitem.*, order.*, users.*, product.*, category.*
> # FROM orderitem
> # LEFT OUTER JOIN order ON orderitem.order_id = order.id
> # LEFT OUTER JOIN users ON order.user_id = users.id
> # LEFT OUTER JOIN product ON orderitem.product_id = product.id
> # LEFT OUTER JOIN category ON product.category_id = category.id;
> ```

### select_related 사용 조건

- **ForeignKey** (N:1 관계)
- **OneToOneField** (1:1 관계)
- **역방향 OneToOneField**

> ```python
> # 사용 가능한 경우
> Order.objects.select_related('user')              # ForeignKey
> User.objects.select_related('profile')            # OneToOneField
> Profile.objects.select_related('user')            # 역방향 OneToOneField
> 
> # 사용 불가능한 경우
> User.objects.select_related('order_set')          # 역방향 ForeignKey (1:N)
> Order.objects.select_related('products')          # ManyToManyField (N:N)
> ```

---

## **prefetch_related - 별도 쿼리 + Python 연결**

> **`prefetch_related`**는 JOIN을 사용하지 않고 별도의 쿼리를 실행한 후 Python에서 관계를 연결한다.

### 동작 원리

> ```python
> # prefetch_related 사용
> users = User.objects.prefetch_related('order_set').all()
> 
> for user in users:
>     print(f"{user.name}의 주문:")
>     for order in user.order_set.all():  # 추가 쿼리 없음
>         print(f"  {order.order_date}: {order.total_amount}")
> ```

### 내부 동작 과정

> ```python
> # 1단계: 사용자 조회
> SELECT id, name, email, city FROM users;
> 
> # 2단계: 관련 주문들을 IN절로 한 번에 조회
> SELECT id, user_id, order_date, total_amount 
> FROM orders 
> WHERE user_id IN (1, 2, 3, 4, 5);
> 
> # 3단계: Python에서 user_id 기준으로 관계 연결
> Django가 내부적으로 수행:
> {
>   1: [Order(id=1), Order(id=3)],  # 김철수의 주문들
>   2: [Order(id=2), Order(id=5)],  # 이영희의 주문들
>   3: [],                          # 박민수는 주문 없음
> }
> ```


### 복잡한 prefetch_related

> ```python
> from django.db.models import Prefetch
> 
> # 조건부 prefetch
> users = User.objects.prefetch_related(
>     Prefetch(
>         'order_set',
>         queryset=Order.objects.filter(status='completed').order_by('-order_date'),
>         to_attr='completed_orders'
>     )
> ).all()
> 
> for user in users:
>     for order in user.completed_orders:  # 완료된 주문만
>         print(f"{order.order_date}: {order.total_amount}")
> ```

### prefetch_related 사용 조건

- **역방향 ForeignKey** (1:N 관계)
- **ManyToManyField** (N:N 관계)
- **GenericForeignKey**

> ```python
> User.objects.prefetch_related('order_set')           # 역방향 ForeignKey
> Order.objects.prefetch_related('products')           # ManyToManyField
> User.objects.prefetch_related('liked_products')      # ManyToManyField
> ```

## **N+1 문제와 해결방법**

### N+1 문제 발생 패턴

> ```python
> # 패턴 1: ForeignKey 접근
> orders = Order.objects.all()
> for order in orders:
>     print(order.user.name)  # N+1 문제!
> 
> # 해결: select_related 사용
> orders = Order.objects.select_related('user').all()
> 
> # 패턴 2: 역방향 ForeignKey 접근
> users = User.objects.all()
> for user in users:
>     print(user.order_set.count())  # N+1 문제!
> 
> # 해결: prefetch_related 사용
> users = User.objects.prefetch_related('order_set').all()
> 
> # 패턴 3: 중첩 관계 접근
> order_items = OrderItem.objects.all()
> for item in order_items:
>     print(item.order.user.name)        # N+1 문제!
>     print(item.product.category.name)  # N+1 문제!
> 
> # 해결: 중첩 select_related 사용
> order_items = OrderItem.objects.select_related(
>     'order__user',
>     'product__category'
> ).all()
> ```

---

## **Django ORM의 한계**

### 지원하지 않는 JOIN 타입

> ```python
> # Django ORM이 지원하지 않는 기능들
> # 1. RIGHT JOIN
> # 2. FULL OUTER JOIN
> # 3. CROSS JOIN
> # 4. Self JOIN (제한적 지원)
> # 5. 복잡한 조건의 JOIN
> # 6. 윈도우 함수와 함께 사용되는 JOIN
> ```

### Self Join의 한계

> ```python
> class Employee(models.Model):
>     name = models.CharField(max_length=50)
>     manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True)
> 
> # ORM으로는 제한적
> employees = Employee.objects.select_related('manager').all()
> for emp in employees:
>     manager_name = emp.manager.name if emp.manager else '없음'
>     print(f"{emp.name}의 관리자: {manager_name}")
> 
> # 더 복잡한 Self JOIN은 Raw SQL 필요
> ```

<!-- ## **Raw SQL 사용법**

> 복잡한 JOIN이나 ORM으로 표현하기 어려운 쿼리는 Raw SQL을 사용한다.

### 1. objects.raw() 사용

> ```python
> # Self JOIN으로 직원과 관리자 정보 조회
> employees = Employee.objects.raw("""
>     SELECT e.id, e.name, e.position, 
>            COALESCE(m.name, '없음') as manager_name
>     FROM employees e
>     LEFT JOIN employees m ON e.manager_id = m.id
>     ORDER BY e.name
> """)
> 
> for emp in employees:
>     print(f"{emp.name} - 관리자: {emp.manager_name}")
> 
> # 파라미터 바인딩
> active_orders = Order.objects.raw("""
>     SELECT o.*, u.name as user_name
>     FROM orders o
>     INNER JOIN users u ON o.user_id = u.id
>     WHERE o.order_date >= %s AND o.status = %s
> """, ['2023-01-01', 'completed'])
> ```

### 2. connection.cursor() 사용

```python
from django.db import connection

def get_sales_report(start_date, end_date):
    """복잡한 집계 리포트 생성"""
    query = """
        SELECT 
            c.name as category,
            COUNT(DISTINCT o.user_id) as unique_customers,
            COUNT(oi.id) as total_orders,
            SUM(oi.quantity * oi.unit_price) as total_revenue,
            AVG(oi.quantity * oi.unit_price) as avg_order_value
        FROM categories c
        INNER JOIN products p ON c.id = p.category_id
        INNER JOIN orderitems oi ON p.id = oi.product_id
        INNER JOIN orders o ON oi.order_id = o.id
        WHERE o.order_date BETWEEN %s AND %s
        GROUP BY c.id, c.name
        ORDER BY total_revenue DESC
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [start_date, end_date])
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

# 사용
report = get_sales_report('2023-01-01', '2023-12-31')
for row in report:
    print(f"{row['category']}: {row['total_revenue']:,}원")
```

### 3. 윈도우 함수 활용

```python
def get_top_customers_by_category():
    """카테고리별 상위 고객 순위"""
    query = """
        WITH customer_category_sales AS (
            SELECT 
                u.id as user_id,
                u.name as user_name,
                c.id as category_id,
                c.name as category_name,
                SUM(oi.quantity * oi.unit_price) as total_spent
            FROM users u
            INNER JOIN orders o ON u.id = o.user_id
            INNER JOIN orderitems oi ON o.id = oi.order_id
            INNER JOIN products p ON oi.product_id = p.id
            INNER JOIN categories c ON p.category_id = c.id
            GROUP BY u.id, u.name, c.id, c.name
        )
        SELECT 
            user_name,
            category_name,
            total_spent,
            ROW_NUMBER() OVER (
                PARTITION BY category_id 
                ORDER BY total_spent DESC
            ) as rank
        FROM customer_category_sales
        WHERE total_spent > 0
        ORDER BY category_name, rank
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query)
        return cursor.fetchall()
```

## Raw SQL 사용 시기와 기준

### ORM 사용 권장

```python
# 단순한 CRUD 작업
users = User.objects.filter(city='서울')
orders = Order.objects.select_related('user').filter(status='completed')

# 기본적인 집계
from django.db.models import Count, Sum, Avg
stats = Order.objects.aggregate(
    total_orders=Count('id'),
    total_revenue=Sum('total_amount'),
    avg_order_value=Avg('total_amount')
)

# 간단한 관계 조회
order_items = OrderItem.objects.select_related(
    'order__user', 'product__category'
).all()
```

### Raw SQL 사용 권장

```python
# 1. 복잡한 윈도우 함수
# 2. 데이터베이스 특화 기능 (PostgreSQL 배열, JSON 함수 등)
# 3. 성능이 중요한 대용량 집계
# 4. CTE (Common Table Expression)
# 5. 복잡한 Self JOIN
# 6. FULL OUTER JOIN, CROSS JOIN
# 7. 복잡한 비즈니스 로직이 포함된 쿼리

# 예시: 월별 매출 증감률
def get_monthly_growth():
    return connection.cursor().execute("""
        WITH monthly_sales AS (
            SELECT 
                DATE_TRUNC('month', order_date) as month,
                SUM(total_amount) as sales
            FROM orders
            GROUP BY DATE_TRUNC('month', order_date)
        )
        SELECT 
            month,
            sales,
            LAG(sales) OVER (ORDER BY month) as prev_sales,
            ROUND(
                ((sales - LAG(sales) OVER (ORDER BY month)) / 
                 LAG(sales) OVER (ORDER BY month) * 100)::numeric, 2
            ) as growth_rate
        FROM monthly_sales
        ORDER BY month
    """).fetchall()
```

## 하이브리드 접근법

실무에서는 ORM과 Raw SQL을 적절히 섞어 사용하는 것이 효과적이다.

### 서비스 레이어에서 조합

```python
class OrderAnalyticsService:
    @staticmethod
    def get_user_summary(user_id):
        # 기본 정보는 ORM으로
        user = User.objects.select_related('profile').get(id=user_id)
        
        # 복잡한 통계는 Raw SQL로
        stats_query = """
            SELECT 
                COUNT(*) as total_orders,
                SUM(total_amount) as total_spent,
                AVG(total_amount) as avg_order_value,
                MAX(order_date) as last_order_date,
                COUNT(DISTINCT oi.product_id) as unique_products
            FROM orders o
            LEFT JOIN orderitems oi ON o.id = oi.order_id
            WHERE o.user_id = %s
        """
        
        with connection.cursor() as cursor:
            cursor.execute(stats_query, [user_id])
            stats = cursor.fetchone()
        
        # 최근 주문은 ORM으로
        recent_orders = Order.objects.filter(user_id=user_id).order_by('-order_date')[:5]
        
        return {
            'user': user,
            'stats': {
                'total_orders': stats[0],
                'total_spent': stats[1],
                'avg_order_value': stats[2],
                'last_order_date': stats[3],
                'unique_products': stats[4]
            },
            'recent_orders': recent_orders
        }
```

### 캐싱과 함께 사용

```python
from django.core.cache import cache
from django.db import connection

def get_category_performance(cache_timeout=3600):
    """카테고리별 성과 분석 (캐싱 적용)"""
    cache_key = 'category_performance'
    result = cache.get(cache_key)
    
    if result is None:
        query = """
            SELECT 
                c.name,
                COUNT(DISTINCT o.user_id) as customers,
                SUM(oi.quantity * oi.unit_price) as revenue,
                AVG(oi.quantity * oi.unit_price) as avg_order
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            LEFT JOIN orderitems oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id
            WHERE o.order_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY c.id, c.name
            ORDER BY revenue DESC
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            result = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        cache.set(cache_key, result, cache_timeout)
    
    return result
```

## 성능 모니터링과 디버깅

### Django Debug Toolbar 활용

```python
# settings.py
if DEBUG:
    INSTALLED_APPS += ['debug_toolbar']
    MIDDLEWARE += ['debug_toolbar.middleware.DebugToolbarMiddleware']
    
    DEBUG_TOOLBAR_CONFIG = {
        'SHOW_TOOLBAR_CALLBACK': lambda request: True,
    }
```

### 쿼리 로깅

```python
# settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'django.db.backends': {
            'handlers': ['console'],
            'level': 'DEBUG',
        },
    },
}
```

### 프로파일링 도구

```python
from django.test.utils import override_settings
from django.db import connection

@override_settings(DEBUG=True)
def profile_query(func):
    """쿼리 성능 프로파일링 데코레이터"""
    def wrapper(*args, **kwargs):
        queries_before = len(connection.queries)
        
        result = func(*args, **kwargs)
        
        queries_after = len(connection.queries)
        print(f"Executed {queries_after - queries_before} queries")
        
        for query in connection.queries[queries_before:]:
            print(f"Time: {query['time']}s")
            print(f"SQL: {query['sql'][:100]}...")
        
        return result
    return wrapper

# 사용
@profile_query
def get_orders_with_details():
    return Order.objects.select_related('user').prefetch_related('orderitem_set').all()
```

## 정리

Django ORM은 강력하지만 한계가 있다. `select_related`로 INNER/LEFT JOIN을 활용하고, `prefetch_related`로 1:N, N:N 관계를 효율적으로 처리하며, N+1 문제를 예방하는 것이 기본이다. 

복잡한 분석 쿼리나 데이터베이스 특화 기능이 필요한 경우에는 Raw SQL을 적극 활용하되, SQL 인젝션 방지와 트랜잭션 관리에 주의해야 한다. 실무에서는 ORM과 Raw SQL을 적절히 조합하는 하이브리드 접근법이 가장 효과적이다.

성능 최적화는 지속적인 모니터링과 프로파일링을 통해 병목 지점을 찾아 개선하는 것이 중요하며, 특히 대용량 서비스에서는 데이터베이스 레벨의 최적화도 함께 고려해야 한다. -->