// 근무 기간 자동 계산 함수
function calculateWorkDuration() {
  const startDate = new Date('2022-09-01');
  const currentDate = new Date();
  
  const years = currentDate.getFullYear() - startDate.getFullYear();
  const months = currentDate.getMonth() - startDate.getMonth();
  
  let totalMonths = years * 12 + months;
  
  // 현재 날짜가 시작일보다 이전이면 한 달 빼기
  if (currentDate.getDate() < startDate.getDate()) {
    totalMonths--;
  }
  
  const displayYears = Math.floor(totalMonths / 12);
  const displayMonths = totalMonths % 12;
  
  let duration = '';
  if (displayYears > 0) {
    duration += `${displayYears}년 `;
  }
  if (displayMonths > 0) {
    duration += `${displayMonths}개월`;
  }
  
  const durationElement = document.getElementById('work-duration');
  if (durationElement) {
    durationElement.textContent = `(${duration})`;
  }
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', function() {
  calculateWorkDuration();
});