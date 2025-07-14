---
title: "동시성을 고려한 재고 관리 시스템 - 설계 선택의 고민과 이유"
date: 2025-03-08
categories: [architecture]
tags: [architecture, python, django, concurrency]
---

## **고민했던 지점**
> 단순히 **`재고가 있으면 팔고, 없으면 안 팔면 된다`**가 아니라, 실서비스에서는 다양한 예외 상황들이 발생할 것으로 예상했다.
> 
> ### 예상한 주요 문제 시나리오들
> 
> 1. **높은 동시성 상황에서의 오버셀링**
> - 플래시 세일이나 인기 상품 한정 판매 시 수백 명이 동시에 주문
> - 마지막 재고 1개를 여러 명이 동시에 주문하려 할 때 어떻게 처리할 것인가?
> - 단순한 재고 확인 로직으로는 race condition 발생이 불가피할 것 같았다
> 
> 2. **긴 주문 프로세스로 인한 재고 점유 문제**
> - 장바구니 담기 → 주문서 작성 → 결제 진행까지 길면 10분까지도 소요
> - 이 시간 동안 재고를 어떻게 관리할 것인가?
> - 너무 보수적으로 하면 판매 기회 손실, 너무 느슨하게 하면 오버셀링 위험
> 
> 3. **옵션 상품의 복잡한 재고 관리**
> - 다양한 옵션 종류 (사이즈, 색상, etc.)
> - 같은 의류 상품이라도 옵션별로 각각 다른 재고 수량
> - 한 색상/사이즈가 품절되어도 다른 사이즈는 계속 판매 가능해야 함
> - 사이즈별 독립적인 재고 관리가 필수적일 것으로 판단
> 
> 4. **결제 실패 시 재고 원복의 복잡성**
> - 결제 단계에서 실패하거나 사용자가 중도 포기하는 경우
> - 이미 차감된 재고를 어떻게 안전하게 원복할 것인가?
> - 복잡한 원복 로직은 또 다른 버그의 원인이 될 수 있을 것 같았다

---

## **해결 방안 검토: 여러 옵션 중 최선의 선택**
### 1단계: 동시성 제어 방식 비교
> #### **Option A: Database Lock (`select_for_update`) (선택 X)**
> 
> ```python
> # Database Lock 방식
> with transaction.atomic():
>     product = Product.objects.select_for_update().get(id=product_id)
>     if product.stock >= order_quantity:
>         product.stock -= order_quantity
>         product.save()
>         # 주문 생성
>     else:
>         raise InsufficientStockError()
> ```
> 
>> **예상 장점:**
>> - 가장 확실한 동시성 제어 방법
>> - 구현이 직관적이고 이해하기 쉬움
>> - Django ORM에서 간단히 적용 가능
>> 
>> **예상 단점:**
>> - 높은 동시성 환경에서 심각한 성능 저하 우려
>> - 락 대기 시간으로 인한 사용자 경험 악화
>> - 데드락 발생 가능성
>> 
>> **예상 결과:**
>> - 플래시 세일처럼 순간적으로 트래픽이 몰리는 상황에서는 락 경합으로 인해 응답 시간이 급격히 느려질 것으로 예상
>> - 서비스의 목표 동시 사용자 수를 고려하면 현실적이지 않다고 판단  
>
> #### **Option B: Optimistic Lock (선택 X)**
> 
> ```python
> # Optimistic Lock 방식
> def update_stock_with_optimistic_lock(product_id, order_quantity):
>     product = Product.objects.get(id=product_id)
>     original_stock = product.stock
>     
>     if original_stock < order_quantity:
>         raise InsufficientStockError()
>     
>     updated_rows = Product.objects.filter(
>         id=product_id, 
>         stock=original_stock
>     ).update(stock=original_stock - order_quantity)
>     
>     if updated_rows == 0:
>         raise StockConflictError("다시 시도해주세요")
> ```
> 
>> **예상 장점:**
>> - 락 없이도 동시성 제어 가능
>> - 일반적인 상황에서는 성능 우수
>> - 충돌의 가능성이 적은 케이스에 대해서는 매우 효율적일 것이라고 예상한다.
>> 
>> **예상 단점:**
>> - 인기 상품일수록 충돌 확률 증가
>> - 사용자 경험 측면에서 부정적
>> 
>> **예상 결과:**
>> - Optimistic Lock을 선택하지 않은 가장 큰 이유는 사용자에게 부정적인 경험을 하게하고 싶지 않았다.  
>> - 특히 한정 상품이나 세일 상품에서 이런 상황이 자주 발생한다면 고객 불만으로 이어질 것으로 예상했다.  
>
> #### **Option C: 2단계 재고 관리 (최종 선택)**
> 
> ```python
> # 2단계 재고 관리 방식
> def check_stock_availability(product_id, order_quantity):
>     product = Product.objects.get(id=product_id)
>     available_stock = product.stock - product.temp_reserved_stock
>     
>     if order_quantity > available_stock:
>         raise InsufficientStockError()
>     
>     return available_stock
> 
> def reserve_stock(product_id, order_quantity):
>     # F() 표현식으로 원자적 업데이트
>     Product.objects.filter(id=product_id).update(
>         temp_reserved_stock=F('temp_reserved_stock') + order_quantity
>     )
> 
> def confirm_stock(product_id, order_quantity):
>     # 결제 완료 시 실제 재고 차감
>     Product.objects.filter(id=product_id).update(
>         stock=F('stock') - order_quantity,
>         temp_reserved_stock=F('temp_reserved_stock') - order_quantity
>     )
> ```
> 
>> **핵심 아이디어:**
>> - 실제 재고(`stock`)와 임시 예약 재고(`temp_reserved_stock`)를 분리 관리
>> - 주문 생성 시점에 임시로 재고를 "예약"
>> - 결제 완료 시점에 실제 재고에서 차감
>> 
>> **선택 이유:**
>> - 락 없이도 오버셀링 방지 가능
>> - 사용자 경험이 자연스러움 (주문 생성 시점에 재고 확보)
>> - 결제 실패 시 원복이 간단함
>> - 높은 동시성 환경에서도 성능 확보 가능
>
> #### **Option D: 큐 기반 처리 (검토했지만 포기)**
> 기능적으로 가장 완벽하게 구현할 수 있을 것이라 생각했고, 아직도 큐 기반 처리하는 것이 가장 정답이라 생각한다.
> 
> **이 방식이 가장 모범적인 이유:**
> - **완벽한 순서 보장**: FIFO 방식으로 먼저 요청한 고객이 우선권 확보
> - **동시성 문제 근본 해결**: 큐 워커가 하나씩 순차 처리하므로 race condition 원천 차단
> - **시스템 안정성**: 갑작스런 트래픽 증가 시에도 큐 버퍼링으로 시스템 보호
> - **확장성**: 워커 수 조정으로 처리 용량 유연하게 확장 가능
> - **장애 복구**: 실패한 작업 재시도, 데드레터 큐 등 견고한 에러 처리
> 
> **하지만 포기한 현실적인 이유들 (변명):**
> 
> 1. **개발 일정 압박:**
> - 서비스 런칭까지 4개월이라는 타이트한 일정
> - 큐 시스템 구축 및 안정화에만 최소 2주에서 1개월까지도 소요 예상
> 
> 2. **인프라 복잡도 급증:**
> - Redis/RabbitMQ/AWS SQS 등 메시지 브로커 추가 구축 및 운영
> - 장애 시 큐 데이터 복구 및 재처리 로직 구현
> 
> 3. **개발 인력 고려:**
> - 서버 쪽을 1인으로 개발하고 있었기에...
> 
> 4. **비즈니스 우선순위:**
> - 초기 서비스의 핵심은 빠른 런칭과 시장 검증
> - 과도한 엔지니어링보다는 적정 수준의 안정성으로 시작
> - 추후 트래픽 증가 시점에 점진적 개선 계획


### 2단계: 옵션 상품 관리 방식 검토
> #### 옵션별 독립 테이블 관리 (최종 선택)
> 선택의 여지가 없었다. 비즈니스적으로 옵션이 아예 없을 수도, 옵션의 조합이 여러개 있을 수도 있었다.
> 
> **예상 장점:**
> - 각 옵션이 독립적인 재고 정책 적용 가능
> - 한 옵션이 품절되어도 다른 옵션은 영향 없음
> - 비즈니스 요구사항에 정확히 부합
> 
> **예상 단점:**
> - 구현 복잡도 증가
> - 옵션과 일반 상품 분기 처리 필요


### 3단계: 성능 최적화 방안 검토
> #### Bulk Update (최종 선택)
> 이 또한 선택의 여지가 없었다.
> 
> ```python
> # 벌크 업데이트 방식
> updates = []
> for order in product_orders:
>     updates.append(Product(
>         id=order.product_id,
>         temp_reserved_stock=F('temp_reserved_stock') + order.quantity
>     ))
> 
> # 한 번의 쿼리로 모든 상품 업데이트
> Product.objects.bulk_update(updates, ['temp_reserved_stock'])
> ```
> 
> **예상 특징:**
> - 여러 상품을 한 번에 업데이트
> - 쿼리 횟수 대폭 감소
> - 대량 처리 시 성능상 큰 이점




---

## **최종 설계 결정과 구현 전략**

### 2단계 재고 관리 시스템 설계
> 
> **핵심 개념:**
> ```
> 판매_가능_재고 = stock - temp_reserved_stock
> ```
> 
> **주문 프로세스 플로우:**
> 1. **주문 생성**: `temp_reserved_stock` 증가로 재고 임시 예약
> 2. **결제 완료**: `stock` 차감 + `temp_reserved_stock` 차감
> 3. **결제 실패**: `temp_reserved_stock`만 차감하여 원복
> 
> **이 방식의 예상 효과:**
> - 주문 생성 순간에 재고가 확보되어 고객 안심
> - 결제 실패해도 단순한 원복 처리
> - 동시성 문제 해결하면서도 성능 확보

### 자동 만료 처리 (임시예약재고) 시스템 설계
> 
> **예상한 문제:**
> - 결제를 하지 않고 방치하는 사용자들 때문에 재고가 계속 묶여있으면 다른 고객의 구매 기회를 박탈할 수 있다.
> - 극단적으로 PG사의 결제창을 켜놓은 상태에서 20분 후에도 결제완료가 가능하기에 PG사 정책에 맞춰 취소처리 필요
>   - 지금 생각해보니 서비스 기준으로 만료시간을 잡고 승인단계에서 실패처리하도록 했으면...(아쉽...)
> 
> **설계한 해결책:**
> - PG사 정책에 맞춰 30분 후 자동 취소 처리
>   - (PG사 정책에 맞출 필요 없이 서비스에서 정한 만료시간을 기준으로 취소처리하는 것이 나을듯하다.)
>   - (어차피 PG사 승인 단계에서 취소처리하면 되는 것을...)
> - 스케줄러로 만료 주문 체크
> - 만료된 주문의 임시 재고 자동 원복

### F() Expression 활용
>
> **예상한 위험:**
> - 여러 사용자가 동시에 같은 상품을 주문할 때 애플리케이션 레벨에서 재고 계산을 하면 중간에 다른 요청이 끼어들어 계산이 꼬일 수 있다.
> 
> ```python
> # 위험한 방식 (Race Condition 발생 가능)
> product = Product.objects.get(id=product_id)
> product.temp_reserved_stock += order_quantity  # 애플리케이션 레벨 계산
> product.save()
> 
> # 안전한 방식 (DB 레벨 원자적 연산)
> Product.objects.filter(id=product_id).update(
>     temp_reserved_stock=F('temp_reserved_stock') + order_quantity
> )
> ```
> 
> **설계한 해결책:**
> Django의 F() 표현식으로 DB 레벨에서 원자적 연산 수행

---

## **설계 시 고려한 트레이드오프들**

### 복잡성 vs 안정성
> 
> - **복잡성 증가 요인:**
>   - 2단계 재고 관리로 로직 복잡도 상승
>   - 옵션 상품과 일반 상품 분기 처리
>   - 자동 만료 처리 시스템 구축
> 
> - **안정성 확보 기대효과:**
>   - 오버셀링 완전 차단
>   - 높은 동시성 환경에서도 정확한 재고 관리
>   - 시스템 장애 상황에서도 데이터 무결성 보장

### 성능 vs 정확성
> 
> - **성능 고려사항:**
>   - 락 사용 시 처리량 급감 예상
>   - 벌크 연산으로 DB 부하 최소화 필요
>   - 임시 재고 개념으로 실시간 응답 확보
> 
> - **정확성 보장 요구사항:**
>   - 수학적으로 정확한 재고 계산
>   - 동시성 상황에서도 일관된 결과
>   - 예외 상황 대응 메커니즘

---

## **만약 다시 설계한다면?**

### 추가로 고려할 것들
1. **캐시 활용**: Redis 등을 활용한 재고 캐싱으로 조회 성능 향상
2. **A/B 테스트 체계**: 만료 시간 등을 체계적으로 테스트할 수 있는 환경

### 다음 단계로 시도해보고 싶은 것들
1. **큐 기반 재고 처리**: 트래픽 증가 시 메세지 브로커 + Celery 기반으로 전환
2. **분산 락**: Redis를 활용한 더 정교한 동시성 제어 (공부 필요함, 잘 모름)
