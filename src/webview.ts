// Copyright 2022-2024 Yoshiya Hinosawa. All rights reserved. MIT license.

/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom" />
/// <reference types="@types/vscode-webview" />

import { type Context, register, Signal } from "@kt3k/cell"

import type {
  Color,
  Edit,
  ExtensionMessageEvent,
  Point,
  Stroke,
  WebviewMessage,
} from "./types.ts"

type Tool = "pen" | "fill"
const currentTool = new Signal<Tool>("pen")
type ToolBtn = { tool: Tool; label: string }
const toolBtns: ToolBtn[] = [
  { tool: "pen", label: "✒️" },
  { tool: "fill", label: "🪣" },
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
  [0, 0, 0, 0], // Transparent
  [255, 255, 255, 255],
  [185, 188, 185, 255],
  [106, 109, 106, 255],

  [190, 193, 190, 255],
  [74, 77, 74, 255],
  [0, 0, 0, 255],
  [0, 0, 0, 255],

  [204, 234, 255, 255],
  [104, 165, 255, 255],
  [25, 80, 199, 255],
  [0, 20, 128, 255],

  [221, 222, 255, 255],
  [140, 156, 255, 255],
  [75, 48, 227, 255],
  [31, 0, 138, 255],

  [236, 218, 255, 255],
  [181, 134, 255, 255],
  [115, 34, 214, 255],
  [56, 0, 122, 255],

  [248, 215, 253, 255],
  [217, 117, 253, 255],
  [149, 31, 169, 255],
  [84, 0, 86, 255],

  [252, 213, 245, 255],
  [227, 119, 185, 255],
  [157, 40, 92, 255],
  [90, 0, 25, 255],

  [252, 219, 207, 255],
  [229, 141, 104, 255],
  [152, 54, 0, 255],
  [79, 16, 0, 255],

  [249, 231, 181, 255],
  [212, 157, 41, 255],
  [127, 75, 1, 255],
  [61, 28, 0, 255],

  [241, 240, 170, 255],
  [178, 175, 13, 255],
  [94, 100, 0, 255],
  [37, 50, 0, 255],

  [218, 250, 169, 255],
  [123, 194, 18, 255],
  [35, 118, 1, 255],
  [1, 61, 0, 255],

  [201, 254, 188, 255],
  [86, 201, 71, 255],
  [4, 126, 3, 255],
  [0, 64, 0, 255],

  [194, 250, 215, 255],
  [70, 203, 128, 255],
  [0, 118, 68, 255],
  [1, 57, 36, 255],

  [196, 246, 246, 255],
  [71, 192, 196, 255],
  [0, 110, 138, 255],
  [0, 46, 85, 255],
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

function CanvasBackground(
  { el: canvas, subscribe }: Context<HTMLCanvasElement>,
) {
  const ctx = canvas.getContext("2d")!
  subscribe(baseData, (data) => {
    const S = CELL_SIZE / 2
    const w = data.length
    const h = data[0]?.length || 0
    canvas.width = w * CELL_SIZE
    canvas.height = h * CELL_SIZE || 0
    for (let i = 0; i < w * 2; i++) {
      for (let j = 0; j < h * 2; j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillStyle = "#c0c0c0"
        } else {
          ctx.fillStyle = "#d0d0d0"
        }
        ctx.fillRect(i * S, j * S, S, S)
      }
    }
  })
}

/** Mini Canvas UI Component at the top of the screen */
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
      class="item border border-gray-300 w-11 h-11 flex justify-center items-center cursor-pointer text-2xl"
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
    el.innerHTML = colors.map((color) => {
      const alpha = color[3]
      let alphaLabel = ""
      if (alpha !== 255) {
        alphaLabel = `
          <span
            class="text-white absolute top-0 right-0"
          >
            A${alpha}
          </span>
        `
      }
      return `
        <span
          class="item relative flex items-end w-11 h-11 border border-gray-300 hover:border-gray-500 cursor-pointer font-mono"
          data-color="${JSON.stringify(color)}"
          style="background-color: ${toCssColor(color)}; font-size: 0.5rem;"
        >
          <span
            class="text-white bg-gray-800 bg-opacity-70 absolute bottom-0 w-full text-center"
          >
            ${toHex(color)}
          </span>
          ${alphaLabel}
        </span>
      `
    }).join("\n")
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
export const vscode = typeof (globalThis as any).Deno === "object"
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
    for (const [_filename, dataUri] of data.images) {
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
register(CanvasBackground, "js-canvas-background")
postMessage({ type: "ready" })
