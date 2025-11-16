import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CaptchaAPI } from './api-client.js';

// Canvas and renderer setup --------------------------------------------------
const canvas = document.getElementById("captcha-canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Target preview canvas (shows the correct orientation)
const previewCanvas = document.getElementById("preview-canvas");
const previewRenderer = new THREE.WebGLRenderer({
  canvas: previewCanvas,
  antialias: true,
  alpha: false,
});
previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Main scene, camera, and lighting -------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color("#f0f0f0");

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
camera.position.set(0, 0, 5);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

// Preview scene (for target orientation) -------------------------------------
const previewScene = new THREE.Scene();
previewScene.background = new THREE.Color("#e8f5e9");

const previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
previewCamera.position.set(0, 0, 5);

const previewAmbientLight = new THREE.AmbientLight(0xffffff, 0.75);
previewScene.add(previewAmbientLight);

const previewDirectionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
previewDirectionalLight.position.set(5, 10, 7);
previewScene.add(previewDirectionalLight);

// Interactive object container -----------------------------------------------
const root = new THREE.Group();
scene.add(root);

const previewRoot = new THREE.Group();
previewScene.add(previewRoot);

let interactiveObject = null;
let previewObject = null;
let targetRotation = new THREE.Euler(); // Store target rotation
let currentSessionId = null; // Store current CAPTCHA session ID
let captchaAPI = null; // API client instance
let useAPI = false; // Whether to use API mode or local mode

// API 모드 설정 (URL 파라미터로 제어)
const urlParams = new URLSearchParams(window.location.search);
const apiKey = urlParams.get('api_key');
if (apiKey) {
  useAPI = true;
  captchaAPI = new CaptchaAPI(apiKey);
  console.log('🔑 API 모드 활성화');
}

const loader = new GLTFLoader();
loader.setPath("./");
loader.setResourcePath("./");

const assetCandidates = [
  { path: "captcha_model.glb", label: "GLB" },
  { path: "captcha_model.gltf", label: "glTF" },
];

/**
 * Centers the object around the origin and optionally fits it into view.
 * @param {THREE.Object3D} object
 */
function normalizeObject(object) {
  const box = new THREE.Box3().setFromObject(object);

  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center); // Move pivot to the center

    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const targetSize = 2.0; // World units ensuring it remains inside the frustum

    if (maxDimension > 0) {
      const scale = targetSize / maxDimension;
      object.scale.multiplyScalar(scale);
    }
  }
}

/**
 * Generates a random target rotation for the captcha challenge.
 * Sets the preview object to show the correct answer.
 * Limited rotation ranges to avoid complete opposite orientations.
 */
/**
 * [v0.3 수정]
 * 캡챠 챌린지를 생성하고, 새 모델을 로드하며, 회전 각도를 설정합니다.
 */
async function generateRandomChallenge() {
  let modelToLoad = null; // 로드할 모델 URL (기본값 null)

  if (useAPI && captchaAPI) {
    // --- API 모드 ---
    try {
      // 1. API에서 챌린지 정보 (모델 URL, 정답 각도)를 가져옵니다.
      const response = await captchaAPI.createCaptcha();
      currentSessionId = response.session_id;
      
      targetRotation.set(
        response.target_rotation.x,
        response.target_rotation.y,
        response.target_rotation.z
      );
      
      modelToLoad = response.model_url; // [!!!] API가 지정한 모델
      
      console.log(`🎯 API Challenge created! 모델: ${modelToLoad}, 세션: ${currentSessionId}`);
      
    } catch (error) {
      // (v0.5에서 수정된 오류 처리 로직)
      console.error('Failed to create API challenge. This is a fatal error.', error);
      let errorMessage = 'Could not connect to the CAPTCHA service.';
      if (error.message && error.message.includes('401')) {
         errorMessage = 'Invalid API Key. (HTTP 401)';
      } else if (error.message && error.message.includes('HTTP')) {
         errorMessage = `Service unavailable. (${error.message})`;
      }
      showCaptchaError(errorMessage);
      return; // 오류 발생 시 함수 종료
    }
    
  } else {
    // --- 로컬 모드 (API 미사용 시) ---
    targetRotation.set(
      THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-90, 90)),
      THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-90, 90)),
      THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-45, 45))
    );
    // modelToLoad는 null이므로, loadModel()이 알아서 폴백 오브젝트를 로드합니다.
    console.log(`🎯 Local challenge generated!`);
  }

  // --- 모델 로드 및 각도 적용 (공통) ---
  
  // 2. [!!!] API 또는 로컬 모드에서 결정된 모델을 로드합니다. (await로 완료까지 기다림)
  await loadModel(modelToLoad); 

  // 3. 모델 로드가 완료된 후, 각도를 적용합니다.
  if (interactiveObject && previewObject) {
    // 프리뷰(정답) 캔버스에 정답 각도 적용
    previewObject.rotation.copy(targetRotation);
    
    // 인터랙티브(문제) 캔버스에 랜덤 오프셋 적용
    const offsetX = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-75, 75));
    const offsetY = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-75, 75));
    const offsetZ = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-30, 30));
    
    interactiveObject.rotation.set(
      targetRotation.x + offsetX,
      targetRotation.y + offsetY,
      targetRotation.z + offsetZ
    );
  } else {
    console.error("모델 로드 후 오브젝트가 설정되지 않았습니다.");
  }
}

function generateLocalChallenge() {
  // Generate random target rotation with limited range (avoid extreme angles)
  // Using smaller ranges to keep objects recognizable
  targetRotation.set(
    THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-90, 90)),
    THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-90, 90)),
    THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-45, 45))
  );
  
  // Set preview object to target rotation (shows the answer)
  previewObject.rotation.copy(targetRotation);
  
  // Apply moderate random offset to the interactive object (user must solve)
  // Limited to 60-90 degrees to avoid opposite orientations
  const offsetX = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-75, 75));
  const offsetY = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-75, 75));
  const offsetZ = THREE.MathUtils.degToRad(THREE.MathUtils.randFloat(-30, 30));
  
  interactiveObject.rotation.set(
    targetRotation.x + offsetX,
    targetRotation.y + offsetY,
    targetRotation.z + offsetZ
  );
  
  console.log(`🎯 Local challenge generated! Target rotation: (${THREE.MathUtils.radToDeg(targetRotation.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(targetRotation.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(targetRotation.z).toFixed(1)}°)`);
}

/**
 * Creates a fallback 3D object composed of multiple geometries.
 * This serves as a captcha challenge when no GLB/GLTF file is available.
 * Enhanced with clear front/back indicators for better orientation recognition.
 */
function createFallbackObject() {
  const group = new THREE.Group();
  
  // Main body - Cube
  const cubeGeometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const cubeMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a90e2,
    roughness: 0.3,
    metalness: 0.6,
  });
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  group.add(cube);
  
  // Top sphere (always on top)
  const sphereGeometry = new THREE.SphereGeometry(0.4, 32, 32);
  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: 0xe94b3c,
    roughness: 0.4,
    metalness: 0.3,
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.set(0, 1, 0);
  group.add(sphere);
  
  // Right side cylinder
  const cylinderGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 32);
  const cylinderMaterial = new THREE.MeshStandardMaterial({
    color: 0x50c878,
    roughness: 0.5,
    metalness: 0.4,
  });
  const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
  cylinder.position.set(1.2, 0, 0);
  cylinder.rotation.z = Math.PI / 2;
  group.add(cylinder);
  
  // FRONT indicator - Large bright cone pointing forward
  const coneGeometry = new THREE.ConeGeometry(0.45, 1.0, 32);
  const coneMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    roughness: 0.2,
    metalness: 0.8,
    emissive: 0xffd700,
    emissiveIntensity: 0.2,
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.position.set(0, -0.5, 1.0);
  cone.rotation.x = Math.PI; // Point forward
  group.add(cone);
  
  // Front marker ring - CLEAR orientation indicator
  const markerGeometry = new THREE.TorusGeometry(0.3, 0.1, 16, 32);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xff00ff,
    roughness: 0.1,
    metalness: 0.9,
    emissive: 0xff00ff,
    emissiveIntensity: 0.5,
  });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  marker.position.set(0, 0, 0.8);
  group.add(marker);
  
  // Back indicator - Small dark sphere (opposite side)
  const backSphereGeometry = new THREE.SphereGeometry(0.2, 16, 16);
  const backSphereMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.8,
    metalness: 0.2,
  });
  const backSphere = new THREE.Mesh(backSphereGeometry, backSphereMaterial);
  backSphere.position.set(0, 0, -0.8);
  group.add(backSphere);
  
  group.scale.setScalar(0.8);
  return group;
}

/**
 * Loads the GLB model. Falls back to a procedural composite object if loading fails.
 * Creates both the interactive object and the preview object.
 */
/**
 * [v0.3 수정]
 * 모델을 로드하고, 실패 시 폴백(fallback) 오브젝트를 생성합니다.
 * 이 함수는 Promise를 반환하여 로드가 완료될 때까지 기다릴 수 있게 합니다.
 * @param {string | null} modelUrl - API로부터 받은 모델의 URL
 */
function loadModel(modelUrl) {
  return new Promise((resolve, reject) => {
    // 1. 기존에 있던 3D 모델을 씬(scene)에서 모두 제거합니다.
    if (interactiveObject) {
      root.remove(interactiveObject);
      interactiveObject = null;
    }
    if (previewObject) {
      previewRoot.remove(previewObject);
      previewObject = null;
    }

    // 2. 모델 URL이 유효하고, loader가 존재할 경우 모델 로드 시도
    if (modelUrl && loader) {
      loader.load(
        modelUrl,
        // 성공 콜백
        (gltf) => {
          const object = gltf.scene || gltf.scenes[0];
          normalizeObject(object);
          root.add(object);
          interactiveObject = object;

          // 프리뷰용 복제
          const previewObjectClone = object.clone();
          previewRoot.add(previewObjectClone);
          previewObject = previewObjectClone;
          
          console.info(`✅ v0.3 모델 로드 완료: ${modelUrl}`);
          resolve(); // 로드 성공
        },
        // 로드 중 (undefined)
        undefined,
        // 오류 콜백
        (error) => {
          console.warn(`[v0.3] GLTF 로드 실패: ${modelUrl}. 폴백(fallback)으로 전환합니다.`, error);
          loadFallbackObject();
          resolve(); // 폴백 로드도 '성공'으로 처리
        }
      );
    } else {
      // 3. modelUrl이 없거나(로컬 모드) 로더가 없으면 폴백 오브젝트 로드
      loadFallbackObject();
      resolve(); // 폴백 로드도 '성공'으로 처리
    }
  });
}

/**
 * [v0.3 추가]
 * 폴백 오브젝트(procedural object)를 로드하는 헬퍼 함수
 */
function loadFallbackObject() {
  console.warn("폴백(fallback) 3D 오브젝트를 생성합니다.");
  const fallbackObject = createFallbackObject(); // createFallbackObject 함수는 이미 존재
  root.add(fallbackObject);
  interactiveObject = fallbackObject;
  
  const previewFallbackObject = createFallbackObject();
  previewRoot.add(previewFallbackObject);
  previewObject = previewFallbackObject;
}

// Interaction handling --------------------------------------------------------
let isDragging = false;
let lastPointerPosition = { x: 0, y: 0 };

// Adaptive rotation speed based on device
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let baseRotationSpeed = isTouchDevice ? 0.008 : 0.005; // More sensitive on mobile
let rotationSpeed = baseRotationSpeed;
let isSlowMode = false;

const fineRotationStep = THREE.MathUtils.degToRad(2); // 2 degrees per click

// Slow motion toggle for mobile users
const slowModeToggle = document.getElementById('slow-mode-toggle');
if (slowModeToggle) {
  // Auto-enable slow mode on mobile by default
  if (isTouchDevice) {
    slowModeToggle.checked = false; // Start normal, let user enable slow mode
  }
  
  slowModeToggle.addEventListener('change', (e) => {
    isSlowMode = e.target.checked;
    rotationSpeed = isSlowMode ? baseRotationSpeed * 0.3 : baseRotationSpeed; // 70% slower
    console.log(`🐢 Slow mode: ${isSlowMode ? 'ON' : 'OFF'} (speed: ${rotationSpeed.toFixed(4)})`);
  });
}

function handlePointerDown(event) {
  if (!interactiveObject) return;
  isDragging = true;
  lastPointerPosition.x = event.clientX || event.touches?.[0]?.clientX || 0;
  lastPointerPosition.y = event.clientY || event.touches?.[0]?.clientY || 0;
  
  // Prevent default touch behaviors
  if (event.touches) {
    event.preventDefault();
  }
  
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch (e) {
    // Pointer capture might not be available on some devices
  }
}

function handlePointerMove(event) {
  if (!isDragging || !interactiveObject) return;

  const currentX = event.clientX || event.touches?.[0]?.clientX || lastPointerPosition.x;
  const currentY = event.clientY || event.touches?.[0]?.clientY || lastPointerPosition.y;

  const deltaX = currentX - lastPointerPosition.x;
  const deltaY = currentY - lastPointerPosition.y;

  interactiveObject.rotation.y += deltaX * rotationSpeed;
  interactiveObject.rotation.x += deltaY * rotationSpeed;

  lastPointerPosition.x = currentX;
  lastPointerPosition.y = currentY;
  
  // Prevent scrolling on touch devices
  if (event.touches) {
    event.preventDefault();
  }
}

function handlePointerUp(event) {
  if (!interactiveObject) return;
  isDragging = false;
  
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch (e) {
    // Pointer capture might not be available
  }
}

// Use both pointer events (modern) and touch events (fallback)
canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
canvas.addEventListener("pointermove", handlePointerMove, { passive: false });
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
canvas.addEventListener("pointerleave", handlePointerUp);

// Additional touch event support for better mobile compatibility
canvas.addEventListener("touchstart", handlePointerDown, { passive: false });
canvas.addEventListener("touchmove", handlePointerMove, { passive: false });
canvas.addEventListener("touchend", handlePointerUp);
canvas.addEventListener("touchcancel", handlePointerUp);

// Fine control buttons --------------------------------------------------------
const controlButtons = document.querySelectorAll('.control-btn');
controlButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!interactiveObject) return;
    
    const axis = btn.dataset.axis;
    const direction = parseFloat(btn.dataset.direction);
    const rotation = fineRotationStep * direction;
    
    if (axis === 'x') {
      interactiveObject.rotation.x += rotation;
    } else if (axis === 'y') {
      interactiveObject.rotation.y += rotation;
    } else if (axis === 'z') {
      interactiveObject.rotation.z += rotation;
    }
    
    // Visual feedback
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => btn.style.transform = '', 100);
  });
});

// Keyboard controls -----------------------------------------------------------
document.addEventListener('keydown', (event) => {
  if (!interactiveObject) return;
  
  const key = event.key.toLowerCase();
  let rotated = false;
  
  switch(key) {
    case 'w':
      interactiveObject.rotation.x -= fineRotationStep;
      rotated = true;
      break;
    case 's':
      interactiveObject.rotation.x += fineRotationStep;
      rotated = true;
      break;
    case 'a':
      interactiveObject.rotation.y -= fineRotationStep;
      rotated = true;
      break;
    case 'd':
      interactiveObject.rotation.y += fineRotationStep;
      rotated = true;
      break;
    case 'q':
      interactiveObject.rotation.z -= fineRotationStep;
      rotated = true;
      break;
    case 'e':
      interactiveObject.rotation.z += fineRotationStep;
      rotated = true;
      break;
  }
  
  if (rotated) {
    event.preventDefault();
    updateVisualFeedback();
  }
});

// Resizing --------------------------------------------------------------------
function resizeRendererToDisplaySize() {
  const { clientWidth, clientHeight } = canvas;
  const needResize =
    canvas.width !== clientWidth || canvas.height !== clientHeight;

  if (needResize) {
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
}

// Verification logic ----------------------------------------------------------
const verifyButton = document.getElementById("verify-btn");
const refreshButton = document.getElementById("refresh-btn");

// [v0.5 수정] script.js의 verifyButton.addEventListener 함수 전체를 이걸로 교체하세요.

verifyButton.addEventListener("click", async () => {
  if (!interactiveObject || !previewObject || verifyButton.disabled) {
    // 이미 성공했거나 로딩 중이면 클릭 무시
    return;
  }

  if (useAPI && captchaAPI && currentSessionId) {
    // API 모드: 서버에서 검증
    try {
      const userRotation = {
        x: interactiveObject.rotation.x,
        y: interactiveObject.rotation.y,
        z: interactiveObject.rotation.z
      };

      // [v0.5] 검증 시작 시 버튼 비활성화 (중복 클릭 방지)
      verifyButton.disabled = true;
      verifyButton.textContent = "Verifying...";

      const response = await captchaAPI.verifyCaptcha(currentSessionId, userRotation);
      
      if (response.verified) {
        // [v0.5] 성공!
        showVerificationResult(true); // 성공 UI 표시
      } else {
        // [v0.5] 실패!
        showVerificationResult(false); // 실패 UI (흔들림) 표시
      }
    } catch (error) {
      console.error('Verification error:', error);
      // [v0.5] API 통신 자체에 실패해도 '실패'로 간주
      showVerificationResult(false);
    }
  } 
  // else 블록이 삭제되어 로컬 검증 보안 허점이 제거되었습니다.
});

// Refresh button to generate new challenge
refreshButton.addEventListener("click", async () => {
  if (!interactiveObject || !previewObject) {
    alert("⏳ Model is loading. Please wait a moment.");
    return;
  }
  await generateRandomChallenge();
  console.log("🔄 New challenge generated");
});

// Visual feedback for rotation similarity ----------------------------------
const accuracyText = document.getElementById('accuracy-text');
const accuracyBar = document.getElementById('accuracy-bar');
const accuracyIndicator = document.getElementById('accuracy-indicator');

function updateVisualFeedback() {
  if (!interactiveObject || !previewObject) return;
  
  interactiveObject.updateMatrixWorld();
  previewObject.updateMatrixWorld();
  
  const userQuaternion = interactiveObject.quaternion.clone();
  const targetQuaternion = previewObject.quaternion.clone();
  
  const angleRadians = userQuaternion.angleTo(targetQuaternion);
  const angleDegrees = THREE.MathUtils.radToDeg(angleRadians);
  
  // Update accuracy text
  accuracyText.textContent = `Error: ${angleDegrees.toFixed(1)}°`;
  
  // Update accuracy bar (inverted: 0° = 100%, 180° = 0%)
  const maxAngle = 180;
  const accuracy = Math.max(0, Math.min(100, ((maxAngle - angleDegrees) / maxAngle) * 100));
  accuracyBar.style.width = `${accuracy}%`;
  
  // Mobile users get different tolerance thresholds
  const greenThreshold = isTouchDevice ? 40 : 35;
  const yellowThreshold = isTouchDevice ? 65 : 60;
  
  // Update accuracy indicator color and text based on accuracy
  if (angleDegrees < greenThreshold) {
    accuracyIndicator.style.background = 'rgba(76, 175, 80, 0.9)';
    accuracyText.style.color = 'white';
    canvas.style.boxShadow = '0 0 30px rgba(76, 175, 80, 0.6), 0 0 60px rgba(76, 175, 80, 0.3)';
  } else if (angleDegrees < yellowThreshold) {
    accuracyIndicator.style.background = 'rgba(255, 152, 0, 0.9)';
    accuracyText.style.color = 'white';
    canvas.style.boxShadow = '0 0 20px rgba(255, 193, 7, 0.5)';
  } else if (angleDegrees < 90) {
    accuracyIndicator.style.background = 'rgba(255, 87, 34, 0.9)';
    accuracyText.style.color = 'white';
    canvas.style.boxShadow = '';
  } else {
    accuracyIndicator.style.background = 'rgba(244, 67, 54, 0.9)';
    accuracyText.style.color = 'white';
    canvas.style.boxShadow = '';
  }
  
  // Add status indicator
  if (angleDegrees < greenThreshold) {
    accuracyText.textContent = `✅ Error: ${angleDegrees.toFixed(1)}° - Ready to verify!`;
  } else if (angleDegrees < yellowThreshold) {
    accuracyText.textContent = `🟡 Error: ${angleDegrees.toFixed(1)}° - Almost there!`;
  } else {
    accuracyText.textContent = `🔴 Error: ${angleDegrees.toFixed(1)}° - Keep rotating`;
  }
}

// Animation loop --------------------------------------------------------------
let frameCount = 0;
function render() {
  resizeRendererToDisplaySize();
  renderer.render(scene, camera);
  
  // Also render the preview canvas
  const { clientWidth, clientHeight } = previewCanvas;
  const needResize = previewCanvas.width !== clientWidth || previewCanvas.height !== clientHeight;
  if (needResize) {
    previewRenderer.setSize(clientWidth, clientHeight, false);
    previewCamera.aspect = clientWidth / clientHeight;
    previewCamera.updateProjectionMatrix();
  }
  previewRenderer.render(previewScene, previewCamera);
  
  // Update visual feedback every 5 frames for better responsiveness
  frameCount++;
  if (frameCount % 5 === 0) {
    updateVisualFeedback();
  }
  
  requestAnimationFrame(render);
}

// ... (render() 함수가 끝나는 곳) ...

/**
 * 5-B 단계: 캡챠 영역에 치명적인 오류 메시지를 표시합니다.
 */
function showCaptchaError(message) {
  const mainCanvas = document.getElementById("captcha-canvas");
  // .canvas-section.main-canvas를 찾습니다.
  const canvasSection = mainCanvas ? mainCanvas.closest('.canvas-section.main-canvas') : null;

  if (canvasSection) {
    // 캔버스, 정확도 표시기 등 기존 내용을 모두 숨깁니다.
    Array.from(canvasSection.children).forEach(child => {
      if (child.style) {
        child.style.display = 'none';
      }
    });

    // 1. <div>를 새로 만듭니다.
    const errorDiv = document.createElement('div');
    // 2. <div>에 CSS 클래스를 적용합니다.
    errorDiv.className = 'captcha-error-message'; 

    // 3. <div> 안에 HTML 오류 메시지를 넣습니다.
    errorDiv.innerHTML = `
      <h3>🔐 Spatial CAPTCHA Error</h3>
      <p>${message}</p>
      <span>Please check your API Key or contact the site administrator.</span>
    `;

    // 4. 캔버스 섹션에 오류 <div>를 삽입합니다.
    canvasSection.appendChild(errorDiv);
  } else {
    // 캔버스를 못찾으면 body에라도 오류를 표시합니다.
    document.body.innerHTML = `<div class="captcha-error-message"><h3>Fatal Error</h3><p>${message}</p></div>`;
  }
}

// Entry point -----------------------------------------------------------------
function initialize() {
// ... (initialize 함수 시작) ...
  console.log("🚀 Spatial Captcha initializing...");
  
  // Wait for CSS to load and elements to have dimensions
  const waitForDimensions = () => {
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      console.log("⏳ Waiting for canvas dimensions...");
      requestAnimationFrame(waitForDimensions);
      return;
    }
    
    console.log(`Canvas size: ${canvas.clientWidth}x${canvas.clientHeight}`);
    
    // Set initial renderer sizes now that we have dimensions
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    
    previewRenderer.setSize(previewCanvas.clientWidth, previewCanvas.clientHeight, false);
    previewCamera.aspect = previewCanvas.clientWidth / previewCanvas.clientHeight;
    previewCamera.updateProjectionMatrix();
    
    // ...
    console.log(`Camera aspect: ${camera.aspect}`);
    
    // [v0.3 수정] 챌린지 생성 및 모델 로드를 한 번에 시작합니다.
    generateRandomChallenge().catch(err => {
      console.error('초기 챌린지 생성에 실패했습니다:', err);
    });
    render();
    
    console.log("✅ Render loop started");
    // ...
  };
  
  waitForDimensions();
}

// [v0.5 추가] script.js 파일 맨 마지막에 추가하세요.

/**
 * v0.5: 검증 결과를 팝업(alert) 대신 UI로 표시합니다.
 * @param {boolean} isSuccess - 검증 성공 여부
 */
function showVerificationResult(isSuccess) {
  if (isSuccess) {
    // --- 성공 ---
    verifyButton.classList.remove('shake');
    verifyButton.classList.add('success'); // 초록색 'success' 클래스 추가
    verifyButton.textContent = '✓ Success!';
    verifyButton.disabled = true; // 버튼 영구 비활성화
    
    // 3D 캔버스 조작을 '잠금'
    const mainCanvasSection = document.querySelector('.canvas-section.main-canvas');
    if (mainCanvasSection) {
      mainCanvasSection.classList.add('locked');
    }
    canvas.classList.add('locked');

  } else {
    // --- 실패 ---
    verifyButton.classList.add('shake'); // 'shake' (흔들림) 클래스 추가
    verifyButton.textContent = '✗ Try Again';
    
    // 0.6초 (애니메이션 시간) 후에 버튼을 원래대로 되돌림
    setTimeout(() => {
      verifyButton.classList.remove('shake');
      verifyButton.textContent = '✓ Verify Human';
      verifyButton.disabled = false; // 버튼 다시 활성화
    }, 600);
  }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}




