"""
/init
"""

● CLAUDE.md 파일을 생성했습니다.

  현재 프로젝트가 기획 단계임을 감지하여, 기획 문서(docs/ai/chatgpt/chat01.md)에서 추출한 내용을 기반으로 작성했습니다. 포함된 내용:

  1. 빌드/개발 명령어 — Vite + @crxjs/vite-plugin 기준 예상 명령어 (package.json 생성 후 실제 명령어로 업데이트 필요)
  2. 아키텍처 — Popup → Background → Content Script → Backend API 흐름, 각 레이어 역할
  3. 핵심 타입 — ExtractRule, ArrayRule 인터페이스
  4. 보안 원칙 — eval 금지, sandbox 처리, optional_permissions
  5. 개발 단계 — Phase 1~4 로드맵
  6. 문서 위치 및 Backend API 로컬 주소

  소스 코드 구현이 시작되면 실제 명령어와 디렉토리 구조를 반영하여 CLAUDE.md를 업데이트하는 것을 권장합니다.

============

"""
chrome extension 개발 전문자 agent를 만들어주세요.
"""

.claude/agents/crx-expert.md 파일을 생성했습니다.    
    
  생성된 에이전트: crx-expert
                                                                                                                                                                      위치: .claude/agents/crx-expert.md (프로젝트 레벨)
                                                                                                                                                                    
  에이전트 전문 영역                                                                                                                                                

  ┌────────────┬──────────────────────────────────────────────────────────────┐
  │    영역    │                             내용                             │
  ├────────────┼──────────────────────────────────────────────────────────────┤
  │ 아키텍처   │ Manifest V3, Popup / Background / Content Script 레이어 설계 │
  ├────────────┼──────────────────────────────────────────────────────────────┤
  │ 빌드       │ Vite + @crxjs/vite-plugin 설정, HMR 개발환경                 │
  ├────────────┼──────────────────────────────────────────────────────────────┤
  │ Chrome API │ storage, scripting, downloads, runtime, tabs, permissions    │
  ├────────────┼──────────────────────────────────────────────────────────────┤
  │ 추출 엔진  │ XPath 생성기, document.evaluate wrapper, Array Mode          │
  ├────────────┼──────────────────────────────────────────────────────────────┤
  │ 보안       │ eval 금지, CSP, optional_permissions 패턴                    │
  ├────────────┼──────────────────────────────────────────────────────────────┤
  │ 디버깅     │ DevTools, chrome://extensions, Service Worker 디버깅         │
  └────────────┴──────────────────────────────────────────────────────────────┘

  사용 방법

  Claude Code 대화 중 다음과 같이 호출:

  crx-expert 에이전트를 사용해서 Content Script XPath 추출 기능 구현해줘

  또는 Claude가 Chrome Extension 관련 작업임을 인식하면 자동으로 에이전트를 선택합니다.

  에이전트 목록 확인: /agents 명령어

=================

"""
crx-expert 에이전트를 사용해서 vite + crx, typescript를 사용한 chrome extension 개발을 위한 보일러플레이팅을 해주세요.
"""