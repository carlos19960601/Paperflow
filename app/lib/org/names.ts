const re = /^[a-zA-Z0-9\u4e00-\u9fff][a-zA-Z0-9\u4e00-\u9fff _-]*$/u

export function validSegment(value: string) {
  return re.test(value.trim())
}

export const segmentHint = "只允许中文、字母、数字、空格和连字符。首位不能是空格或连字符。"