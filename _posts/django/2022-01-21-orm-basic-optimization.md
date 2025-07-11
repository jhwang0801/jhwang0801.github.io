---
title: "Django ORM 쿼리 기본 최적화"
date: 2022-01-21
categories: [django]
tags: [django, orm, performance, n+1, select_related, prefetch_related, optimization]
---

## **Django ORM 최적화가 중요한 이유**

> Django ORM을 사용하면서 빈번히 마주하는 N+1 쿼리 문제 해결

---

## **N+1 문제**

> 메인 쿼리 1번과 관련 객체를 가져오는 N번의 추가 쿼리가 실행되는 현상
> ```python
> class Author(models.Model):
>     name = models.CharField(max_length=100)
> 
> class Book(models.Model):
>     title = models.CharField(max_length=200)
>     author = models.ForeignKey(Author, on_delete=models.CASCADE)
> 
> # 문제가 되는 코드
> books = Book.objects.all()  # 1번의 쿼리
> for book in books:
>     print(book.author.name)  # 각 book마다 1번씩 추가 쿼리 = N번의 쿼리
> ```
> 
> ### 실제 실행되는 SQL
> 
> ```sql
> -- 첫 번째 쿼리: 모든 책 조회
> SELECT * FROM book;
> 
> -- 각 책마다 실행되는 쿼리들
> SELECT * FROM author WHERE id = 1;
> SELECT * FROM author WHERE id = 2;
> SELECT * FROM author WHERE id = 3;
> -- ... 책의 개수만큼 반복
> ```
> 
> ### Django 내에서 문제 확인 방법
> 
> ```python
> from django.db import connection
> 
> # 쿼리 실행 전 초기화
> connection.queries.clear()
> 
> books = Book.objects.all()
> for book in books:
>     print(book.author.name)
> 
> # 실행된 쿼리 확인
> print(f"실행된 쿼리 수: {len(connection.queries)}")
> for query in connection.queries:
>     print(query['sql'])
> ```

---

## **select_related() - 즉시 로딩**

> `select_related()`는 `ForeignKey`나 `OneToOneField` 관계에서 관련 객체를 **JOIN**을 통해 한 번에 불러옴
> 
> ```python
> # N+1 문제 해결
> books = Book.objects.select_related('author').all()
> ```
> 
> ### 실제 실행되는 SQL
> 
> ```sql
> -- 단 1번의 쿼리로 해결
> SELECT 
>     book.id, book.title, book.author_id,
>     author.id, author.name
> FROM book 
> INNER JOIN author ON book.author_id = author.id;
> ```
> 
> ### 중첩 관계에서의 활용
> 
> ```python
> class Publisher(models.Model):
>     name = models.CharField(max_length=100)
> 
> class Author(models.Model):
>     name = models.CharField(max_length=100)
>     publisher = models.ForeignKey(Publisher, on_delete=models.CASCADE)
> 
> books = Book.objects.select_related('author__publisher').all()
> for book in books:
>     print(f"{book.title} by {book.author.name} ({book.author.publisher.name})")
> ```

---

## **prefetch_related() - 별도 쿼리로 미리 로딩**

> `prefetch_related()`는 `ManyToManyField`나 `역참조 관계`에서 별도의 쿼리로 관련 객체들을 미리 불러옴
> 
> ### ManyToManyField
> 
> ```python
> class Category(models.Model):
>     name = models.CharField(max_length=100)
> 
> class Book(models.Model):
>     title = models.CharField(max_length=200)
>     categories = models.ManyToManyField(Category)
> 
> # N+1 문제
> books = Book.objects.all()
> for book in books:
>     categories = book.categories.all()  # 각 book마다 쿼리 실행
>     print(f"{book.title}: {[c.name for c in categories]}")
> 
> # 해결
> books = Book.objects.prefetch_related('categories').all()
> for book in books:
>     categories = book.categories.all()  # 캐시된 데이터 사용
>     print(f"{book.title}: {[c.name for c in categories]}")
> ```
> 
> ### 역참조 관계
> 
> ```python
> authors = Author.objects.prefetch_related('book_set').all()
> for author in authors:
>     books = author.book_set.all()  # 추가 쿼리 없음
>     print(f"{author.name}: {[b.title for b in books]}")
> ```
> 
> ### 실행되는 SQL
> 
> ```sql
> -- 첫 번째 쿼리: 메인 객체들
> SELECT * FROM book;
> 
> -- 두 번째 쿼리: 관련 객체들을 한 번에
> SELECT * FROM category 
> WHERE id IN (
>     SELECT category_id FROM book_category 
>     WHERE book_id IN (1, 2, 3, 4, 5...)
> );
> ```

---

## **Prefetch 객체로 고급 제어하기**

> `Prefetch 객체`를 사용하면 `prefetch_related()`에서 **필터링**이나 **정렬**을 적용 가능
>
>### Prefetch
>
>```python
>from django.db.models import Prefetch
>
>books = Book.objects.prefetch_related(
>    Prefetch('categories', queryset=Category.objects.filter(is_active=True))
>).all()
>
>for book in books:
>    active_categories = book.categories.all()
>    print(f"{book.title}: {[c.name for c in active_categories]}")
>```
>
>### to_attr로 별도 속성에 저장
>
>```python
>books = Book.objects.prefetch_related(
>    Prefetch(
>        'categories',
>        queryset=Category.objects.filter(is_active=True),
>        to_attr='active_categories'
>    )
>).all()
>
>for book in books:
>    print(f"{book.title}: {[c.name for c in book.active_categories]}")
>```
>
>### 복잡한 조건의 Prefetch
>
>```python
>from django.db.models import Q
>
># 복잡한 조건과 정렬 적용
>books = Book.objects.prefetch_related(
>    Prefetch(
>        'categories',
>        queryset=Category.objects.filter(
>            Q(is_active=True) & Q(created_date__gte='2023-01-01')
>        ).order_by('name'),
>        to_attr='recent_active_categories'
>    )
>).all()
>```

---

## **only() & defer()**

> 큰 텍스트 필드나 불필요한 필드를 제외하여 네트워크 트래픽과 메모리 사용량 최적화 가능
> 
> ### only() - 특정 필드만 가져오기
> 
> ```python
> books = Book.objects.select_related('author').only('title', 'author__name')
> 
> for book in books:
>     print(f"{book.title} by {book.author.name}")
>     # 다른 필드에 접근하면 추가 쿼리 발생
> ```
> 
> ### defer() - 특정 필드 제외하고 가져오기
> 
> ```python
> # 큰 텍스트 필드는 제외하고 가져오기
> books = Book.objects.defer('content', 'description')
> 
> for book in books:
>     print(book.title)  # 추가 쿼리 없음
>     # print(book.content)  # 쿼리 발생
> ```
> 
> ### 실행되는 SQL
> 
> ```python
> books = Book.objects.select_related('author').only('title', 'author__name')
> ```
> 
> ```sql
> -- only()로 지정한 필드만 SELECT
> SELECT book.title, author.name
> FROM book 
> INNER JOIN author ON book.author_id = author.id;
> ```

---

## **Lazy Loading**

> Django ORM은 지연 로딩(Lazy Loading) 사용 (실제로 데이터가 필요한 시점에서 쿼리가 실행)
> 
> ### 지연 로딩 동작 방식
> 
> ```python
> # 이 시점에서는 쿼리가 실행되지 않음
> books = Book.objects.all()
> filtered_books = books.filter(title__icontains='python')
> sorted_books = filtered_books.order_by('title')
> 
> # 실제로 데이터가 필요한 시점에서 쿼리 실행
> for book in sorted_books:  # 이 시점에서 쿼리 실행!
>     print(book.title)
> ```
> 
> ### 즉시 실행 방법들
> 
> ```python
> # 방법 1: list() 사용
> books = list(Book.objects.all())
> 
> # 방법 2: len() 사용
> count = len(Book.objects.all())
> 
> # 방법 3: 슬라이싱
> first_10 = Book.objects.all()[:10]
> 
> # 방법 4: bool() 사용
> has_books = bool(Book.objects.all())
> ```

