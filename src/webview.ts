// Copyright 2022-2023 Yoshiya Hinosawa. All rights reserved. MIT license.
// Copyright 2021 PixelCraft. All rights reserved. MIT license.

/// <reference lib="dom" />

type Color = import("./types").Color
type Edit = import("./types").Edit
type WebviewMessage = import("./types").WebviewMessage
type ExtensionMessageEvent = import("./types").ExtensionMessageEvent

const vscode = acquireVsCodeApi()

function postMessageToExtention(message: WebviewMessage) {
  vscode.postMessage(message)
}

let board: Board
let colors: Color[]
let dim: Popup

function toCssColor(c: Color): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`
}

const Tool = {
  "pen": 0,
  "eraser": 1,
  "fillBucket": 2,
  "line": 3,
  "circle": 4,
  "ellipse": 5,
}

let tools = [true, false, false, false, false, false]
let lc: Point[] = []
class Board {
  /** The canvas */
  canvas: HTMLCanvasElement
  /** The canvas context */
  ctx: CanvasRenderingContext2D
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
  prevPoint: Point | undefined
  active = false
  color: Color = [0, 0, 0, 0]
  constructor(width: number, height: number) {
    this.canvas = document.querySelector("#canvas")!
    this.canvas.width = 10 * width
    this.canvas.height = 10 * height
    this.dataWidth = width
    this.dataHeight = height
    this.canvas.style.display = "block"
    this.canvas.style.height =
      Math.floor((height / width) * this.canvas.clientWidth) + "px"
    this.canvasWidth = +this.canvas.width
    this.canvasHeight = +this.canvas.height
    this.ctx = this.canvas.getContext("2d")!
    this.ctx.fillStyle = "rgba(255,255,255,0)"
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight)
    this.data = [...Array(this.dataWidth)].map((_e) =>
      Array(this.dataHeight).fill([255, 255, 255, 0])
    )

    this.prevPoint = undefined

    // Moved on-click to on-mouse-up to tell the difference
    //  between a click and a mouse-drag + click
    this.canvas.addEventListener("mousemove", (e) => {
      if (this.active) {
        const rect = this.canvas.getBoundingClientRect()
        let x = e.clientX - rect.left
        let y = e.clientY - rect.top
        x = Math.floor(this.dataWidth * x / this.canvas.clientWidth)
        y = Math.floor(this.dataHeight * y / this.canvas.clientHeight)
        if (tools[Tool.pen]) {
          const p = new Point(x, y)
          if (!p.equals(this.prevPoint)) {
            this.prevPoint = p
            this.draw(p.x, p.y)
          }
        } else if (tools[Tool.eraser]) {
          this.erase(x, y)
        }
      }
    })

    this.canvas.addEventListener("touchmove", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      let x = e.touches[0].clientX - rect.left
      let y = e.touches[0].clientY - rect.top
      x = Math.floor(this.dataWidth * x / this.canvas.clientWidth)
      y = Math.floor(this.dataHeight * y / this.canvas.clientHeight)
      if (tools[Tool.pen]) {
        const p = new Point(x, y)
        if (!p.equals(this.prevPoint)) {
          this.prevPoint = p
          this.draw(p.x, p.y)
        }
      } else if (tools[Tool.eraser]) {
        this.erase(x, y)
      }
    })

    this.canvas.addEventListener("mousedown", (_e) => {
      this.prevPoint = undefined
      this.active = true
    })

    this.canvas.addEventListener("mouseup", (e) => {
      this.active = false
      if (this.prevPoint !== undefined) {
        return // Don't re-paint the last point in a streak
      }

      const rect = this.canvas.getBoundingClientRect()
      let x = e.clientX - rect.left
      let y = e.clientY - rect.top
      x = Math.floor(this.dataWidth * x / this.canvas.clientWidth)
      y = Math.floor(this.dataHeight * y / this.canvas.clientHeight)
      if (tools[Tool.fillBucket]) {
        filler(x, y, this.data[x][y])
      } else if (tools[Tool.eraser]) {
        const temp = this.color
        this.setcolor([255, 255, 255, 255])
        this.draw(x, y)
        this.setcolor(temp)
      } else if (tools[Tool.line]) {
        lc.push(new Point(x, y))
        if (lc.length == 2) {
          const lp = line(lc[0], lc[1])
          lc = []
          for (const p of lp) this.draw(p.x, p.y)
        }
      } else if (tools[Tool.circle]) {
        const centre = new Point(x, y)
        const radius = +prompt("radius?")!
        const lp = circle(radius, centre)
        for (const p of lp) this.draw(p.x, p.y)
      } else if (tools[Tool.ellipse]) {
        const center = new Point(x, y)
        const radiusX = +prompt("X radius?")!
        const radiusY = +prompt("Y radius?")!
        const lp = ellipse(radiusX, radiusY, center)
        for (const p of lp) {
          this.draw(p.x, p.y)
        }
      } else {
        // Pen tool
        this.prevPoint = new Point(x, y)
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

  clear() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)
  }

  erase(x: number, y: number) {
    const temp = this.color
    this.setcolor([0, 0, 0, 0])
    this.draw(x, y, true)
    this.setcolor(temp)
  }

  setcolor(color: Color) {
    this.color = color
    this.ctx.fillStyle = toCssColor(color)
  }

  setmode(i: number) {
    tools = [false, false, false, false, false, false]
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

  static async import(uri: string): Promise<Board> {
    const img = await loadImage(uri)
    const board = new Board(img.width, img.height)
    await board.importImage(uri)
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

class Popup {
  s: string
  constructor(s: string) {
    this.s = s
    document.querySelector<HTMLElement>(this.s)!.style.display = "block"
    document.querySelector<HTMLElement>(this.s)!.style.transform =
      "translate(-50%,-50%) scale(1,1)"
  }
  close() {
    document.querySelector<HTMLElement>(this.s)!.style.transform =
      "translate(-50%,-50%) scale(0,0)"
  }
}

function initPalette() {
  document.querySelector("#palette")!.innerHTML = colors.map((x) =>
    `<span class="item" style="background-color: rgb(${x[0]},${x[1]},${
      x[2]
    })" onclick="board.setcolor([${x}]);act(this);"></span>`
  ).join("\n")

  document.querySelector("#palette")!.addEventListener(
    "contextmenu",
    (e) => e.preventDefault(),
  )
}

document.querySelector<HTMLElement>("#close")!.onclick = function () {
  const width = +document.querySelector<HTMLInputElement>("#width")!.value
  const height = +document.querySelector<HTMLInputElement>("#height")!.value
  if (board == undefined) {
    board = new Board(width, height)
  }
  board.canvas.width = 10 * width //display each pixel in 10 by 10pxs
  board.canvas.height = 10 * height
  board.dataWidth = width //Dimentions of x pixels
  board.dataHeight = height //Dimentions of Y pixels
  board.canvas.style.display = "block"
  board.canvas.style.height =
    Math.floor((height / width) * board.canvas.clientWidth) + "px"
  board.canvasWidth = +board.canvas.width
  board.canvasHeight = +board.canvas.height
  board.ctx = board.canvas.getContext("2d")!
  board.ctx.fillStyle = "white"
  board.ctx.fillRect(0, 0, board.canvasWidth, board.canvasHeight)
  board.data = [...Array(board.dataWidth)].map((_e) =>
    Array(board.dataHeight).fill([255, 255, 255, 255])
  )

  board.setcolor([0, 0, 0, 255])
  dim.close()
}

function newProject() {
  localStorage.removeItem("pc-canvas-data")
  dim = new Popup("#popup")
  colors = [
    [0, 0, 0, 255],
    [127, 127, 127, 255],
    [136, 0, 21, 255],
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

/** This function Multiplies two Matrices (a, b) */
function matrixMult(a: number[][], b: number[][]) {
  const aNumRows = a.length
  const aNumCols = a[0].length
  const bNumCols = b[0].length
  const m = new Array(aNumRows) // initialize array of rows
  for (let r = 0; r < aNumRows; ++r) {
    m[r] = new Array(bNumCols) // initialize the current row
    for (let c = 0; c < bNumCols; ++c) {
      m[r][c] = 0 // initialize the current cell
      for (let i = 0; i < aNumCols; ++i) {
        m[r][c] += a[r][i] * b[i][c]
      }
    }
  }
  return m
}

class Point {
  constructor(public x: number, public y: number) {
  }
  equals(point: Point | undefined) {
    if (point === undefined) {
      return false
    }
    return ((this.x == point.x) && (this.y == point.y))
  }
}

function line(p1: Point, p2: Point) {
  /* this function calculates the points of the line with endpoints p1 &p2
	 */
  const points = []
  const dx = Math.abs(p2.x - p1.x)
  const sx = p1.x < p2.x ? 1 : -1
  const dy = -Math.abs(p2.y - p1.y)
  const sy = p1.y < p2.y ? 1 : -1
  let err = dx + dy

  let x1 = p1.x
  let y1 = p1.y
  while (true) {
    points.push(new Point(x1, y1))
    if (x1 == p2.x && y1 == p2.y) {
      break
    }
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x1 += sx
    }

    if (e2 <= dx) {
      err += dx
      y1 += sy
    }
  }
  return points
}

function circle(r: number, pc: Point) {
  /* This function returns points of Circle with radius r and center as pc*/

  let points = []
  let x = 0
  let y = r
  points.push(new Point(x, y))
  let p = 1 - r

  while (x <= y) {
    //conditions
    x++

    if (p < 0) {
      points.push(new Point(x, y))
      p = p + (2 * x) + 1
    } else if (p >= 0) {
      y--
      points.push(new Point(x, y))
      p = p + (2 * x) + 1 - (2 * y)
    }
  }

  points = _sym8(points)
  for (const pt of points) {
    pt.x += pc.x
    pt.y += pc.y
  }

  return points
}

function _sym8(points: Point[]) {
  /* This is a helper function for circle which calculates points on all the 8 symmetries */
  const nPoints: Point[] = []

  Array.prototype.push.apply(nPoints, points)

  for (const p of points) {
    nPoints.push(new Point(p.y, p.x))
  }
  for (const p of points) {
    nPoints.push(new Point(-p.y, p.x))
  }
  for (const p of points) {
    nPoints.push(new Point(-p.x, p.y))
  }
  for (const p of points) {
    nPoints.push(new Point(-p.x, -p.y))
  }
  for (const p of points) {
    nPoints.push(new Point(-p.y, -p.x))
  }
  for (const p of points) {
    nPoints.push(new Point(p.y, -p.x))
  }
  for (const p of points) {
    nPoints.push(new Point(p.x, -p.y))
  }
  return nPoints
}

function ellipse(rx: number, ry: number, pc: Point) {
  /* This function return the points of the ellipse with major axis rx and minor axis ry with center pc */
  let points = []
  let x = 0
  let y = ry
  points.push(new Point(x, y))

  //Region 1
  let p1 = Math.pow(ry, 2) + (1 / 4) * Math.pow(rx, 2) - Math.pow(rx, 2) * ry

  while ((2 * Math.pow(ry, 2) * x) < (2 * Math.pow(rx, 2) * y)) {
    x++
    console.log(x)
    if (p1 < 0) {
      points.push(new Point(x, y))
      p1 = p1 + 2 * Math.pow(ry, 2) * x + Math.pow(ry, 2)
    } else {
      y--
      points.push(new Point(x, y))
      p1 = p1 + 2 * Math.pow(ry, 2) * x - 2 * Math.pow(rx, 2) * y +
        Math.pow(ry, 2)
    }
  }

  //Region 2
  let x0 = points[points.length - 1].x
  let y0 = points[points.length - 1].y

  let p2 = Math.pow(ry, 2) * Math.pow(x0 + 1 / 2, 2) +
    Math.pow(rx, 2) * Math.pow(y0 - 1, 2) - Math.pow(rx, 2) * Math.pow(ry, 2)

  while (y0 >= 0) {
    y0--

    if (p2 < 0) {
      points.push(new Point(x0, y0))
      p2 = p2 - 2 * Math.pow(rx, 2) * y0 + Math.pow(rx, 2)
    } else {
      x0++
      points.push(new Point(x0, y0))
      p2 = p2 + 2 * Math.pow(ry, 2) * x0 - 2 * Math.pow(rx, 2) * y0 +
        Math.pow(rx, 2)
    }
  }
  points = _sym4(points)
  for (const pt of points) {
    pt.x += pc.x
    pt.y += pc.y
  }
  return points
}

function _sym4(points: Point[]) {
  /* This is a helper function for ellipse which calculates points on all the 4 symmetries */
  const nPoints: Point[] = []

  Array.prototype.push.apply(nPoints, points)

  for (const p of points) {
    nPoints.push(new Point(-p.x, p.y))
  }
  for (const p of points) {
    nPoints.push(new Point(-p.x, -p.y))
  }
  for (const p of points) {
    nPoints.push(new Point(p.x, -p.y))
  }
  return nPoints
}

// deno-lint-ignore no-unused-vars
function translate(points: Point[], pt: Point) {
  /* This function translates the object to the new co-ords by pt units */

  for (const p of points) {
    const a = [
      [p.x],
      [p.y],
      [1],
    ]
    const transMatrix = [
      [1, 0, pt.x],
      [0, 1, pt.y],
      [0, 0, 1],
    ]
    const ans = matrixMult(transMatrix, a)

    p.x = ans[0][0]
    p.y = ans[1][0]
  }
  return points
}

// deno-lint-ignore no-unused-vars
function scale(points: Point[], sx: number, sy: number, pf: Point) {
  /* This function Scales the object  with sx along x-axis and sy along y-axis with a fixed point pf */
  for (const p of points) {
    const a = [
      [p.x],
      [p.y],
      [1],
    ]
    const scaMatrix = [
      [sx, 0, 0],
      [0, sy, 0],
      [0, 0, 1],
    ]

    const transToMatrix = [
      [1, 0, -pf.x],
      [0, 1, -pf.y],
      [0, 0, 1],
    ]

    const transBackMatrix = [
      [1, 0, pf.x],
      [0, 1, pf.y],
      [0, 0, 1],
    ]
    let ans = matrixMult(transToMatrix, a)
    ans = matrixMult(scaMatrix, ans)
    ans = matrixMult(transBackMatrix, ans)

    p.x = ans[0][0]
    p.y = ans[1][0]
  }
  return points
}

// deno-lint-ignore no-unused-vars
function rotate(points: Point[], angle: number, pf: Point) {
  /* This function rotates the object with angle with respect to fixed Point pf */
  angle = angle * (Math.PI / 180.0)
  for (const p of points) {
    const a = [
      [p.x],
      [p.y],
      [1],
    ]
    const rotMatrix = [
      [Math.cos(angle), -Math.sin(angle), 0],
      [Math.sin(angle), Math.cos(angle), 0],
      [0, 0, 1],
    ]

    const transToMatrix = [
      [1, 0, -pf.x],
      [0, 1, -pf.y],
      [0, 0, 1],
    ]

    const transBackMatrix = [
      [1, 0, pf.x],
      [0, 1, pf.y],
      [0, 0, 1],
    ]
    let ans = matrixMult(transToMatrix, a)
    ans = matrixMult(rotMatrix, ans)
    ans = matrixMult(transBackMatrix, ans)

    p.x = ans[0][0]
    p.y = ans[1][0]
  }

  return points
}

// deno-lint-ignore no-unused-vars
function act(clr: HTMLElement) {
  document.querySelectorAll<HTMLElement>("#palette .item").forEach((x) =>
    x.style.boxShadow = ""
  )
  clr.style.boxShadow = "10px 10px 10px 10px rgba(0,0,0,0.5)"
}

type MessageData = {
  type: "init"
  bytes: string
} | {
  type: "new"
} | {
  type: "getBytes"
  requestId: number
} | {
  type: "update"
  doc: {
    bytes: string
    edits: Edit[]
  }
}

globalThis.addEventListener("message", async (e: ExtensionMessageEvent) => {
  console.log("extension -> webview " + e.data.type, e)
  switch (e.data.type) {
    case "init": {
      // TODO(kt3k): Get colors from somewhere in disk
      // ex. ./pixeledit.json
      colors = [
        [0, 0, 0, 255],
        [127, 127, 127, 255],
        [136, 0, 21, 255],
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
      board = await Board.import(e.data.dataUri)
      initPalette()
      break
    }
    case "new": {
      newProject()
      initPalette()
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
