// Copyright 2022-2024 Yoshiya Hinosawa. All rights reserved. MIT license.
// Copyright 2021 PixelCraft. All rights reserved. MIT license.

/// <reference lib="dom" />
/// <reference path="../node_modules/@types/vscode-webview/index.d.ts" />

import { type Context, register, Signal } from "@kt3k/cell"

import type {
  Color,
  Edit,
  ExtensionMessageEvent,
  WebviewMessage,
} from "./types.ts"

let board: Board

type Tool = "pen" | "eraser" | "fill"
const currentTool = new Signal<Tool>("pen")
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

function toCssColor(c: Color) {
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`
}

function toHex(c: Color) {
  const r = c[0].toString(16).padStart(2, "0")
  const g = c[1].toString(16).padStart(2, "0")
  const b = c[2].toString(16).padStart(2, "0")
  return "#" + r + g + b
}

function saveEdit(stroke: [number, number][], color: Color) {
  postMessage({
    type: "edit",
    edit: {
      color,
      stroke,
    },
  })
}

class Board {
  /** The canvas */
  canvas: HTMLCanvasElement
  /** The canvas */
  miniCanvas: HTMLCanvasElement
  /** The canvas context */
  ctx: CanvasRenderingContext2D
  /** The canvas context */
  miniCtx: CanvasRenderingContext2D
  /** Image data width */
  dataWidth: number
  /** Image data height */
  dataHeight: number
  /** Canvas element width */
  canvasWidth: number
  /** Canvas element height */
  canvasHeight: number
  /** pixel data array */
  data: Color[][]
  color: Color = [0, 0, 0, 0]
  constructor(dataWidth: number, dataHeight: number) {
    document.querySelector<HTMLElement>(".mini-canvas-wrapper")!.classList
      .toggle("hidden", false)
    this.canvas = document.querySelector("#canvas")!
    this.miniCanvas = document.querySelector("#canvas-mini")!
    this.canvas.width = 10 * dataWidth
    this.canvas.height = 10 * dataHeight
    this.miniCanvas.width = dataWidth
    this.miniCanvas.height = dataHeight
    this.dataWidth = dataWidth
    this.dataHeight = dataHeight
    this.canvas.style.display = "block"
    this.canvas.style.height =
      Math.floor((dataHeight / dataWidth) * this.canvas.clientWidth) + "px"
    this.canvasWidth = +this.canvas.width
    this.canvasHeight = +this.canvas.height
    this.ctx = this.canvas.getContext("2d")!
    this.miniCtx = this.miniCanvas.getContext("2d")!
    this.ctx.fillStyle = "rgba(255,255,255,0)"
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight)
    this.miniCtx.fillStyle = "rgba(255,255,255,0)"
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight)
    this.data = [...Array(this.dataWidth)].map((_e) =>
      Array(this.dataHeight).fill([255, 255, 255, 0])
    )

    this.canvas.addEventListener("mouseup", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      let x = e.clientX - rect.left
      let y = e.clientY - rect.top
      x = Math.floor(this.dataWidth * x / this.canvas.clientWidth)
      y = Math.floor(this.dataHeight * y / this.canvas.clientHeight)
      if (!this.validCoords(x, y)) {
        return
      }
      if (currentTool.get() === "fill") {
        filler(x, y, this.data[x][y])
      } else if (currentTool.get() === "eraser") {
        this.draw(x, y, [0, 0, 0, 0])
        saveEdit([[x, y]], [0, 0, 0, 0])
      } else {
        // Pen tool
        this.draw(x, y, currentColor.get())
        saveEdit([[x, y]], currentColor.get())
      }
    })
  }

  validCoords(x: number, y: number) {
    return x >= 0 && x < this.dataWidth && y >= 0 && y < this.dataHeight
  }

  draw(x: number, y: number, color: Color) {
    this.data[x][y] = color
    this.ctx.clearRect(
      Math.floor(x * (this.canvasWidth / this.dataWidth)),
      Math.floor(y * (this.canvasHeight / this.dataHeight)),
      Math.floor(this.canvasWidth / this.dataWidth),
      Math.floor(this.canvasHeight / this.dataHeight),
    )
    this.ctx.fillStyle = toCssColor(color)
    this.ctx.fillRect(
      Math.floor(x * (this.canvasWidth / this.dataWidth)),
      Math.floor(y * (this.canvasHeight / this.dataHeight)),
      Math.floor(this.canvasWidth / this.dataWidth),
      Math.floor(this.canvasHeight / this.dataHeight),
    )
    this.miniCtx.clearRect(x, y, 1, 1)
    this.miniCtx.fillStyle = toCssColor(color)
    this.miniCtx.fillRect(x, y, 1, 1)
  }

  async update(dataUri: string, edits: Edit[]) {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)
    await this.importImage(dataUri)
    for (const edit of edits) {
      this.applyEdit(edit)
    }
  }

  applyEdit(edit: Edit) {
    for (const [x, y] of edit.stroke) {
      this.draw(x, y, edit.color)
    }
  }

  importImage(uri: string): Promise<void> {
    const uimg = new Image()
    uimg.src = uri
    uimg.width = this.dataWidth
    uimg.height = this.dataHeight
    return new Promise<void>((resolve, reject) => {
      uimg.onload = () => {
        const pxc = document.createElement("canvas")
        pxc.width = this.dataWidth
        pxc.height = this.dataHeight
        const pxctx = pxc.getContext("2d")!
        pxctx.drawImage(uimg, 0, 0, this.dataWidth, this.dataHeight)
        for (let i = 0; i < this.dataWidth; i++) {
          for (let j = 0; j < this.dataHeight; j++) {
            const pixel = pxctx.getImageData(i, j, 1, 1).data
            this.draw(i, j, [pixel[0], pixel[1], pixel[2], pixel[3]])
          }
        }
        resolve()
      }
      uimg.onerror = (e) => reject(e)
    })
  }

  static async import(uri: string, edits: Edit[]): Promise<Board> {
    const img = await loadImage(uri)
    const board = new Board(img.width, img.height)
    await board.importImage(uri)
    for (const edit of edits) {
      board.applyEdit(edit)
    }
    return board
  }

  exportImage() {
    const canvas = document.createElement("canvas")
    canvas.width = this.dataWidth
    canvas.height = this.dataHeight
    const ctx = canvas.getContext("2d")!
    this.data.forEach((row, i) => {
      row.forEach((color, j) => {
        ctx.fillStyle = toCssColor(color)
        ctx.fillRect(i, j, 1, 1)
      })
    })
    return canvas.toDataURL("image/png")
  }
}

function filler(x: number, y: number, cc: Color) {
  if (x >= 0 && x < board.dataWidth && y >= 0 && y < board.dataHeight) {
    if (
      JSON.stringify(board.data[x][y]) == JSON.stringify(cc) &&
      JSON.stringify(board.data[x][y]) != JSON.stringify(currentColor.get())
    ) {
      board.draw(x, y, currentColor.get())
      filler(x + 1, y, cc)
      filler(x, y + 1, cc)
      filler(x - 1, y, cc)
      filler(x, y - 1, cc)
    }
  }
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
function Tools({ on, queryAll }: Context) {
  on("click", ".item", ({ target }) => {
    const item = target as HTMLElement
    // deno-lint-ignore no-explicit-any
    currentTool.update(item.dataset.tool as any)
    queryAll<HTMLElement>(".item").forEach((x) => {
      x.classList.toggle("bg-gray-500", false)
    })
    item.classList.toggle("bg-gray-500", true)
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
      if (x.dataset.color === JSON.stringify(color)) {
        x.style.boxShadow = "0px 0px 1px 1px white inset"
      } else {
        x.style.boxShadow = ""
      }
    })
  })
}

const vscode = acquireVsCodeApi()
function postMessage(message: WebviewMessage) {
  vscode.postMessage(message)
}

globalThis.addEventListener("message", async (e: ExtensionMessageEvent) => {
  console.log("extension -> webview " + e.data.type, e)
  switch (e.data.type) {
    case "init": {
      board = await Board.import(e.data.dataUri, e.data.edits)
      break
    }
    case "new": {
      // TODO: Implement new
      break
    }
    case "getBytes": {
      postMessage({
        type: "response",
        requestId: e.data.requestId,
        body: board.exportImage(),
      })
      break
    }
    case "update": {
      board.update(e.data.doc.dataUri, e.data.doc.edits)
      break
    }
  }
})

register(Palette, "js-palette")
register(Tools, "js-tools")
postMessage({ type: "ready" })
