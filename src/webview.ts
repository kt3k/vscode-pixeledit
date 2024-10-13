// Copyright 2022-2024 Yoshiya Hinosawa. All rights reserved. MIT license.
// Copyright 2021 PixelCraft. All rights reserved. MIT license.

/// <reference lib="dom" />
/// <reference path="../node_modules/@types/vscode-webview/index.d.ts" />

import { type Context, register } from "@kt3k/cell"

import type {
  Color,
  Edit,
  ExtensionMessageEvent,
  WebviewMessage,
} from "./types.ts"

const vscode = acquireVsCodeApi()

function postMessageToExtention(message: WebviewMessage) {
  vscode.postMessage(message)
}

let board: Board
let tools = [true, false, false]

function toCssColor(c: Color) {
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`
}

function toHex(c: Color) {
  const r = c[0].toString(16).padStart(2, "0")
  const g = c[1].toString(16).padStart(2, "0")
  const b = c[2].toString(16).padStart(2, "0")
  return `#${r}${g}${b}`
}

const Tool = {
  "pen": 0,
  "eraser": 1,
  "fillBucket": 2,
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
      if (tools[Tool.fillBucket]) {
        filler(x, y, this.data[x][y])
      } else if (tools[Tool.eraser]) {
        const temp = this.color
        this.setcolor([0, 0, 0, 0])
        this.draw(x, y)
        this.setcolor(temp)
      } else {
        // Pen tool
        this.draw(x, y, true)
      }
    })
  }

  draw(x: number, y: number, isEdit = false) {
    if (x >= 0 && x < this.dataWidth && y >= 0 && y < this.dataHeight) {
      this.data[x][y] = this.color
      this.ctx.fillRect(
        Math.floor(x * (this.canvasWidth / this.dataWidth)),
        Math.floor(y * (this.canvasHeight / this.dataHeight)),
        Math.floor(this.canvasWidth / this.dataWidth),
        Math.floor(this.canvasHeight / this.dataHeight),
      )
      this.miniCtx.fillRect(x, y, 1, 1)
      if (isEdit) {
        postMessageToExtention({
          type: "edit",
          edit: {
            color: this.color,
            stroke: [[x, y]],
          },
        })
      }
    }
  }

  erase(x: number, y: number) {
    const temp = this.color
    this.setcolor([0, 0, 0, 0])
    this.draw(x, y, true)
    this.setcolor(temp)
  }

  setcolor(color: Color) {
    this.color = color
    this.miniCtx.fillStyle = this.ctx.fillStyle = toCssColor(color)
  }

  setmode(i: number) {
    tools = [false, false, false]
    tools[i] = true
    document.querySelectorAll<HTMLElement>("#toolbar .item").forEach((x, i) => {
      if (tools[i]) x.style.backgroundColor = "grey"
      else x.style.backgroundColor = ""
    })
  }

  async update(dataUri: string, edits: Edit[]) {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)
    await this.importImage(dataUri)
    for (const edit of edits) {
      this.applyEdit(edit)
    }
  }

  applyEdit(edit: Edit) {
    this.setcolor(edit.color)
    for (const [x, y] of edit.stroke) {
      this.draw(x, y, false)
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
            this.setcolor([pixel[0], pixel[1], pixel[2], pixel[3]])
            this.draw(i, j, false)
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

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.src = uri
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
  })
}

/** Palette UI Component */
function Palette({ on, queryAll }: Context) {
  // TODO(kt3k): Get colors from somewhere in disk
  // ex. ./palette.json
  const colors: Color[] = [
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
  ]

  on("click", ".item", (e) => {
    const item = e.target as HTMLElement
    const color = item.dataset.color!.split(",").map(Number) as any as Color
    board.setcolor(color)
    queryAll<HTMLElement>("#palette .item").forEach((x) =>
      x.style.boxShadow = ""
    )
    item.style.boxShadow = "0px 0px 1px 1px white inset"
  })

  return colors.map((color) =>
    `<span
       class="item"
       data-color="${color}"
       style="background-color: ${toCssColor(color)};">
      <span>${toHex(color)}</span>
    </span>`
  ).join("\n")
}

function filler(x: number, y: number, cc: Color) {
  if (x >= 0 && x < board.dataWidth && y >= 0 && y < board.dataHeight) {
    if (
      JSON.stringify(board.data[x][y]) == JSON.stringify(cc) &&
      JSON.stringify(board.data[x][y]) != JSON.stringify(board.color)
    ) {
      board.draw(x, y)
      filler(x + 1, y, cc)
      filler(x, y + 1, cc)
      filler(x - 1, y, cc)
      filler(x, y - 1, cc)
    }
  }
}

globalThis.addEventListener("message", async (e: ExtensionMessageEvent) => {
  console.log("extension -> webview " + e.data.type, e)
  switch (e.data.type) {
    case "init": {
      board = await Board.import(e.data.dataUri, e.data.edits)
      break
    }
    case "new": {
      // to be implemented
      break
    }
    case "getBytes": {
      postMessageToExtention({
        type: "response",
        requestId: e.data.requestId,
        body: board.exportImage(),
      })
      break
    }
    case "update": {
      board.update(e.data.doc.dataUri, e.data.doc.edits)
    }
  }
})

postMessageToExtention({ type: "ready" })
register(Palette, "js-palette")
