"""
crx-expert 에이전트를 사용해서 xpath 추출 기능을 추가해주세요. 페이지에서 마우스를 움직여서 클릭하면 xpath를 추출해주는 기능을 구현해주세요.

지금도 popup의 '요소 선택 > 페이지에서 요소 선택'을 클릭하면, 페이지에서 마우스 이동에 따라 요소별 영역이 표시되기는 하는데, 마우스 hover out이 되면 요소 외곽의 파란색이 사라지도록 해주세요.
그리고 hover 된 요소(파란 외곽선이 있는) 에서
- 마우스 좌클릭을 하면 xpath가 클립보드에 저장되고,
- 마우스 우클릭을 하면 context 메뉴(xpath 복사, selector 복사, html 복사, ...) 등이 나오도록 할 수 있나요?
"""

  ---
  [버그 수정] hover out 시 파란 외곽선 사라지기
  onMouseOut에서 event.relatedTarget을 체크하도록 수정했습니다.

  // relatedTarget이 highlightedElement의 자식이면 clear하지 않음
  const relatedTarget = event.relatedTarget as Node | null
  if (relatedTarget && highlightedElement.contains(relatedTarget)) return

  이전에는 자식 요소로 마우스가 이동해도 부모에서 mouseout이 발생해 outline이 깜빡이는 문제가 있었습니다. 또한
  SELECTED_STYLE(빨간 외곽선)은 mouseout으로 절대 지워지지 않습니다.

  ---
  [신기능 1] 좌클릭 → XPath 클립보드 복사

  - navigator.clipboard.writeText() 1차 시도, 실패 시 execCommand('copy') fallback
  - 복사 성공 시 화면 우측 하단에 파란 토스트 알림 1.5초 표시
  - 기존 Popup으로 XPATH_SELECTED 메시지 전송도 유지

  ---
  [신기능 2] 우클릭 → 커스텀 컨텍스트 메뉴

  파란 외곽선(hover 상태)인 요소에서 우클릭 시 커스텀 메뉴 표시:

  ┌───────────────────┬──────────────────────────────────────────┐
  │       항목        │                   동작                   │
  ├───────────────────┼──────────────────────────────────────────┤
  │ XPath 복사        │ generateXPath() 결과 클립보드 복사       │
  ├───────────────────┼──────────────────────────────────────────┤
  │ CSS Selector 복사 │ generateCSSSelector() 결과 클립보드 복사 │
  ├───────────────────┼──────────────────────────────────────────┤
  │ outerHTML 복사    │ element.outerHTML 클립보드 복사          │
  ├───────────────────┼──────────────────────────────────────────┤
  │ innerText 복사    │ element.innerText 클립보드 복사          │
  ├───────────────────┼──────────────────────────────────────────┤
  │ (구분선)          │ —                                        │
  ├───────────────────┼──────────────────────────────────────────┤
  │ 선택 모드 종료    │ 선택 모드 해제                           │
  └───────────────────┴──────────────────────────────────────────┘

  - 메뉴가 뷰포트 밖으로 나가면 자동 flip
  - 외부 클릭 시 메뉴 닫힘
  - src/utils/xpath.ts에 generateCSSSelector() 함수 추가 (id 단축, class 조합, :nth-child 지원)


=============================

"""
좌클릭시 xpath 복사는 잘되요. 그런데, 우클릭시에는 아무런 반응이 없네요.
"""

  원인 분석:

  우클릭 시 이벤트 순서는 mousedown → contextmenu 입니다. 문제는 두 가지였습니다:
  1. HOVER_STYLE 조건 체크 — 우클릭 직전에 mouseout이 발생해 clearHighlight()가 이미 호출되면, highlightedElement가 null이거나   outline이 빈 문자열이 되어 조건 불통과
  2. highlightedElement 의존 — 브라우저별로 mouseout 타이밍이 다를 수 있어 불안정

  수정 후 동작:

  우클릭 시 event.target에서 요소를 직접 가져와서 사용합니다. highlightedElement 상태와 관계없이 항상 우클릭한 실제 요소를
  대상으로 하므로 안정적으로 메뉴가 표시됩니다.

  dist/ 폴더를 chrome://extensions에서 리로드하면 동작 확인하실 수 있습니다.

=========================

"""
우클릭시 메뉴가 나오는데, 실제 기능(xpath, selector, html, innerText 등에 대한 복사)은 안되네요.
"""

  원인 및 수정 내용:                                                                                                                                                                                                                                        
  문제 1 — onElementClick이 메뉴 클릭을 가로챔                                                                                                                                                                                                              
  onElementClick은 capture phase(true)로 등록되어 있어서 이벤트가 DOM 위에서 아래로 내려갈 때 가장 먼저 실행됩니다. 여기서    
  event.stopPropagation()을 호출하면 이벤트가 메뉴 아이템까지 내려가지 못해서 아이템의 click 리스너가 실행되지 않았습니다.

  // 추가: 메뉴 내부 클릭이면 즉시 return → stopPropagation 건너뜀
  const menu = document.getElementById(CONTEXT_MENU_ID)
  if (menu && menu.contains(event.target as Node)) return

  문제 2 — 외부 클릭 닫기 리스너가 메뉴를 먼저 제거

  capture: true로 등록된 closeContextMenu가 메뉴 아이템 클릭 시 DOM에서 메뉴를 먼저 제거해버려서 아이템의 click이 실행될      
  요소가 사라졌습니다.

  // capture 제거 → bubble phase에서 동작
  // 메뉴 내부 클릭이면 닫지 않음
  const outsideClickHandler = (e: MouseEvent) => {
    if (!m || !m.contains(e.target as Node)) closeContextMenu()
  }

