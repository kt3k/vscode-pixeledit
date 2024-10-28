// Copyright 2022-2024 Yoshiya Hinosawa. All rights reserved. MIT license.
// Copyright 2021 PixelCraft. All rights reserved. MIT license.

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

let board: Board

type Tool = "pen" | "eraser" | "fill"
const currentTool = new Signal<Tool>("pen")
type ToolBtn = { tool: Tool; label: string }
const toolBtns: ToolBtn[] = [
  { tool: "pen", label: "✒️" },
  { tool: "eraser", label: "消" },
  { tool: "fill", label: "塗" },
]

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
const currentColor = new Signal<Color>([0, 0, 0, 255])
const imageData = new Signal<Color[][]>([])
const currentEdit = new Signal<Edit>({ color: [0, 0, 0, 0], stroke: [] })

export function toCssColor(c: Color) {
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`
}

export function toHex(c: Color) {
  const r = c[0].toString(16).padStart(2, "0")
  const g = c[1].toString(16).padStart(2, "0")
  const b = c[2].toString(16).padStart(2, "0")
  return "#" + r + g + b
}

const CELL_SIZE = 10

class Board {
  /** The canvas */
  canvas: HTMLCanvasElement
  /** The canvas context */
  ctx: CanvasRenderingContext2D
  /** The canvas context */
  miniCtx: CanvasRenderingContext2D
  /** Image data width */
  dataWidth: number
  /** Image data height */
  dataHeight: number
  /** pixel data array */
  data: Color[][]
  color: Color = [0, 0, 0, 0]
  constructor(img: HTMLImageElement) {
    const dataWidth = img.width
    const dataHeight = img.height
    this.canvas = document.querySelector("#canvas")!
    const miniCanvas = document.querySelector<HTMLCanvasElement>(
      "#canvas-mini",
    )!
    this.canvas.width = CELL_SIZE * dataWidth
    this.canvas.height = CELL_SIZE * dataHeight
    miniCanvas.width = dataWidth
    miniCanvas.height = dataHeight
    this.dataWidth = dataWidth
    this.dataHeight = dataHeight
    this.ctx = this.canvas.getContext("2d")!
    this.miniCtx = miniCanvas.getContext("2d")!

    this.data = [...Array(this.dataWidth)].map((_e) =>
      Array(this.dataHeight).fill([255, 255, 255, 0])
    )
    this.canvas.addEventListener("mouseup", (e) => this.onMouseUp(e))
    this.importImage(img)
  }

  onMouseUp(e: MouseEvent) {
    const { dataWidth, dataHeight } = this
    const rect = this.canvas.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top
    x = Math.floor(dataWidth * x / this.canvas.clientWidth)
    y = Math.floor(dataHeight * y / this.canvas.clientHeight)
    if (!(x >= 0 && x < this.dataWidth && y >= 0 && y < this.dataHeight)) {
      return
    }
    let edit: Edit
    const tool = currentTool.get()
    if (tool === "fill") {
      edit = {
        color: currentColor.get(),
        stroke: fill(x, y, dataWidth, dataHeight, this.data[x][y]),
      }
    } else if (tool === "eraser") {
      edit = {
        color: [0, 0, 0, 0],
        stroke: [[x, y]],
      }
    } else {
      // Pen tool
      edit = {
        color: currentColor.get(),
        stroke: [[x, y]],
      }
    }
    this.drawEdit(edit)
    postMessage({ type: "edit", edit })
  }

  drawEdit(edit: Edit) {
    for (const [x, y] of edit.stroke) {
      this.drawPoint(x, y, edit.color)
    }
  }

  drawPoint(x: number, y: number, color: Color) {
    this.data[x][y] = color
    drawPoint(this.ctx, x, y, CELL_SIZE, color)
    drawPoint(this.miniCtx, x, y, 1, color)
  }

  importImage(img: HTMLImageElement) {
    const canvas = document.createElement("canvas")
    canvas.width = this.dataWidth
    canvas.height = this.dataHeight
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(img, 0, 0, this.dataWidth, this.dataHeight)
    for (let x = 0; x < this.dataWidth; x++) {
      for (let y = 0; y < this.dataHeight; y++) {
        const { data } = ctx.getImageData(x, y, 1, 1)
        this.drawPoint(x, y, [data[0], data[1], data[2], data[3]])
      }
    }
  }
}

function exportImage(data: Color[][]) {
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
  //console.log(key)
  if (cache.has(key)) {
    return
  }
  cache.add(key)

  if (x < 0 || x >= dataWidth || y < 0 || y >= dataHeight) {
    return
  }
  const color = board.data[x][y]
  console.log("color", color)
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
    board = new Board(img)
    for (const edit of data.edits) {
      board.drawEdit(edit)
    }
  } else if (type === "new") {
    // TODO: Implement new
  } else if (type === "getBytes") {
    postMessage({
      type: "response",
      requestId: data.requestId,
      body: exportImage(board.data),
    })
  } else if (type === "update") {
    const img = await loadImage(data.doc.dataUri)
    board.importImage(img)
    for (const edit of data.doc.edits) {
      board.drawEdit(edit)
    }
  }
}
globalThis.addEventListener("message", onMessage)

register(Palette, "js-palette")
register(Tools, "js-tools")
postMessage({ type: "ready" })
