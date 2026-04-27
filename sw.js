self.addEventListener('install', (pEvent) => {
  console.log('서비스 워커 설치 완료!');
});

self.addEventListener('fetch', (pEvent) => {
  // 앱 설치 조건을 충족하기 위한 빈 리스너
});
