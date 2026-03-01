/**
 * XPath 기반 DOM 추출 엔진
 *
 * document.evaluate를 래핑하여 ExtractRule / ArrayRule에 따라
 * 단일 값 또는 반복 배열 데이터를 추출합니다.
 *
 * 주의: eval 사용 금지 — callback은 sandboxed iframe에서 처리합니다.
 */

import type {
  ExtractRule,
  ObjectRule,
  ArrayRule,
  ExtractionResult,
  ArrayExtractionResult,
  ExtractionValue,
} from '../types'

// ============================================================
// 내부 헬퍼
// ============================================================

/**
 * XPath로 단일 노드를 탐색합니다.
 *
 * @param xpath - 평가할 XPath 표현식
 * @param context - 탐색 기준 노드 (기본: document)
 * @returns Element | null
 */
function queryNode(xpath: string, context: Node = document): Element | null {
  try {
    const result = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    )
    return result.singleNodeValue as Element | null
  } catch (err) {
    console.warn(`[extractor] XPath 평가 오류 (단일): ${xpath}`, err)
    return null
  }
}

/**
 * XPath로 여러 노드를 탐색합니다.
 *
 * @param xpath - 평가할 XPath 표현식
 * @param context - 탐색 기준 노드 (기본: document)
 * @returns Element[]
 */
function queryNodes(xpath: string, context: Node = document): Element[] {
  try {
    const result = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    )
    return Array.from(
      { length: result.snapshotLength },
      (_, i) => result.snapshotItem(i) as Element
    )
  } catch (err) {
    console.warn(`[extractor] XPath 평가 오류 (복수): ${xpath}`, err)
    return []
  }
}

/**
 * Element에서 attr에 따른 값을 추출합니다.
 *
 * @param element - 대상 Element
 * @param attr - 'innerText' | 'innerHTML' | HTML attribute name
 * @returns string | null
 */
function getValueFromElement(
  element: Element,
  attr: string = 'innerText'
): string | null {
  switch (attr) {
    case 'innerText':
      return (element as HTMLElement).innerText?.trim() ?? null
    case 'innerHTML':
      return element.innerHTML?.trim() ?? null
    case 'outerHTML':
      return element.outerHTML?.trim() ?? null
    default:
      // href, src, class, data-* 등 HTML attribute
      return element.getAttribute(attr)
  }
}

// ============================================================
// 공개 API
// ============================================================

/**
 * 단일 ExtractRule에 따라 페이지에서 값을 추출합니다.
 *
 * @param rule - 추출 규칙
 * @returns string | null
 */
export function extractByRule(rule: ExtractRule): ExtractionValue {
  const node = queryNode(rule.xpath)
  if (!node) return null

  const raw = getValueFromElement(node, rule.attr ?? 'innerText')

  // callback이 있어도 eval 금지 — sandboxed iframe에서 처리해야 합니다.
  // 여기서는 raw 값만 반환하고 callback 처리는 callbackSandbox.ts에 위임합니다.
  if (rule.callback) {
    console.warn(
      `[extractor] rule "${rule.name}"에 callback이 있습니다. ` +
        'callbackSandbox를 사용하여 처리하세요. 현재는 raw 값을 반환합니다.'
    )
  }

  return raw
}

/**
 * 복수의 ExtractRule에 따라 단일 결과 객체를 반환합니다.
 *
 * @param rules - ExtractRule 배열
 * @returns ExtractionResult (key: rule.name, value: string | null)
 */
export function extractByRules(rules: ExtractRule[]): ExtractionResult {
  const result: ExtractionResult = {}
  for (const rule of rules) {
    result[rule.name] = extractByRule(rule)
  }
  return result
}

/**
 * ObjectRule에 따라 중첩 객체를 추출합니다.
 * children의 각 ExtractRule을 document 기준으로 추출하여 하나의 객체로 반환합니다.
 *
 * @param rule - ObjectRule
 * @returns ExtractionResult (key: child.name, value: string | null)
 */
export function extractObjectByRule(rule: ObjectRule): ExtractionResult {
  const result: ExtractionResult = {}
  for (const child of rule.children) {
    result[child.name] = extractByRule(child)
  }
  return result
}

/**
 * ArrayRule에 따라 containerXPath 하위의 반복 항목들을 추출합니다.
 *
 * @param rule - ArrayRule
 * @returns ExtractionResult[] (각 컨테이너 항목 별 결과)
 */
export function extractArrayByRule(rule: ArrayRule): ArrayExtractionResult {
  const containers = queryNodes(rule.containerXPath)

  if (containers.length === 0) {
    console.warn(
      `[extractor] containerXPath에서 요소를 찾을 수 없습니다: ${rule.containerXPath}`
    )
    return []
  }

  return containers.map((container) => {
    const rowResult: ExtractionResult = {}

    for (const child of rule.children) {
      const node = queryNode(child.xpath, container)
      if (!node) {
        rowResult[child.name] = null
        continue
      }
      rowResult[child.name] = getValueFromElement(node, child.attr ?? 'innerText')
    }

    return rowResult
  })
}

/**
 * 현재 페이지 URL을 반환합니다.
 */
export function getCurrentUrl(): string {
  return window.location.href
}

/**
 * 현재 페이지의 전체 HTML을 반환합니다. (Backend POST 시 활용)
 */
export function getPageHtml(): string {
  return document.documentElement.outerHTML
}
