# 1️⃣ 제품 개요 (Product Overview)

## 제품명 (가칭)

Web Data Extractor Pro

## 목적

웹 페이지에서:

- 마우스로 요소 선택
- XPath 기반 요소 지정
- text / attribute 추출
- callback으로 값 변환
- JSON / CSV / Markdown 변환
- 로컬 다운로드 또는 백엔드 API 전송

을 수행하는 **내부 자동화 도구용 Chrome Extension**

---

# 2️⃣ 핵심 문제 정의

|문제|해결 방식|
|---|---|
|CSS selector로 지정 불가한 요소|XPath 지원|
|반복 추출 자동화 어려움|템플릿 기반 수집|
|데이터 후처리 수작업|callback 함수 지원|
|다양한 출력 포맷 필요|JSON/CSV/MD 변환|
|다운로드 제한|Backend API 연동|

---

# 3️⃣ 기능 명세서 (Feature Specification)

---

## 3.1 요소 선택 모드

### 기능 설명

- 확장 아이콘 클릭 → "선택 모드 활성화"
- 마우스 hover 시 highlight
- 클릭 시 해당 요소 XPath 자동 생성

### 요구사항

- full XPath 생성
- id 기반 단축 XPath 옵션
- nth-child 정확성 보장
- iframe 대응 (선택사항)

### 출력 예

{
  "name": "title",
  "xpath": "//*[@id='main']/div[2]/h1",
  "attr": "innerText"
}

---

## 3.2 XPath 기반 추출 엔진

### 지원 기능

- document.evaluate 사용
- 단일 요소
- 다중 요소 (ORDERED_NODE_SNAPSHOT_TYPE)
- attribute 추출
- textContent
- innerHTML

---

## 3.3 데이터 스키마 설정

사용자가 설정 가능:

interface ExtractRule {
  name: string
  xpath: string
  attr?: string
  callback?: string
}

callback 예:

(value) => value.trim().replace("원", "")

⚠️ sandboxed execution 필요 (eval 금지 권장)

---

## 3.4 반복 데이터 추출 (Array Mode)

예:

containerXPath: "//div[@class='item']"
children: [
  { name: "title", xpath: ".//h2", attr: "innerText" },
  { name: "price", xpath: ".//span", attr: "innerText" }
]

출력:

[
  { "title": "...", "price": "..." },
  { "title": "...", "price": "..." }
]

---

## 3.5 출력 포맷 옵션

|포맷|방식|
|---|---|
|JSON|기본|
|JSON Array|배열|
|CSV|stringify|
|Markdown Table|table 생성|
|Raw|key:value|

---

## 3.6 저장 옵션

### 저장 위치

1. chrome.downloads → Downloads 폴더
2. Backend API 전송

### 파일명 설정

- 수동
- 날짜 자동
- URL 기반 slug

---

## 3.7 Backend 연동

POST:

{
  "url": "...",
  "pageHtml": "...",
  "rules": [...],
  "result": {...}
}

확장기능:

- 영상 URL 감지
- backend downloader 호출

---

## 3.8 템플릿 저장 기능

- 사이트별 설정 저장
- hostname 기준 자동 로딩
- export/import JSON

---

## 3.9 보안 요구사항

- Host permission 최소화
- optional_permissions 사용
- eval 금지
- callback sandbox 처리

---

# 4️⃣ PRD (Product Requirements Document)

---

## 4.1 Target User

- 내부 개발자
- 자동화 작업자
- 데이터 수집 담당자

---

## 4.2 MVP 범위

✅ XPath 추출
✅ 단일/배열 모드
✅ JSON/CSV 저장
✅ Backend POST

제외:

- 크롤링 엔진
- 자동 페이지 이동
- 로그인 자동화

---

## 4.3 성공 기준

- 95% 사이트에서 XPath 기반 정확 추출
- 1클릭 export
- 1클릭 backend 전송

---

# 5️⃣ 시스템 아키텍처

Popup UI (React)
   ↓
Background Service Worker (MV3)
   ↓
Content Script (XPath, DOM)
   ↓
Backend API (Optional)

---

# 6️⃣ Tech Tree (기술 스택 구조)

---

## Extension Core

- Manifest V3
- chrome.scripting
- chrome.downloads
- chrome.storage

---

## UI

- React
- TypeScript
- Vite
- @crxjs/vite-plugin

---

## DOM 처리

- document.evaluate
- XPath generator utility

---

## 데이터 변환

- json2csv
- custom markdown builder

---

## 통신

- fetch (backend)
- message passing (content ↔ background)

---

## 저장

- chrome.storage.local
- chrome.storage.sync (옵션)

---

# 7️⃣ 디렉토리 구조 제안

src/
 ├─ background/
 ├─ content/
 ├─ popup/
 ├─ utils/
 │    ├─ xpath.ts
 │    ├─ extractor.ts
 │    ├─ formatter.ts
 │    └─ callbackSandbox.ts
 ├─ types/

---

# 8️⃣ TODO 리스트 (단계별)

---

## Phase 1 — 기본 추출

-  Vite + CRX + TS 세팅
-  content script injection
-  XPath 생성기 구현
-  document.evaluate wrapper
-  단일 추출
-  JSON 다운로드

---

## Phase 2 — 고급 기능

-  Array mode
-  Callback sandbox
-  CSV export
-  Markdown export
-  템플릿 저장

---

## Phase 3 — Backend 연동

-  API endpoint 설정 UI
-  POST 전송
-  토큰 인증
-  파일 유형 감지

---

## Phase 4 — UX 개선

-  드래그 선택
-  요소 hover highlight
-  Devtools panel 모드
-  iframe 지원

---

# 9️⃣ 리스크 분석

|리스크|대응|
|---|---|
|SPA 동적 렌더링|MutationObserver|
|Shadow DOM|확장 지원|
|iframe cross-origin|제한|
|보안 문제|최소 권한|

---

# 🔟 확장 로드맵

---

### Level 1 (현재)

XPath Extractor

### Level 2

Site Automation Template Engine

### Level 3

Full Workflow Automation Tool

### Level 4

Headless Crawling + CDP 통합

---

# 11️⃣ 장기 확장 방향

- CDP 기반 스크롤 자동화
- 전체 페이지 HTML backend 전달
- 로그인 쿠키 export
- 이미지/비디오 자동 감지
- Obsidian 자동 정리

---

# 🎯 최종 구조 요약

Chrome Extension
   ↓ (XPath 추출)
Data Transform Layer
   ↓
Export (JSON/CSV/MD)
   ↓
Local Download OR Backend API