/**
 * 추출 결과 포맷 변환기
 *
 * 지원 포맷: JSON | JSON Array | CSV | Markdown Table | Raw
 * 외부 라이브러리 없이 직접 구현합니다.
 */

import type {
  ExtractionResult,
  ArrayExtractionResult,
  ExtractRule,
  OutputFormat,
  ExtractOutput,
} from '../types'

// ============================================================
// 내부 헬퍼
// ============================================================

/**
 * CSV 셀 값을 이스케이프합니다.
 * - 쉼표, 큰따옴표, 줄바꿈이 포함된 경우 큰따옴표로 감쌉니다.
 * - 큰따옴표는 두 개(")로 이스케이프합니다.
 */
function escapeCSVCell(value: string | null): string {
  if (value === null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Markdown 테이블 셀 값을 이스케이프합니다.
 * - 파이프(|)와 줄바꿈을 이스케이프합니다.
 */
function escapeMDCell(value: string | null): string {
  if (value === null) return ''
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

// ============================================================
// 단일 결과 포맷 변환
// ============================================================

/**
 * 단일 추출 결과를 JSON 문자열로 변환합니다.
 */
export function singleToJSON(result: ExtractionResult): string {
  return JSON.stringify(result, null, 2)
}

/**
 * 단일 추출 결과를 Raw (key: value) 형식으로 변환합니다.
 */
export function singleToRaw(result: ExtractionResult): string {
  return Object.entries(result)
    .map(([key, value]) => `${key}: ${value ?? '(null)'}`)
    .join('\n')
}

// ============================================================
// 배열 결과 포맷 변환
// ============================================================

/**
 * 배열 추출 결과를 JSON 배열 문자열로 변환합니다.
 */
export function toJSONArray(data: ArrayExtractionResult): string {
  return JSON.stringify(data, null, 2)
}

/**
 * 배열 추출 결과를 CSV 문자열로 변환합니다.
 *
 * @param data - 추출 결과 배열
 * @param rules - 헤더 순서 및 이름을 결정하는 ExtractRule 배열
 * @returns CSV 문자열 (UTF-8 BOM 없음)
 */
export function toCSV(
  data: ArrayExtractionResult,
  rules: ExtractRule[]
): string {
  if (data.length === 0) return ''

  const headers = rules.map((r) => r.name)
  const headerRow = headers.map(escapeCSVCell).join(',')

  const rows = data.map((row) =>
    headers.map((h) => escapeCSVCell(row[h] ?? null)).join(',')
  )

  return [headerRow, ...rows].join('\n')
}

/**
 * 배열 추출 결과를 Markdown 테이블 문자열로 변환합니다.
 *
 * @param data - 추출 결과 배열
 * @param rules - 헤더 순서 및 이름을 결정하는 ExtractRule 배열
 * @returns Markdown table 문자열
 */
export function toMarkdown(
  data: ArrayExtractionResult,
  rules: ExtractRule[]
): string {
  if (data.length === 0) return ''

  const headers = rules.map((r) => r.name)

  const headerRow = `| ${headers.map(escapeMDCell).join(' | ')} |`
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`

  const rows = data.map(
    (row) =>
      `| ${headers.map((h) => escapeMDCell(row[h] ?? null)).join(' | ')} |`
  )

  return [headerRow, separatorRow, ...rows].join('\n')
}

// ============================================================
// 통합 포맷 변환 (ExtractOutput 기준)
// ============================================================

/**
 * ExtractOutput을 지정된 포맷으로 변환합니다.
 *
 * @param output - 추출 결과 전체
 * @param format - 출력 포맷
 * @param rules - CSV/Markdown 헤더 순서용 (단일 규칙)
 * @returns 포맷팅된 문자열
 */
export function formatOutput(
  output: ExtractOutput,
  format: OutputFormat,
  rules: ExtractRule[]
): string {
  // 배열 결과가 있으면 첫 번째 배열 규칙의 결과를 우선 사용
  const arrayKeys = Object.keys(output.arrayResults)
  const hasArray = arrayKeys.length > 0
  const firstArrayData = hasArray ? output.arrayResults[arrayKeys[0]] : []

  switch (format) {
    case 'json': {
      // 단일 + 배열 모두 포함한 통합 JSON
      const combined = {
        url: output.url,
        timestamp: output.timestamp,
        single: output.singleResults,
        array: output.arrayResults,
      }
      return JSON.stringify(combined, null, 2)
    }

    case 'json-array': {
      if (hasArray) {
        return toJSONArray(firstArrayData)
      }
      // 단일 결과를 배열에 담아 반환
      return JSON.stringify([output.singleResults], null, 2)
    }

    case 'csv': {
      if (hasArray) {
        return toCSV(firstArrayData, rules)
      }
      // 단일 결과를 1행 CSV로 변환
      return toCSV([output.singleResults], rules)
    }

    case 'markdown': {
      if (hasArray) {
        return toMarkdown(firstArrayData, rules)
      }
      return toMarkdown([output.singleResults], rules)
    }

    case 'raw': {
      if (hasArray) {
        return firstArrayData
          .map((row, i) => `--- [${i + 1}] ---\n${singleToRaw(row)}`)
          .join('\n\n')
      }
      return singleToRaw(output.singleResults)
    }

    default:
      return JSON.stringify(output, null, 2)
  }
}

/**
 * 포맷에 맞는 파일 확장자를 반환합니다.
 */
export function getFileExtension(format: OutputFormat): string {
  switch (format) {
    case 'json':
    case 'json-array':
      return 'json'
    case 'csv':
      return 'csv'
    case 'markdown':
      return 'md'
    case 'raw':
      return 'txt'
    default:
      return 'txt'
  }
}

/**
 * 다운로드 파일명을 생성합니다.
 * 형식: jce-{hostname}-{YYYYMMDD-HHmmss}.{ext}
 */
export function buildFilename(url: string, format: OutputFormat): string {
  const ext = getFileExtension(format)
  try {
    const hostname = new URL(url).hostname.replace(/\./g, '-')
    const now = new Date()
    const date = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .slice(0, 15)
    return `jce-${hostname}-${date}.${ext}`
  } catch {
    return `jce-export.${ext}`
  }
}
