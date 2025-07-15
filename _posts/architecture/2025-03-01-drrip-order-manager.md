---
title: "복잡한 멀티셀러 주문 검증 엔진 설계를 고민해보다..."
date: 2025-03-01
categories: [architecture]
tags: [architecture, python, django]
---

## **문제 상황 & 고민했던 지점**
> 멀티셀러 이커머스 플랫폼에서 주문 처리는 단순한 상품 주문을 넘어선 복잡한 비즈니스 로직의 집합체이다.  
> 특히 주문 시스템은 이커머스 플랫폼의 **가장 핵심적인 기능**이면서도 동시에 **가장 위험도가 높은 영역**이라고 생각한다.

### 주문 시스템이 갖는 특수성
> - `무결성의 절대성`: 단 하나의 계산 오류나 데이터 불일치도 직접적인 매출 손실과 고객 신뢰도 하락으로 이어진다  
> - `비지니스 정책의 변동성`: 마케팅 전략에 따른 쿠폰 정책 변경, 포인트 적립률 조정, 새로운 할인 혜택 도입  
> - `확장성의 필요성`: 새로운 결제 수단, 배송 정책, 판매자 정책 등의 지속적인 추가  
> - `실시간 처리의 중요성`: 높은 트래픽 상황에서도 안정적이고 빠른 응답을 보장해야한다.  
>  
> 이러한 특성 때문에 주문 시스템은 **변경에 유연하면서도 안정성을 보장하는 아키텍처**가 반드시 필요하다고 생각한다.

### 직면한 핵심 문제들
> - `멀티셀러 환경의 복잡성`: 하나의 주문에 여러 판매자의 상품이 섞여있고, 각 판매자마다 다른 배송정책과 쿠폰적용 규칙을 갖는다.
> - `동시성 이슈`: 여러 사용자가 동시에 같은 상품을 주문할 때 재고 관리의 `race condition` 문제
> - `복합 결제 수단`: 상품 할인, 쿠폰 할인, 포인트 사용, 리워드 사용이 복합적으로 적용되는 결제 구조
> - `데이터 무결성`: 클라이언트에서 계산된 금액과 서버에서 재계산한 금액의 일치성 보장

### 기존 접근 방식의 한계
> 가장 먼저 고민했던 것은 **어디서 검증 로직을 처리할 것인가**였다. 가장 직관적인 방법은 뷰(View) 레벨에서 모든 검증 로직을 처리하는 것이었지만, 이 방식은 명백한 한계가 예상되었다.
> 
> #### 뷰 레벨에서 검증 로직을 처리할 때 예상되는 문제들
> - 비즈니스 로직 변경 시 영향 범위 파악 불가
> - 코드 재사용성 부족
> - 디버깅과 유지보수의 복잡성
>
> #### 설계 패턴 검토의 필요성
> 이러한 문제들을 미연에 방지하고, 복잡한 주문 처리 로직을 **체계적이고 유지보수 가능한 방식**으로 구현하기 위해 다양한 설계 패턴을 검토하게 되었다. 단순히 코드를 분리하는 것을 넘어서, 비즈니스 로직의 복잡성을 효과적으로 관리할 수 있는 아키텍처가 필요했다.

---

## **해결 방안 탐색 과정**
### 1. 설계 패턴 검토
#### Business Logic 캡슐화:
> 주문 검증이라는 특정 도메인의 비즈니스 로직과 관련 상태(검증된 금액, 사용된 쿠폰 등)를 하나의 객체에서 관리하는 구조가 필요했고, **Domain Service(Domain-Driven Design) 개념을 기반으로 내부에 pipeline 구조 적용**을 통해 주문 검증 로직을 하나의 클래스로 캡슐화하여 관리하기로 결정했다.

#### 다른 패턴들과의 비교:
 > - Strategy 패턴: 쿠폰 타입별, 결제 수단별 다른 로직 처리에 적합하지만, 전체 주문 프로세스 관리에는 부족
 > - Command 패턴: 주문 생성을 하나의 명령으로 캡슐화할 수 있지만, 복잡한 검증 단계를 표현하기 어려움
 > - Pipeline 패턴: 검증 단계를 순차적으로 처리하는데 적합하지만, 데이터 공유와 상태 관리가 복잡

### 2. 데이터 구조 설계
#### 검증 상태 관리:
> - 각 검증 단계에서 계산된 금액을 누적하면서, 최종 단계에서 비교하는 구조로 설계
> ```python
> self.validated_totals = {
>       "original_price": Decimal("0"),
>       "sale_price": Decimal("0"),
>       "coupon_discount_price": Decimal("0"),
>       "shipment_fee": Decimal("0"),
>       "used_point": Decimal("0"),
>       "used_reward": Decimal("0"),
>       "actual_price": Decimal("0"),
>   }
> ```

#### 중복 방지:
> - Set 자료구조(O(1))로 중복 검사 수행

#### 주문 생성 데이터 구조화:
> - 검증된 주문정보를 따로 관리하여 검증 완료 후 주문 생성 로직에서 재계산없이 바로 사용

### 3. 동시성 문제 해결
#### 임시 재고 예약 시스템:
> 이커머스에서 주문 프로세스는 **주문 시작 → 결제 처리 → 주문 완료**까지 여러 단계를 거치며, 각 단계마다 네트워크 지연이나 사용자의 중단 가능성 등이 존재한다. 이 과정에서 단순한 재고 확인만으로는 동시성 문제를 해결할 수 없을 것이라 예상했다.

##### 기존 방식의 한계:
```python
# 문제가 있는 방식
if product.stock >= order_quantity:
    # 주문 처리 (결제까지 시간 소요)
    # 이 시간 동안 다른 사용자가 같은 재고를 선점할 수 있음
```

##### 임시 재고 예약 방식:
```python
# 개선된 방식
available_stock = product.stock - product.temp_reserved_stock
if order_quantity > available_stock:
    raise CustomValidationError("insufficient_stock_available")

# 주문 검증 통과 시 임시 재고 차감
product.temp_reserved_stock += order_quantity
```

##### 임시 재고 예약 시스템의 핵심 메커니즘:
> 1. **주문 시작 시점**: `temp_reserved_stock` 관리로 해당 재고를 임시 예약
> 2. **주문 완료 시점**: 실제 재고(`stock`) 차감 후 `temp_reserved_stock` 차감으로 정리
> 3. **주문 취소/실패 시점**: `temp_reserved_stock만` 차감하여 재고 원복

---

## **최종 설계 결과 & 구현**
### 1. 검증 파이프라인 구조
#### 파이프라인 단계별 책임 분리:
> 각 단계는 명확한 **단일 책임**을 가지며, 이전 단계의 검증 결과를 바탕으로 다음 검증을 수행
> ```python
>   def validate_purchase_order(self, order_info: Dict[str, Any]):
>       # 1단계: 입점사별 상품 검증
>       self._validate_purchase_order_by_seller(...)
>       # 2단계: 전체 금액 검증  
>       self._validate_total_amounts(...)
>       # 3단계: 포인트/리워드 검증
>       self._validate_point_and_reward_usage(...)
> 
>       return self.validated_totals, self.validated_order_data_to_create
> ```

### 2. 멀티셀러 처리 로직
#### 설계 핵심:
> - 각 판매자별로 독립적인 검증과 금액 계산 수행  
> - 판매자별 결과를 전체 총액에 누적하는 방식으로 멀티셀러 환경 처리  
> - 각 판매자의 배송 정책을 독립적으로 적용
> 
> ```python
>   def _validate_purchase_order_by_seller(self, order_info_by_seller, shipping_info):
>       for seller_order in order_info_by_seller:
>           # 판매자별 금액 초기화
>           total_original_price_by_seller = Decimal("0")
>           total_sale_price_by_seller = Decimal("0")
>           total_coupon_discount_price_by_seller = Decimal("0")
> 
>           # 상품별 검증 수행
>           for product_order_data in seller_order["order_info_by_product"]:
>               # 각 상품에 대한 검증 및 금액 누적
> 
>           # 판매자별 배송비 계산
>           shipment_fee = self._calculate_shipment_fee(...)
> 
>           # 전체 총액에 누적
>           self.validated_totals["sale_price"] += total_sale_price_by_seller
>           self.validated_totals["shipment_fee"] += shipment_fee
> ```

### 3. 재고 검증과 동시성 처리
#### 핵심 특징:
> - 실제 재고에서 임시 예약 재고를 차감한 `available_stock` 개념 도입
> - 옵션 상품과 일반 상품의 재고 관리 로직 통합
> 
> ```python
>   def _validate_product_and_stock(self, ...):
>       # 옵션 상품과 일반 상품 구분 처리
>       if product_option_id:
>           ...
>           available_stock = ...
>       else:
>           available_stock = ...
> ```

### 4. 쿠폰 시스템의 검증 로직
#### 다층 검증 구조:
> `중복 사용 방지` → `쿠폰 존재 및 활성화` → `최소 구매 금액` → `적용 대상` → `할인 금액 계산` → `금액일치성`
>
> ```python
>   def _validate_and_calculate_coupon_discount(self, ...):
>       ...
> 
>       # 중복 사용 검증
>       if coupon_publish_id in self.used_coupons:
>           ...
> 
>       # 최소 구매 금액 검증
>       if calculated_sale_price < coupon.min_purchase_amount:
>           ...
> 
>       # 적용 대상 검증
>       if not self._is_coupon_applicable_to_product(coupon, product):
>           ...
> 
>       # 할인 금액 계산 및 검증
>       if actual_discount_amount != Decimal(str(...)):
>           ...
> 
> ```

---

## **설계 결과 & 운영 효과**
### 1. 보안과 데이터 무결성
> - 모든 금액 계산과 할인 적용을 서버에서 재검증하여 클라이언트 조작 방지
> - 쿠폰 적용 조건, 재고 상태, 포인트 잔액 등 모든 비즈니스 룰을 서버에서 확인
> - 클라이언트에서 전달된 값과 서버 계산 값의 정확한 일치성 검증
> - PG 결제 모듈 호출 이전 완전한 사전 검증으로 불필요한 결제 요청 방지
> 
> #### PG 사전 검증의 필요성:
> 실제 국내 유명 플랫폼을 대상으로 결제 프로세스를 테스트한 결과, 클라이언트 조작을 통한 주문에서 다음과 같은 문제점을 발견했다:
> - **문제상황**: 클라이언트에서 조작된 금액으로 주문 진행
> - **결과**: PG 결제 요청은 생성되었으나, 최종 검증 단계에서 실패로 결제 미완료
> - **부작용**: 불필요한 PG 요청 건 생성 및 시스템 리소스 낭비
>
> 이러한 사례를 바탕으로 **PG 호출 이전 단계에서 엄격한 검증**이 될 수 있도록 구조를 설계하여, 검증이 완료된 주문만 결제 모듈로 전달되도록 구현했다.

### 2. 복잡성 vs 유지보수성
> #### 복잡성 증가 요인:
> - 멀티셀러 환경에서 각 판매자별 독립적 처리 로직
> - 다양한 쿠폰 타입과 적용 조건들
> - 복합 결제 수단 간의 상호작용
> 
> #### 유지보수성 확보 방법:
> - 각 검증 단계를 별도 메서드로 분리
> - 명확한 에러 코드와 에러 메시지 체계
> - 검증 결과를 구조화된 데이터로 반환

### 3. 학습한 설계 원칙들
> #### 단일 책임 원칙 (SRP):
> - 각 메서드가 하나의 검증 책임만 가지도록 설계
>
> #### 개방-폐쇄 원칙 (OCP):
> - 새로운 쿠폰 타입이나 결제 수단 추가 시 기존 로직은 유지하고 새로운 조건만 추가하는 구조로 설계
>
> #### 관심사의 분리 (Separation of Concerns):
> - 주문 검증 과정을 명확한 단계로 분리  
> - `판매자별 검증` → `전체 금액 검증` → `포인트/리워드` 검증으로 각 단계가 독립적으로 처리
> - 각 단계의 결과가 다음 단계로 전달되는 파이프라인 구조를 구현

### 4. 개인적으로 느낀 효과
> #### 개발 생산성 향상:
> - 주문 검증 로직 변경 시 해당 메서드만 수정
> - 새로운 비즈니스 요구사항 반영 시간 단축
>
> #### 시스템 안정성 향상:
> - 클라이언트 조작으로 인한 주문 오류 완전 차단
> - 동시 주문 상황에서의 재고 오버셀링 방지
> - 복잡한 할인 정책 적용 시에도 정확한 금액 계산

