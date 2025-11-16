// widget.js (새 파일)

(function() {
  // 이 Vercel URL을 여러분의 Vercel 앱 주소로 변경하세요!
  const CAPTCHA_APP_URL = "https://spatial-captcha-frontend.vercel.app";

  // 고객의 페이지에 있는 모든 <div class="spatial-captcha">를 찾습니다.
  const containers = document.querySelectorAll('.spatial-captcha');

  containers.forEach(container => {
    // div 태그에서 'data-api-key' 속성을 읽어옵니다.
    const apiKey = container.getAttribute('data-api-key');

    if (!apiKey) {
      console.error("Spatial-CAPTCHA: data-api-key 속성이 필요합니다.");
      container.innerHTML = "Spatial-CAPTCHA: API 키가 누락되었습니다.";
      return;
    }

    // 1. iframe 요소를 생성합니다.
    const iframe = document.createElement('iframe');

    // 2. iframe의 URL을 Vercel 주소 + API 키로 설정합니다.
    iframe.src = `${CAPTCHA_APP_URL}?api_key=${apiKey}`;

    // 3. iframe 스타일 설정 (테두리 없고, 크기 100%)
    iframe.style.width = "100%";
    iframe.style.height = "100%"; // 높이는 CSS로 조절하는 것이 좋습니다.
    iframe.style.border = "none";
    iframe.style.minHeight = "700px"; // 캡챠 콘텐츠 최소 높이

    // 4. div 컨테이너에 iframe을 삽입합니다.
    container.appendChild(iframe);
  });
})();
