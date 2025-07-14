---
title: "멀티셀러 환경의 분산 결제와 금액 분배는 어떻게...???"
date: 2025-03-02
categories: [architecture]
tags: [architecture, python, django]
---

## **문제 상황 & 설계 도전**
> 멀티셀러 이커머스에서 고객이 하나의 주문으로 여러 판매자의 상품을 구매할 때, 포인트와 리워드 같은 할인 혜택을 어떻게 분배할 것인가는 복잡한 수학적, 비즈니스적 문제다.

### 구체적 문제 상황:
```
고객이 A 판매자 상품 30,000원, B 판매자 상품 20,000원을 주문하고, 쿠폰으로 5,000원 할인받은 후 포인트
  10,000원을 사용한다면:
  - 전체 실결제액: 45,000원 (50,000 - 5,000)
  - 포인트 10,000원을 A, B 판매자에게 어떤 비율로 분배할 것인가?
  - 소수점 계산 오차는 어떻게 처리할 것인가?
  - 각 판매자의 정산은 어떻게 정확하게 계산할 것인가?
```

### 직면한 기술적 도전:
> 1. **수학적 정확성**: 분배 후 총합이 입력값과 정확히 일치해야 함
> 2. **공정성**: 각 상품의 실결제금액에 비례한 공정한 분배
> 3. **소수점 처리**: Decimal 계산에서 발생하는 오차 보정
> 4. **음수 방지**: 할인 혜택이 상품 가격을 초과하지 않도록 제어

---

## **해결 방안 탐색 과정**
### 1. 분배 알고리즘 설계
> #### **비례 분배 방식 선택**:
> - `분배액 = 총 사용액 × (상품 실결제액 / 전체 주문 실결제액)`    
> - 여러 분배 방식 중 비례 분배를 선택한 이유는 **고객도 이해하기 쉽고, 판매자도 납득할 수 있는 가장 직관적이고 공정**하다고 생각했다.
>
> #### **실결제액 기준 분배**:
> - 판매가가 아닌 실결제액(쿠폰 할인 후 금액)을 분배 기준으로 사용
> - 이미 할인받은 상품에 추가 할인 혜택을 과도하게 집중시키지 않기 위함이다.
> 
> #### **실결제액 기준 분배의 구체적 예시**
> ```
>   주문 상황:
>   - A상품: 판매가 30,000원, 쿠폰할인 5,000원 → 실결제액 25,000원
>   - B상품: 판매가 20,000원, 쿠폰할인 0원 → 실결제액 20,000원
>   - 고객이 포인트 9,000원 사용
> 
>   판매가 기준 분배 시:
>   - A상품 포인트 = 9,000 × (30,000 / 50,000) = 5,400원
>   - B상품 포인트 = 9,000 × (20,000 / 50,000) = 3,600원
> 
>   실결제액 기준 분배 시:
>   - A상품 포인트 = 9,000 × (25,000 / 45,000) = 5,000원
>   - B상품 포인트 = 9,000 × (20,000 / 45,000) = 4,000원
> ```
> 
> #### **왜 실결제액 기준이 더 공정한가?**
> ```
>   판매가 기준의 문제:
>   - A상품은 이미 5,000원 쿠폰할인을 받았음
>   - 그런데 포인트도 더 많이 받으면 이중 혜택
>   - B상품 구매자는 상대적으로 불공정함을 느낄 수 있음
> 
>   실결제액 기준의 장점:
>   - A상품이 이미 할인받은 부분을 고려하여 포인트 분배
>   - 실제로 지불하는 금액에 비례한 공정한 분배
>   - 고객이 납득할 수 있는 직관적인 로직
> ```

### 2. 소수점 처리 전략
> #### **`ROUND_FLOOR`** 방식 선택:
> ```python
> benefit_amount = (total_benefit * ratio).quantize(Decimal("0"), rounding=ROUND_FLOOR)
> ```
> 
> #### 선택 이유:
> - **고객 친화적**: 시스템이 고객에게 유리하도록 처리
> - **보수적 접근**: 과도한 할인 방지로 시스템 안정성 확보
> - **일관성**: 모든 할인 계산에서 동일한 반올림 정책 적용

### 3. 오차 보정 알고리즘
> #### 오차 할당 전략:
> 소수점 계산으로 인해 분배된 금액의 총합이 입력값과 다를 수 있다. 이를 해결하기 위한 오차 보정 로직을 설계했다.
> 
> ```python
>   # 실결제금액 큰 순서로 정렬
> def apply_error_correction(products, remaining_difference):
>     # 큰 금액 상품부터 우선 순위로 정렬
>     sorted_products = sort_by_actual_amount(products, descending=True)
>     
>     for product in sorted_products:
>         if remaining_difference <= 0:
>             break
>             
>         # 안전한 범위 내에서 오차 조정
>         safe_adjustment = calculate_safe_adjustment_range(product)
>         actual_adjustment = min(remaining_difference, safe_adjustment)
>         
>         # 조정 적용 및 차감
>         apply_adjustment(product, actual_adjustment)
>         remaining_difference -= actual_adjustment
> ```
>
>
> #### 핵심 설계 원칙:
> 1. **실결제금액이 큰 상품부터 우선**: 공정성과 일관성 확보
> 2. **실결제금액 한도 내에서만**: 음수 결제금액 방지
> 3. *순차적 할당*: 계산 과정의 명확성과 재현성

---

## **최종 구현과 핵심 로직**
### 분산 결제 처리 클래스 설계
> ```python
> class DistributedPaymentCalculator:
>     def __init__(self, total_point: Decimal, total_reward: Decimal):
>         self.total_point = total_point
>         self.total_reward = total_reward
>     
>     def _distribute_point(self, product_price: Decimal, order_price: Decimal) -> Decimal:
>         if order_price == 0:
>             return Decimal("0")
>         ratio = calculate_distribution_ratio(product_price, order_price)
>         return apply_floor_rounding(self.total_point * ratio)
> ```
> #### 설계 특징:
> - 서로 다른 할인 타입을 별도로 관리하여 독립적 정책 적용
> - 비율 계산과 분배 로직을 명확히 분리
> - Decimal 타입으로 정확한 금융 계산 수행

### 3단계 멀티셀러 분배 프로세스
```python
def update_order_data(self, total_sale_price, total_coupon_discount_price, order_data):
    order_price = total_sale_price - total_coupon_discount_price
    
    # 1단계: 비례 분배
    distributed_totals = self._perform_proportional_distribution(order_data, order_price)
    
    # 2단계: 오차 보정
    self._apply_error_correction(order_data, distributed_totals)
    
    # 3단계: 최종 집계
    self._finalize_and_aggregate(order_data)
    
    return order_data
```

> #### 1단계: 비례 분배 로직
>> ```python
>> # 1단계: 각 상품별 기본 분배
>> for seller_data in order_data:
>>     for product in seller_data["product_orders"]:
>>         # 상품의 실제 판매가 (쿠폰 할인 적용)
>>         product_price = calculate_actual_product_price(product)
>>         
>>         # 전체 주문 대비 비율로 분배
>>         temp_point = self._distribute_point(product_price, order_price)
>>         temp_reward = self._distribute_reward(product_price, order_price)
>>         
>>         store_temporary_benefits(product, temp_point, temp_reward)
>>         accumulate_distributed_totals(temp_point, temp_reward)
>> ```
>> ##### 멀티셀러 처리 특징:
>> - **상품별 분배**: 판매자별로 분배하지 않고 상품별로 분배 후 판매자별 집계
>> - **전체 주문 기준**: 모든 판매자의 상품을 하나의 결제 단위로 취급
>> - **일관성 확보**: 동일한 분배 기준 적용으로 공정성 보장
>
> #### 2단계: 오차 보정 메커니즘
>> ```python
>> # 2단계: 오차 보정
>> point_difference = self.total_point - distributed_point
>> reward_difference = self.total_reward - distributed_reward
>> 
>> if has_correction_needed(point_difference, reward_difference):
>>     all_products = extract_all_products(order_data)
>>     sorted_products = sort_by_actual_amount(all_products, descending=True)
>>     
>>     # 각 상품에 대해 포인트 → 리워드 순차 보정
>>     for product in sorted_products:
>>         current_actual_price = calculate_current_actual_price(product)
>>         
>>         # 포인트 오차 분배
>>         if point_difference > 0:
>>             point_adjustment = calculate_safe_point_adjustment(product, point_difference)
>>             apply_point_adjustment(product, point_adjustment)
>>             point_difference -= point_adjustment
>>             current_actual_price -= point_adjustment
>>         
>>         # 리워드 오차 분배 (포인트 보정 후 진행)
>>         if reward_difference > 0:
>>             reward_adjustment = calculate_safe_reward_adjustment(product, reward_difference)
>>             apply_reward_adjustment(product, reward_adjustment)
>>             reward_difference -= reward_adjustment
>> ```
>> ##### 오차 보정의 핵심:
>> - **음수 방지**: 실결제금액을 초과하지 않는 안전장치 제공 (`max(Decimal("0"), price)`)
>> - **순서 일관성**: 항상 동일한 순서로 오차 할당하여 재현 가능한 결과
>> - **순차 처리**: 포인트 보정 후 리워드 보정하여 상호 영향 고려
>
> #### 3단계: 판매자별 집계
>> ```python
>> # 3단계: 최종 값 설정 및 판매자별 집계
>> for seller_data in order_data:
>>     initialize_seller_totals(seller_data)
>>     
>>     for product in seller_data["product_orders"]:
>>         # 임시 값을 최종 값으로 설정
>>         finalize_product_benefits(product)
>>         calculate_final_product_amount(product)
>>         
>>         # 판매자별 합계 누적
>>         accumulate_seller_totals(seller_data, product)
>>         
>>         # 임시 필드 정리
>>         cleanup_temporary_fields(product)
>> ```
>> ##### 집계 로직의 장점:
>> - **명확한 분리**: 상품별 분배와 판매자별 정산을 단계적으로 처리
>> - **검증 가능**: 각 단계별로 결과 확인 가능한 구조
>> - **연동 용이**: 정산 시스템과의 데이터 연동 최적화

---

## **설계 결과 & 효과**
### 1. 비즈니스 가치
> #### 정산 시스템 연동:
> - 각 판매자별로 정확한 실결제금액 제공
> - 수수료 계산의 기준 데이터 제공
> - 정산 시스템과의 정확한 연동
> 
> #### 고객 신뢰도 향상:
> - 투명하고 공정한 할인 혜택 분배
> - 예측 가능한 결제 금액 계산
> - 문의 시 명확한 계산 근거 제시

### 2. 기술적 성과
> #### 수학적 정확성:
> - 소수점 오차 문제 완전 해결
> - 입력값과 출력값의 정확한 일치 보장
> - 재현 가능한 계산 결과
> 
> #### 시스템 안정성:
> - 음수 결제금액 발생 방지
> - 예외 상황에서도 안정적인 동작
> - 확장 가능한 분배 로직 구조
