# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**jnj-web-downloader** — 웹 페이지에서 XPath 기반으로 콘텐츠를 선택·추출하고 JSON/CSV/Markdown으로 내보내거나 Backend API로 전송하는 내부 자동화 도구용 Chrome Extension.

현재 상태: **기획 단계** (소스 코드 미구현, `docs/` 디렉토리에 기획 문서만 존재)

## 기술 스택

- **Chrome Extension Manifest V3**
- **React + TypeScript + Vite**
- **@crxjs/vite-plugin** — Vite 기반 CRX 빌드
- **chrome.scripting / chrome.downloads / chrome.storage** — Extension API
- **document.evaluate** — XPath 추출 엔진
- **json2csv** — CSV 변환
- **fetch** — Backend API 통신
- **Message Passing** — Content Script ↔ Background 통신

## 빌드 및 개발 명령어

> 프로젝트 초기화 후 아래 명령어를 사용 (아직 package.json 미존재)

```bash
npm install           # 의존성 설치
npm run dev           # 개발 서버 (hot reload, dist/ 생성)
npm run build         # 프로덕션 빌드
npm run lint          # ESLint 검사
npm run preview       # 빌드 결과 미리보기
```

Chrome 확장 로드: `chrome://extensions` → "개발자 모드" → "압축해제된 확장 프로그램 로드" → `dist/` 선택

## 아키텍처

```
Popup UI (React)
   ↓ chrome.runtime.sendMessage
Background Service Worker
   ↓ chrome.tabs.sendMessage
Content Script (XPath, DOM)
   ↓ fetch (선택)
Backend API (http://127.0.0.1:8000)
```

### 레이어 역할

| 레이어 | 역할 |
|---|---|
| `popup/` | React UI — 규칙 편집, 추출 실행, 결과 표시, 포맷 선택, 저장 |
| `background/` | Service Worker — 메시지 라우팅, `chrome.downloads`, Backend POST |
| `content/` | 대상 페이지에 주입 — XPath 평가, 요소 highlight, DOM 조작 |
| `utils/` | 공유 유틸리티 — XPath 생성기, 추출 엔진, 포맷 변환, callback 샌드박스 |
| `types/` | 공유 TypeScript 인터페이스 |

### 핵심 데이터 타입

```typescript
interface ExtractRule {
  name: string
  xpath: string
  attr?: string        // innerText | innerHTML | attribute name
  callback?: string    // sandboxed 함수 문자열 (eval 금지)
}

// Array Mode: 반복 컨테이너에서 자식 규칙 반복 추출
interface ArrayRule {
  containerXPath: string
  children: ExtractRule[]
}
```

### 출력 포맷

JSON / JSON Array / CSV / Markdown Table / Raw (key:value)

### 저장 옵션

1. `chrome.downloads` → 로컬 Downloads 폴더
2. Backend API POST (`url`, `pageHtml`, `rules`, `result` 포함)

## 보안 원칙

- `eval` 사용 금지 — callback은 sandboxed iframe 또는 별도 sandbox 처리
- `optional_permissions` 사용 — Host permission 최소화
- Backend URL은 `chrome.storage`에 저장, 소스코드에 하드코딩 금지

## 개발 단계 (Phase)

| Phase | 내용 |
|---|---|
| 1 | Vite+CRX 세팅, Content Script 주입, XPath 생성기, 단일 추출, JSON 다운로드 |
| 2 | Array mode, Callback sandbox, CSV/Markdown export, 템플릿 저장 |
| 3 | Backend API 연동 UI, POST 전송, 토큰 인증, 파일 유형 감지 |
| 4 | 요소 hover highlight, Devtools panel, iframe 지원, SPA 대응 |

## 기획 문서 위치

- `docs/plan/memo.md` — 프로젝트 메모 및 Backend API URL
- `docs/ai/chatgpt/chat01.md` — 전체 PRD, 기능 명세, 아키텍처 설계
- Backend API 로컬 개발 서버: `http://127.0.0.1:8000` (docs: `/api/docs`, `/api/redoc`)
