// api-client.js (새 파일)

export class CaptchaAPI {
  constructor(apiKey) {
    // API 서버의 기본 주소입니다. (1단계에서 만든 서버)
    this.baseURL = 'https://spatial-captcha-api.onrender.com/api/v1';
    this.apiKey = apiKey; // 지금은 사용하지 않지만, 나중에 인증에 필요합니다.
    
    console.log('📞 CaptchaAPI Client 초기화 (대상: ' + this.baseURL + ')');
  }

  /**
   * 캡챠 챌린지 생성을 서버에 요청합니다.
   */
  async createCaptcha() {
    try {
      const response = await fetch(`${this.baseURL}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey // 나중에 1-A 단계에서 API Key 인증을 추가하면 이 부분을 활성화합니다.
        },
      });

      if (!response.ok) {
        throw new Error(`서버 오류 (HTTP ${response.status})`);
      }

      return await response.json(); // { session_id: "..." } 반환
      
    } catch (error) {
      console.error('Create Captcha API 호출 실패:', error);
      throw error; // 에러를 상위로 전파하여 script.js가 알 수 있게 함
    }
  }

  /**
   * 캡챠 검증을 서버에 요청합니다.
   * @param {string} sessionId - createCaptcha에서 받은 세션 ID
   * @param {object} userRotation - 사용자의 회전 값 {x, y, z}
   */
  async verifyCaptcha(sessionId, userRotation) {
    try {
      const response = await fetch(`${this.baseURL}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_rotation: userRotation,
        }),
      });

      if (!response.ok) {
        throw new Error(`서버 오류 (HTTP ${response.status})`);
      }

      return await response.json(); // { verified: true/false, ... } 반환
      
    } catch (error) {
      console.error('Verify Captcha API 호출 실패:', error);
      throw error;
    }
  }

}

