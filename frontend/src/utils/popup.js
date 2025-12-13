/**
 * 품목 관리 팝업을 여는 유틸리티 함수
 * - 화면 중앙에 팝업을 띄웁니다.
 * - 이미 열려있다면 포커스만 이동합니다(브라우저 정책에 따라 다름).
 */
export const openProductPopup = () => {
    const popupWidth = 1200;
    const popupHeight = 800;

    // 듀얼 모니터 등을 고려한 중앙 정렬 계산
    const windowLeft = window.screenLeft || window.screenX;
    const windowTop = window.screenTop || window.screenY;
    const screenWidth = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const screenHeight = window.innerHeight || document.documentElement.clientHeight || screen.height;

    const left = windowLeft + (screenWidth - popupWidth) / 2;
    const top = windowTop + (screenHeight - popupHeight) / 2;

    const popupName = 'ProductManagementPopup';
    const features = `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no`;

    const popup = window.open('/popup/product-management', popupName, features);

    if (popup) {
        popup.focus();
    }
};
