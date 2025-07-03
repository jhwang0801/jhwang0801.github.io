---
title: "TossPayments Python SDK"
tech_stack: ["Python"]
duration: "2025.06 - 2025.06 (2주)"
description: "토스페이먼츠 API를 위한 Python SDK 라이브러리 개발"
github_url: "https://github.com/jhwang0801/tosspayments-python-server-sdk"
pypi_url: "https://pypi.org/project/tosspayments-python-server-sdk/"
docs_url: "https://jhwang0801.github.io/tosspayments-python-server-sdk/"
featured: false
order: 1
---

## 프로젝트 개요

**TossPayments Python Server SDK**는 토스페이먼츠 API를 Python 서버 환경에서 효율적으로 활용할 수 있도록 개발한 **오픈소스 SDK**입니다. 단순한 API 래퍼를 넘어서 **간단하지만 유용한 비즈니스 로직이 내장된 객체**와 **개발자 친화적 인터페이스**를 제공합니다.

## 🎯 핵심 성과 요약

> ✅ **PyPI 패키지 배포**  
> ✅ **타입 안전성** 및 IDE 자동완성 지원  
> ✅ **비즈니스 로직 추상화**로 복잡한 결제 로직 단순화  
> ✅ **포괄적 테스트 커버리지**

---

## 핵심 기술 성과

### 🏗️ SDK 아키텍처 설계

**개요**: 기존 토스페이먼츠 API는 Raw JSON 응답으로 복잡한 비즈니스 로직 구현 필요

**혁신적 해결**: 계층화된 클린 아키텍처 설계
```
├── Client Layer      # 통합 인터페이스 및 설정 관리
├── Resource Layer    # API 엔드포인트별 전문 처리
├── Model Layer       # 비즈니스 로직 내장 데이터 모델
└── Infrastructure    # HTTP 클라이언트, 인증, 유틸리티
```

**기술적 성과**:
- **Resource Pattern**: 결제/웹훅 도메인별 독립적 관리
- **Factory Pattern**: 웹훅 이벤트 타입별 동적 객체 생성
- **Strategy Pattern**: 카드/가상계좌 등 결제수단별 다형성 처리

---

### 💡 비즈니스 로직 추상화

**핵심 가치**: Raw API 데이터를 **비즈니스 친화적 메서드**로 변환

#### **Before: 복잡한 Raw API 처리**

```python
# ❌ 기존 방식 - 복잡하고 오류 발생 가능
if response["status"] == "DONE" and response["balanceAmount"] > 0:
    cancelable = response["totalAmount"] - (response["totalAmount"] - response["balanceAmount"])
    if cancelable >= refund_amount:
        # 복잡한 취소 로직...
```

#### **After: 직관적인 SDK 인터페이스**
```python
# ✅ SDK 방식 - 간단하고 직관적
if payment.is_paid() and payment.can_be_canceled():
    max_refund = payment.get_cancelable_amount()
    if max_refund >= refund_amount:
        process_refund(payment, refund_amount)
```

#### 구현된 비즈니스 메서드:
- `payment.is_paid()` - 문자열 비교 대신 지능적 상태 확인
- `payment.can_be_canceled()` - 취소 가능 여부 자동 검증
- `payment.get_cancelable_amount()` - 환불 가능 금액 계산
- `webhook_event.is_payment_completed()` - 스마트 웹훅 이벤트 처리

---
### 🔒 안정성 구현

#### 고급 HTTP 클라이언트
```python
# 지수 백오프 재시도 전략
retry_strategy = Retry(
    total=self.config.max_retries,
    backoff_factor=self.config.backoff_factor,
    status_forcelist=[500, 502, 503, 504],
)
```

#### 계층적 예외 처리 시스템

- 기본 예외: `TossPaymentsError`를 상속한 체계적 예외 구조
- 특화 예외: `PaymentNotFoundError`, `InsufficientAmountError` 등 상황별 예외
- 컨텍스트 보존: 에러 코드, HTTP 상태, 응답 데이터 포함

#### 환경별 자동 감지
```python
# API 키 프리픽스 기반 자동 환경 감지
client = Client(secret_key="test_sk_...")  # 테스트 환경 자동 감지
client = Client(secret_key="live_sk_...")  # 라이브 환경 자동 감지
```

---
### ⚡ 타입 안전성 구현

#### 포괄적 타입 힌팅
```python
# 전체 코드베이스 타입 안전성 확보
@dataclass
class Payment(BaseModel):
    payment_key: str
    order_id: str
    total_amount: int
    card: Optional[Card] = None
    virtual_account: Optional[VirtualAccount] = None

    def get_cancelable_amount(self) -> int:
        """환불 가능 금액 계산"""
        return self.total_amount - self.get_canceled_amount()
```

#### IDE 자동완성 지원
```python
# 전체 IDE 자동완성 및 타입 검증
if payment.card:
    issuer = payment.card.issuer_code          # String
    installments = payment.card.installment_plan_months  # Optional[int]
elif payment.virtual_account:
    bank = payment.virtual_account.bank_code   # String  
    due_date = payment.virtual_account.due_date # datetime
```

---
### 🧪 테스트 주도 개발

- 3개 테스트 파일: `Client`, `Payments`, `Webhooks` 완전 커버리지
- Mock 기반 테스트: 외부 의존성 격리로 안정적 테스트
- Fixture 활용: 재사용 가능한 테스트 데이터 관리

---

## 개발자 경험(DX)을 위한 노력

### 📚 문서화 자료 제공

#### MkDocs 기반 문서 사이트
- `API 레퍼런스`: 상세 API 문서
- `실용 가이드`: 시나리오별 가이드

#### 실용적 예제 중심
```python
def handle_payment_result(payment):
    """실제 비즈니스 로직 예제"""
    if payment.is_paid():
        send_confirmation_email(payment.order_id)
        update_inventory(payment)
        process_delivery(payment)

    elif payment.can_be_canceled():
        max_refund = payment.get_cancelable_amount()
        enable_refund_button(max_amount=max_refund)
```






