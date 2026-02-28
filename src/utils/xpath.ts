/**
 * XPath 생성기
 *
 * 전략:
 * 1. id 속성이 있는 경우 → //*[@id="..."] 단축 XPath 반환
 * 2. id가 없는 경우 → 루트부터 nth-child 방식으로 전체 XPath 생성
 */

/**
 * 요소의 형제 중 같은 태그를 가진 요소의 1-based 인덱스를 반환합니다.
 */
function getSiblingIndex(element: Element): number {
  const tag = element.tagName.toLowerCase()
  let index = 1
  let sibling = element.previousElementSibling

  while (sibling) {
    if (sibling.tagName.toLowerCase() === tag) {
      index++
    }
    sibling = sibling.previousElementSibling
  }

  return index
}

/**
 * 형제 중 같은 태그를 가진 요소가 둘 이상인지 확인합니다.
 * true이면 XPath에 [n] 인덱스가 필요합니다.
 */
function hasSameTagSiblings(element: Element): boolean {
  const tag = element.tagName.toLowerCase()
  let sibling = element.parentElement?.firstElementChild ?? null

  let count = 0
  while (sibling) {
    if (sibling.tagName.toLowerCase() === tag) {
      count++
      if (count > 1) return true
    }
    sibling = sibling.nextElementSibling
  }

  return false
}

/**
 * 단일 요소에 대한 XPath 세그먼트를 생성합니다.
 * 예: 'div[2]', 'span', 'p[1]'
 */
function buildSegment(element: Element): string {
  const tag = element.tagName.toLowerCase()

  if (hasSameTagSiblings(element)) {
    const index = getSiblingIndex(element)
    return `${tag}[${index}]`
  }

  return tag
}

/**
 * 요소로부터 전체 절대 XPath를 생성합니다.
 *
 * 우선순위:
 * 1. 요소 자체에 고유한 id가 있는 경우 → //*[@id="id"] 반환
 * 2. 조상 중 id가 있는 경우 → //*[@id="ancestor-id"]/tag[n]/.../tag 형식으로 단축
 * 3. 모두 없는 경우 → /html/body/.../tag[n] 전체 경로 반환
 *
 * @param element - XPath를 생성할 대상 DOM 요소
 * @returns XPath 문자열
 */
export function generateXPath(element: Element): string {
  // 1. 요소 자신에 id가 있는 경우
  const ownId = element.getAttribute('id')
  if (ownId) {
    return `//*[@id="${ownId}"]`
  }

  // 루트(document.documentElement)에 도달할 때까지 조상을 순회
  const segments: string[] = []
  let current: Element | null = element

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    // document.documentElement (html) 자체이면 종료
    if (current === document.documentElement) {
      segments.unshift('html')
      break
    }

    // 조상 중 id가 있으면 그 지점에서 단축
    const currentId = current.getAttribute('id')
    if (currentId && current !== element) {
      segments.unshift(`//*[@id="${currentId}"]`)
      // unshift 대신 앞에 붙이고 join 방식 조정
      return segments.join('/')
    }

    segments.unshift(buildSegment(current))
    current = current.parentElement
  }

  return '/' + segments.join('/')
}

/**
 * 클릭 이벤트에서 가장 구체적인(가장 안쪽) Element를 가져옵니다.
 * Shadow DOM은 현재 지원하지 않습니다.
 *
 * @param event - MouseEvent
 * @returns Element | null
 */
export function getElementFromEvent(event: MouseEvent): Element | null {
  const target = event.target
  if (!target || !(target instanceof Element)) return null
  return target
}

/**
 * XPath로 문서에서 요소를 찾아 반환합니다. (검증용)
 * generateXPath의 결과를 역검증할 때 사용합니다.
 *
 * @param xpath - 검증할 XPath 문자열
 * @returns Element | null
 */
export function resolveXPath(xpath: string): Element | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    )
    return result.singleNodeValue as Element | null
  } catch {
    return null
  }
}
