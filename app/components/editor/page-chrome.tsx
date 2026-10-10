"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { ImageIcon, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  createEnabledFooter,
  defaultPageBackground,
  defaultPageHeader,
  insertChromeToken,
  type ChromeSlot,
  type PageBackground,
  type PageChrome,
  type PageHeader,
  type PageSettings,
} from "@/lib/template"

export type ChromeRegion = "header" | "footer"

export type PageChromeSelection = {
  region: ChromeRegion
  slot?: ChromeSlot
} | null

const slots: Array<{ key: ChromeSlot; align: string; placeholder: string }> = [
  { key: "left", align: "text-left", placeholder: "左" },
  { key: "center", align: "text-center", placeholder: "中" },
  { key: "right", align: "text-right", placeholder: "右" },
]

export function PageSettingsButton({
  page,
  onChange,
}: {
  page: PageSettings
  onChange: (page: PageSettings) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const focusRef = useRef<{ region: ChromeRegion; slot: ChromeSlot }>({
    region: "footer",
    slot: "center",
  })

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [open])

  const insertToken = (token: "{{page}}" | "{{pages}}") => {
    const { region, slot } = focusRef.current
    const current = page[region]
    onChange({
      ...page,
      [region]: {
        ...current,
        enabled: true,
        [slot]: insertChromeToken(current[slot], token),
      },
    })
  }

  return (
    <div ref={rootRef} className="relative mr-1">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label="页面设置"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings2 />
        页面
      </Button>
      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <ChromeSection
            title="页眉"
            chrome={page.header}
            onToggle={(enabled) =>
              onChange({
                ...page,
                header: enabled
                  ? { ...page.header, ...defaultPageHeader, ...page.header, enabled: true }
                  : { ...page.header, enabled: false },
              })
            }
            onFirstPage={(showOnFirstPage) =>
              onChange({
                ...page,
                header: { ...page.header, enabled: true, showOnFirstPage },
              })
            }
            onFocusSlot={(slot) => {
              focusRef.current = { region: "header", slot }
            }}
          />
          <ChromeSection
            title="页脚"
            chrome={page.footer}
            onToggle={(enabled) =>
              onChange({
                ...page,
                footer: enabled
                  ? page.footer.left || page.footer.center || page.footer.right
                    ? { ...page.footer, enabled: true }
                    : createEnabledFooter()
                  : { ...page.footer, enabled: false },
              })
            }
            onFirstPage={(showOnFirstPage) =>
              onChange({
                ...page,
                footer: { ...page.footer, enabled: true, showOnFirstPage },
              })
            }
            onFocusSlot={(slot) => {
              focusRef.current = { region: "footer", slot }
            }}
          />
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => insertToken("{{page}}")}
              className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-50"
            >
              插入页码
            </button>
            <button
              type="button"
              onClick={() => insertToken("{{pages}}")}
              className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-50"
            >
              插入总页数
            </button>
          </div>
          <BackgroundSection
            background={page.background}
            onChange={(background) => onChange({ ...page, background })}
          />
        </div>
      )}
    </div>
  )
}

function ChromeSection({
  title,
  chrome,
  onToggle,
  onFirstPage,
  onFocusSlot,
}: {
  title: string
  chrome: PageChrome
  onToggle: (enabled: boolean) => void
  onFirstPage: (show: boolean) => void
  onFocusSlot: (slot: ChromeSlot) => void
}) {
  return (
    <section className="mb-3 border-b border-slate-100 pb-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <button
          type="button"
          role="switch"
          aria-checked={chrome.enabled}
          onClick={() => onToggle(!chrome.enabled)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            chrome.enabled ? "bg-slate-900" : "bg-slate-200"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform ${
              chrome.enabled ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-slate-500">
        <input
          type="checkbox"
          checked={chrome.showOnFirstPage}
          onChange={(event) => onFirstPage(event.target.checked)}
          onFocus={() => onFocusSlot("center")}
        />
        首页显示
      </label>
    </section>
  )
}

function BackgroundSection({
  background,
  onChange,
}: {
  background: PageBackground
  onChange: (background: PageBackground) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const kinds: Array<{ kind: PageBackground["kind"]; label: string }> = [
    { kind: "none", label: "无" },
    { kind: "color", label: "颜色" },
    { kind: "image", label: "图片" },
    { kind: "watermark", label: "水印" },
  ]

  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-slate-700">背景</p>
      <div className="mb-2 flex rounded-md bg-slate-100 p-0.5">
        {kinds.map((item) => (
          <button
            key={item.kind}
            type="button"
            onClick={() => {
              const next = {
                ...defaultPageBackground,
                ...background,
                kind: item.kind,
              }
              if (item.kind === "image" && background.kind !== "image") {
                next.opacity = 0.35
              }
              if (item.kind === "watermark" && background.kind !== "watermark") {
                next.opacity = 0.12
              }
              onChange(next)
            }}
            className={`flex-1 rounded px-2 py-1 text-[10px] ${
              background.kind === item.kind
                ? "bg-white font-medium shadow-sm"
                : "text-slate-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {background.kind === "color" && (
        <label className="flex items-center gap-2 text-[11px] text-slate-500">
          颜色
          <input
            type="color"
            value={background.color || "#f8fafc"}
            onChange={(event) =>
              onChange({ ...background, color: event.target.value })
            }
            className="h-7 w-10 cursor-pointer rounded border border-slate-200 bg-white"
          />
          <span className="font-mono text-[10px] text-slate-400">
            {background.color}
          </span>
        </label>
      )}
      {background.kind === "image" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[11px] text-slate-400"
          >
            {background.imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={background.imageSrc}
                alt="页面背景"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex items-center gap-1">
                <ImageIcon className="size-3.5" />
                上传背景图
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () =>
                onChange({ ...background, imageSrc: String(reader.result) })
              reader.readAsDataURL(file)
            }}
          />
          <OpacityControl
            value={background.opacity}
            min={10}
            max={100}
            onChange={(opacity) => onChange({ ...background, opacity })}
          />
        </div>
      )}
      {background.kind === "watermark" && (
        <div className="space-y-2">
          <input
            value={background.watermarkText}
            maxLength={24}
            placeholder="水印文字"
            onChange={(event) =>
              onChange({ ...background, watermarkText: event.target.value })
            }
            className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs outline-none"
          />
          <OpacityControl
            value={background.opacity}
            min={4}
            max={40}
            onChange={(opacity) => onChange({ ...background, opacity })}
          />
        </div>
      )}
    </section>
  )
}

function OpacityControl({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const percent = Math.round(value * 100)
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-500">
      透明度 {percent}%
      <input
        type="range"
        min={min}
        max={max}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="w-28 accent-slate-900"
      />
    </label>
  )
}

export function PageCanvas({
  page,
  selected,
  onSelect,
  onChange,
  children,
}: {
  page: PageSettings
  selected: PageChromeSelection
  onSelect: (selection: PageChromeSelection) => void
  onChange: (page: PageSettings) => void
  children: ReactNode
}) {
  const pad = page.marginMm * 2.2
  const background = pageCanvasBackground(page.background)

  return (
    <div
      className="group/page relative mx-auto my-6 min-h-[920px] w-[min(720px,calc(100%-32px))] overflow-hidden bg-white shadow-[0_8px_35px_rgba(15,23,42,0.12)]"
      style={background.page}
      onMouseDown={() => onSelect(null)}
    >
      {background.overlay}
      <div
        className="relative z-10 flex min-h-[920px] flex-col"
        style={{
          paddingLeft: pad,
          paddingRight: pad,
          paddingTop: page.header.enabled ? 10 : pad,
          paddingBottom: page.footer.enabled ? 10 : pad,
        }}
      >
        {page.header.enabled ? (
          <ChromeBar
            kind="header"
            chrome={page.header}
            selected={selected?.region === "header"}
            activeSlot={selected?.region === "header" ? selected.slot : undefined}
            onSelect={onSelect}
            onChange={(header) => onChange({ ...page, header })}
          />
        ) : (
          <AddChromeHint
            label="添加页眉"
            position="top"
            onAdd={() => {
              onChange({
                ...page,
                header: { ...defaultPageHeader, ...page.header, enabled: true },
              })
              onSelect({ region: "header" })
            }}
          />
        )}
        <div className="min-h-0 flex-1 py-1">{children}</div>
        {page.footer.enabled ? (
          <ChromeBar
            kind="footer"
            chrome={page.footer}
            selected={selected?.region === "footer"}
            activeSlot={selected?.region === "footer" ? selected.slot : undefined}
            onSelect={onSelect}
            onChange={(footer) => onChange({ ...page, footer })}
          />
        ) : (
          <AddChromeHint
            label="添加页脚"
            position="bottom"
            onAdd={() => {
              onChange({
                ...page,
                footer:
                  page.footer.left || page.footer.center || page.footer.right
                    ? { ...page.footer, enabled: true }
                    : createEnabledFooter(),
              })
              onSelect({ region: "footer" })
            }}
          />
        )}
      </div>
    </div>
  )
}

function ChromeBar({
  kind,
  chrome,
  selected,
  activeSlot,
  onSelect,
  onChange,
}: {
  kind: ChromeRegion
  chrome: PageHeader | PageChrome
  selected: boolean
  activeSlot?: ChromeSlot
  onSelect: (selection: PageChromeSelection) => void
  onChange: (chrome: PageHeader) => void
}) {
  const logoSrc = "logoSrc" in chrome ? chrome.logoSrc : undefined
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`mb-1 rounded-lg border px-2 py-1.5 ${
        selected
          ? "border-violet-400 ring-2 ring-violet-100"
          : "border-transparent hover:border-slate-200"
      }`}
      onMouseDown={(event) => {
        event.stopPropagation()
        onSelect({ region: kind })
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] tracking-[0.16em] text-slate-300">
          {kind === "header" ? "页眉" : "页脚"}
        </span>
        {kind === "header" && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-[10px] text-slate-400 hover:text-slate-600"
          >
            {logoSrc ? "更换 Logo" : "添加 Logo"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {kind === "header" && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="grid size-8 shrink-0 place-items-center overflow-hidden rounded border border-dashed border-slate-200 text-slate-300"
            >
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="页眉 Logo" className="size-full object-contain" />
              ) : (
                <ImageIcon className="size-3.5" />
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/svg+xml"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () =>
                  onChange({ ...chrome, logoSrc: String(reader.result) })
                reader.readAsDataURL(file)
              }}
            />
          </>
        )}
        {slots.map((slot) => (
          <input
            key={slot.key}
            value={chrome[slot.key]}
            maxLength={120}
            placeholder={slot.placeholder}
            onMouseDown={(event) => {
              event.stopPropagation()
              onSelect({ region: kind, slot: slot.key })
            }}
            onFocus={() => onSelect({ region: kind, slot: slot.key })}
            onChange={(event) =>
              onChange({ ...chrome, [slot.key]: event.target.value })
            }
            className={`min-w-0 flex-1 bg-transparent text-[11px] text-slate-500 outline-none ${slot.align} ${
              activeSlot === slot.key ? "text-slate-800" : ""
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function AddChromeHint({
  label,
  position,
  onAdd,
}: {
  label: string
  position: "top" | "bottom"
  onAdd: () => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.stopPropagation()
        onAdd()
      }}
      className={`pointer-events-none absolute inset-x-8 z-20 flex h-8 items-center justify-center border border-dashed border-slate-200 text-[11px] text-slate-400 opacity-0 transition-opacity group-hover/page:pointer-events-auto group-hover/page:opacity-100 ${
        position === "top" ? "top-2" : "bottom-2"
      }`}
    >
      {label}
    </button>
  )
}

function pageCanvasBackground(background: PageBackground): {
  page: CSSProperties
  overlay: ReactNode
} {
  if (background.kind === "color") {
    return {
      page: { backgroundColor: background.color || "#f8fafc" },
      overlay: null,
    }
  }
  if (background.kind === "image" && background.imageSrc) {
    return {
      page: { backgroundColor: "#fff" },
      overlay: (
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${background.imageSrc})`,
            opacity: background.opacity,
          }}
        />
      ),
    }
  }
  if (background.kind === "watermark") {
    return {
      page: { backgroundColor: "#fff" },
      overlay: (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span
            className="text-7xl font-bold tracking-widest text-slate-900 select-none"
            style={{
              opacity: background.opacity,
              transform: "rotate(-30deg)",
            }}
          >
            {background.watermarkText || "草稿"}
          </span>
        </div>
      ),
    }
  }
  return { page: { backgroundColor: "#fff" }, overlay: null }
}

export function disableChrome(page: PageSettings, region: ChromeRegion): PageSettings {
  if (region === "header") {
    return { ...page, header: { ...page.header, enabled: false } }
  }
  return { ...page, footer: { ...page.footer, enabled: false } }
}
