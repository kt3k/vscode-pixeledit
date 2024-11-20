// Copyright 2022-2024 Yoshiya Hinosawa. All rights reserved. MIT license.

/// <reference lib="dom" />
/// <reference path="../node_modules/@types/vscode-webview/index.d.ts" />

import { type Context, register, Signal } from "@kt3k/cell"

import type {
  Color,
  Edit,
  ExtensionMessageEvent,
  Point,
  Stroke,
  WebviewMessage,
} from "./types.ts"

type Tool = "pen" | "eraser" | "fill"
const currentTool = new Signal<Tool>("pen")
type ToolBtn = { tool: Tool; label: string }
const toolBtns: ToolBtn[] = [
  { tool: "pen", label: "✒️" },
  { tool: "eraser", label: "消" },
  { tool: "fill", label: "塗" },
]
const currentColor = new Signal<Color>([0, 0, 0, 255])
type Data = Color[][]
const baseData = new Signal<Data>([])
let currentDataCache: Data = []
const currentEdit = new Signal<Edit>({ color: [0, 0, 0, 0], stroke: [] })
const TRANSPARENT = [0, 0, 0, 0] as const
currentEdit.subscribe((edit) => {
  for (const [x, y] of edit.stroke) {
    currentDataCache[x][y] = edit.color
  }
})
baseData.subscribe((data) => {
  currentDataCache = data
})

const paletteColors = new Signal<Color[]>([
  [0, 0, 0, 255],
  [0x7c, 0x7c, 0x7c, 255],
  [0xbc, 0xbc, 0xbc, 255],
  [0xf8, 0xf8, 0xf8, 255],
  [0xfc, 0xfc, 0xfc, 255],
  [237, 28, 36, 255],
  [255, 127, 39, 255],
  [255, 242, 0, 255],
  [34, 177, 36, 255],
  [0, 162, 232, 255],
  [63, 72, 204, 255],
  [163, 73, 164, 255],
  [255, 255, 255, 255],
  [195, 195, 195, 255],
  [185, 122, 87, 255],
  [255, 174, 201, 255],
  [255, 201, 14, 255],
  [239, 228, 176, 255],
  [181, 230, 29, 255],
  [153, 217, 234, 255],
  [112, 146, 190, 255],
  [200, 191, 231, 255],
])

export function toCssColor(c: Color) {
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`
}

export function toHex(c: Color) {
  const r = c[0].toString(16).padStart(2, "0")
  const g = c[1].toString(16).padStart(2, "0")
  const b = c[2].toString(16).padStart(2, "0")
  return "#" + r + g + b
}

export function* range(n: number) {
  for (let i = 0; i < n; i++) {
    yield i
  }
}

const CELL_SIZE = 10

function Canvas({ el: canvas, on, subscribe }: Context<HTMLCanvasElement>) {
  const ctx = canvas.getContext("2d")!
  let width = 0
  let height = 0

  subscribe(baseData, (data) => {
    width = data.length
    height = data[0]?.length || 0
    canvas.width = width * CELL_SIZE
    canvas.height = height * CELL_SIZE
    drawData(ctx, data, CELL_SIZE)
  })

  subscribe(currentEdit, (edit) => {
    drawEdit(ctx, edit, CELL_SIZE)
  })

  on("mouseup", (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(width * (e.clientX - rect.left) / canvas.clientWidth)
    const y = Math.floor(height * (e.clientY - rect.top) / canvas.clientHeight)
    if (!(x >= 0 && x < width && y >= 0 && y < height)) {
      return
    }
    let edit: Edit
    const tool = currentTool.get()
    if (tool === "fill") {
      edit = {
        color: currentColor.get(),
        stroke: fill(x, y, width, height, currentDataCache[x][y]),
      }
    } else if (tool === "eraser") {
      edit = {
        color: TRANSPARENT,
        stroke: [[x, y]],
      }
    } else {
      // Pen tool
      edit = {
        color: currentColor.get(),
        stroke: [[x, y]],
      }
    }
    currentEdit.update(edit)
    postMessage({ type: "edit", edit })
  })
}

function importImage(img: HTMLImageElement) {
  const { width, height } = img
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  const data: Data = [...Array(width)].map((_e) =>
    Array(height).fill(TRANSPARENT)
  )
  ctx.drawImage(img, 0, 0, width, height)
  for (const x of range(width)) {
    for (const y of range(height)) {
      const { data: d } = ctx.getImageData(x, y, 1, 1)
      data[x][y] = [d[0], d[1], d[2], d[3]]
    }
  }
  baseData.update(data)
}

function exportImage(data: Data) {
  const dataWidth = data.length
  const dataHeight = data[0].length
  const canvas = document.createElement("canvas")
  canvas.width = dataWidth
  canvas.height = dataHeight
  const ctx = canvas.getContext("2d")!
  data.forEach((row, i) => {
    row.forEach((color, j) => {
      ctx.fillStyle = toCssColor(color)
      ctx.fillRect(i, j, 1, 1)
    })
  })
  return canvas.toDataURL("image/png")
}

function drawEdit(ctx: CanvasRenderingContext2D, edit: Edit, size: number) {
  for (const [x, y] of edit.stroke) {
    drawPoint(ctx, x, y, size, edit.color)
  }
}

function drawData(ctx: CanvasRenderingContext2D, data: Data, size: number) {
  data.forEach((row, x) => {
    row.forEach((color, y) => {
      drawPoint(ctx, x, y, size, color)
    })
  })
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: Color,
) {
  ctx.clearRect(x * size, y * size, size, size)
  ctx.fillStyle = toCssColor(color)
  ctx.fillRect(x * size, y * size, size, size)
}

function fill(
  x: number,
  y: number,
  dataWidth: number,
  dataHeight: number,
  cc: Color,
): Stroke {
  return Array.from(filler(x, y, dataWidth, dataHeight, cc))
}

function* filler(
  x: number,
  y: number,
  dataWidth: number,
  dataHeight: number,
  cc: Color,
  cache: Set<string> = new Set(),
): Generator<Point> {
  const key = `${x},${y}`
  if (cache.has(key)) {
    return
  }
  cache.add(key)

  if (x < 0 || x >= dataWidth || y < 0 || y >= dataHeight) {
    return
  }
  const color = currentDataCache[x][y]
  if (
    cc[0] !== color[0] || cc[1] !== color[1] || cc[2] !== color[2] ||
    cc[3] !== color[3]
  ) {
    return
  }
  yield [x, y]
  yield* filler(x + 1, y, dataWidth, dataHeight, cc, cache)
  yield* filler(x, y + 1, dataWidth, dataHeight, cc, cache)
  yield* filler(x - 1, y, dataWidth, dataHeight, cc, cache)
  yield* filler(x, y - 1, dataWidth, dataHeight, cc, cache)
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.src = uri
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
  })
}

function MiniCanvas({ el: canvas, subscribe }: Context<HTMLCanvasElement>) {
  const ctx = canvas.getContext("2d")!
  subscribe(baseData, (data) => {
    canvas.width = data.length
    canvas.height = data[0]?.length || 0
    drawData(ctx, data, 1)
  })
  subscribe(currentEdit, (edit) => {
    drawEdit(ctx, edit, 1)
  })
}

/** Tools UI component */
function Tools({ el, on, queryAll, subscribe }: Context) {
  on("click", ".item", ({ target }) => {
    const item = target as HTMLElement
    // deno-lint-ignore no-explicit-any
    currentTool.update(item.dataset.tool as any)
  })

  el.innerHTML = toolBtns.map((btn) => `
    <span
      class="item border border-gray-300 w-12 h-12 flex justify-center items-center text-2xl"
      data-tool="${btn.tool}"
    >${btn.label}</span>
  `).join("")

  subscribe(currentTool, (tool) => {
    queryAll<HTMLElement>(".item").forEach((x) => {
      x.classList.toggle("bg-gray-500", x.dataset.tool === tool)
    })
  })
}

/** Palette UI Component */
function Palette({ el, on, queryAll, subscribe }: Context) {
  on("click", ".item", (e) => {
    const item = e.target as HTMLElement
    currentColor.update(JSON.parse(item.dataset.color!))
  })

  subscribe(paletteColors, (colors) => {
    el.innerHTML = colors.map((color) =>
      `<span
         class="item relative flex items-end w-12 h-12 border border-transparent hover:border-gray-500 cursor-pointer"
         data-color="${JSON.stringify(color)}"
         style="background-color: ${toCssColor(color)};"
      >
        <span
          class="text-white bg-gray-800 bg-opacity-70 absolute bottom-0 w-full text-center"
          style="font-size: 0.5rem;"
        >
          ${toHex(color)}
        </span>
      </span>`
    ).join("\n")
  })

  subscribe(currentColor, (color) => {
    queryAll<HTMLElement>(".item").forEach((x) => {
      const active = x.dataset.color === JSON.stringify(color)
      const child = x.children[0] as HTMLElement
      child.classList.toggle("bg-gray-800", !active)
      child.classList.toggle("bg-yellow-600", active)
    })
  })
}

// deno-lint-ignore no-explicit-any
export const vscode: any = typeof Deno === "object"
  ? { postMessage: () => {} }
  : acquireVsCodeApi()
function postMessage(message: WebviewMessage) {
  vscode.postMessage(message)
}

const onMessage = async ({ data }: ExtensionMessageEvent) => {
  const { type } = data
  if (type === "init") {
    const img = await loadImage(data.dataUri)
    importImage(img)
    for (const edit of data.edits) {
      currentEdit.update(edit)
    }
  } else if (type === "new") {
    // TODO: Implement new
  } else if (type === "getBytes") {
    postMessage({
      type: "response",
      requestId: data.requestId,
      body: exportImage(currentDataCache),
    })
  } else if (type === "update") {
    const img = await loadImage(data.doc.dataUri)
    importImage(img)
    for (const edit of data.doc.edits) {
      currentEdit.update(edit)
    }
  } else if (type === "nextImages") {
    const preview = document.querySelector(".preview")!
    for (const [filename, dataUri] of data.images) {
      const img = new Image()
      img.src = dataUri
      img.classList.add("crisp-edges")
      preview.appendChild(img)
    }
  }
}
globalThis.addEventListener("message", onMessage)

register(Palette, "js-palette")
register(Tools, "js-tools")
register(MiniCanvas, "js-mini-canvas")
register(Canvas, "js-canvas")
postMessage({ type: "ready" })
