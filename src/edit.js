// Copyright 2022 Yoshiya Hinosawa. All rights reserved. MIT license.
// Copyright 2021 PixelCraft. All rights reserved. MIT license.

const Tool = {
  "pen": 0,
  "eraser": 1,
  "fillBucket": 2,
  "line": 3,
  "circle": 4,
  "ellipse": 5,
  "undo": 7,
  "redo": 8,
  "clearCanvas": 9,
}
let tools = [true, false, false, false, false, false]
let lc = []
class Canvas {
  constructor(width, height) {
    this.canvas = document.querySelector("#canvas")
    this.canvas.width = 10 * width
    this.canvas.height = 10 * height
    this.width = width
    this.height = height
    this.canvas.style.display = "block"
    this.canvas.style.height =
      Math.floor((height / width) * this.canvas.clientWidth) + "px"
    this.w = +this.canvas.width
    this.h = +this.canvas.height
    this.ctx = this.canvas.getContext("2d")
    this.ctx.fillStyle = "white"
    this.ctx.globalAlpha = 1
    this.ctx.fillRect(0, 0, this.w, this.h)
    this.data = [...Array(this.width)].map((_e) =>
      Array(this.height).fill([255, 255, 255, 255])
    )
    this.steps = []
    this.redo_arr = []

    this.previous_point = new Point(undefined, undefined)
    // Moved on-click to on-mouse-up to tell the difference
    //  between a click and a mouse-drag + click

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.active) {
        const rect = this.canvas.getBoundingClientRect()
        let x = e.clientX - rect.left
        let y = e.clientY - rect.top
        x = Math.floor(this.width * x / this.canvas.clientWidth)
        y = Math.floor(this.height * y / this.canvas.clientHeight)
        if (tools[Tool.pen]) {
          const p = new Point(x, y)
          if (!p.equals(this.previous_point)) {
            this.previous_point = p
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
      x = Math.floor(this.width * x / this.canvas.clientWidth)
      y = Math.floor(this.height * y / this.canvas.clientHeight)
      if (tools[Tool.pen]) {
        const p = new Point(x, y)
        if (!p.equals(this.previous_point)) {
          this.previous_point = p
          this.draw(p.x, p.y)
        }
      } else if (tools[Tool.eraser]) {
        this.erase(x, y)
      }
    })

    this.canvas.addEventListener("mousedown", (_e) => {
      this.previous_point = new Point(undefined, undefined)
      this.active = true
      console.log("Active")
    })
    this.canvas.addEventListener("mouseup", (e) => {
      this.active = false
      if (this.previous_point.x !== undefined) {
        return // Don't re-paint the last point in a streak
      }

      const rect = this.canvas.getBoundingClientRect()
      let x = e.clientX - rect.left
      let y = e.clientY - rect.top
      x = Math.floor(this.width * x / this.canvas.clientWidth)
      y = Math.floor(this.height * y / this.canvas.clientHeight)
      if (tools[Tool.fillBucket]) {
        filler(x, y, this.data[x][y])
      } else if (tools[Tool.eraser]) {
        const temp = this.color
        const tga = this.ctx.globalAlpha
        this.setcolor([255, 255, 255, 255])
        this.draw(x, y)
        this.setcolor(temp)
        this.ctx.globalAlpha = tga
      } else if (tools[Tool.line]) {
        lc.push(new Point(x, y))
        if (lc.length == 2) {
          const lp = line(lc[0], lc[1])
          lc = []
          for (const p of lp) this.draw(p.x, p.y)
        }
      } else if (tools[Tool.circle]) {
        const centre = new Point(x, y)
        const radius = +prompt("radius?")
        const lp = circle(radius, centre)
        for (const p of lp) this.draw(p.x, p.y)
      } else if (tools[Tool.ellipse]) {
        const center = new Point(x, y)
        const radiusX = +prompt("X radius?")
        const radiusY = +prompt("Y radius?")
        const lp = ellipse(radiusX, radiusY, center)
        for (p of lp) {
          this.draw(p.x, p.y)
        }
      } else {
        this.previous_point = new Point(x, y)
        this.draw(x, y)
      }
    })
  }
  draw(x, y, count) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.data[x][y] = this.color
      this.ctx.fillRect(
        Math.floor(x * (this.w / this.width)),
        Math.floor(y * (this.h / this.height)),
        Math.floor(this.w / this.width),
        Math.floor(this.h / this.height),
      )
      if (
        !count &&
        JSON.stringify(this.steps[this.steps.length - 1]) !==
          JSON.stringify([x, y, this.color, this.ctx.globalAlpha])
      ) {
        this.steps.push([x, y, this.color, this.ctx.globalAlpha])
      }
    }
  }
  erase(x, y) {
    const temp = this.color
    const tga = this.ctx.globalAlpha
    this.setcolor([255, 255, 255, 255])
    this.draw(x, y)
    this.setcolor(temp)
    this.ctx.globalAlpha = tga
  }
  setcolor(color) {
    this.ctx.globalAlpha = 1
    this.color = color
    this.ctx.fillStyle = "rgba(" + color[0] + "," + color[1] + "," + color[2] +
      "," + color[3] + "%)"
  }
  setmode(i) {
    tools = [false, false, false, false, false, false]
    tools[i] = true
    document.querySelectorAll("#toolbar .item").forEach((x, i) => {
      if (tools[i]) x.style.backgroundColor = "grey"
      else x.style.backgroundColor = ""
    })
  }
  save() {
    this.canvas.toBlob(function (blob) {
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.download = "canvas.png"
      link.href = url
      link.click()
    })
  }

  clear() {
    this.ctx.fillStyle = "white"
    this.ctx.fillRect(0, 0, this.w, this.h)
    this.data = [...Array(this.width)].map((_e) =>
      Array(this.height).fill([255, 255, 255, 255])
    )
    this.setcolor(this.color)
    this.setmode(Tool.pen)
  }

  undo() {
    this.clear()
    this.redo_arr.push(this.steps.pop())
    this.steps.forEach((step) => {
      this.setcolor(step[2])
      this.ctx.globalAlpha = step[3]
      this.draw(step[0], step[1], true)
    })
  }

  redo() {
    this.steps.push(this.redo_arr.pop())
    this.steps.forEach((step) => {
      this.setcolor(step[2])
      this.ctx.globalAlpha = step[3]
      this.draw(step[0], step[1], true)
    })
  }

  saveInLocal() {
    const d = {
      "colors": window.colors,
      "currColor": this.color,
      "width": this.width,
      "height": this.height,
      "url": this.canvas.toDataURL(),
      "steps": this.steps,
      "redo_arr": this.redo_arr,
      "dim": window.dim,
    }
    localStorage.setItem("pc-canvas-data", JSON.stringify(d))
  }

  /** Import image from the given external file */
  addImage() {
    const fp = document.createElement("input")
    fp.type = "file"
    fp.click()
    fp.onchange = (e) => {
      const reader = new FileReader()
      reader.readAsDataURL(e.target.files[0])
      reader.onload = () => {
        const uimg = new Image()
        uimg.src = reader.result
        uimg.width = this.w
        uimg.height = this.h
        uimg.onload = () => {
          const pxc = document.createElement("canvas")
          pxc.width = this.w
          pxc.height = this.h
          const pxctx = pxc.getContext("2d")
          pxctx.drawImage(uimg, 0, 0, this.w, this.h)
          for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
              let ctr = 0
              let avg = [0, 0, 0, 0]
              const pix = pxctx.getImageData(10 * i, 10 * j, 10, 10).data
              pix.forEach((x, k) => {
                avg[k % 4] += x
                if (k % 4 == 0) ctr++
              })
              avg = avg.map((x) => ~~(x / ctr))
              this.setcolor(avg)
              this.draw(i, j)
            }
          }
        }
      }
    }
  }

  importImage(uri) {
    console.log("importImage")
    const uimg = new Image()
    uimg.src = uri
    uimg.width = this.width
    uimg.height = this.height
    uimg.onload = () => {
      console.log("importImage onload")
      const pxc = document.createElement("canvas")
      document.body.appendChild(pxc)
      pxc.width = this.width
      pxc.height = this.height
      const pxctx = pxc.getContext("2d")
      pxctx.drawImage(uimg, 0, 0, this.width, this.height)
      for (let i = 0; i < this.width; i++) {
        for (let j = 0; j < this.height; j++) {
          let avg = [0, 0, 0, 0]
          const pix = pxctx.getImageData(i, j, 1, 1).data
          pix.forEach((x, k) => {
            avg[k] += x
          })
          this.setcolor(avg)
          this.draw(i, j)
        }
      }
    }
  }
}
class Popup {
  constructor(s) {
    this.s = s
    document.querySelector(this.s).style.display = "block"
    document.querySelector(this.s).style.transform =
      "translate(-50%,-50%) scale(1,1)"
  }
  close() {
    document.querySelector(this.s).style.transform =
      "translate(-50%,-50%) scale(0,0)"
  }
}

function initPalette() {
  console.log("onload!!")
  document.querySelector("#palette").innerHTML = colors.map((x) =>
    `<span class="item" style="background-color: rgb(${x[0]},${x[1]},${
      x[2]
    })" onclick="board.setcolor([${x}]);act(this);" oncontextmenu="board.setcolor([${x}]);act(this);board.ctx.globalAlpha=+prompt('Transparency(0-1)?')"></span>`
  ).join("\n")

  document.querySelector("#palette").addEventListener(
    "contextmenu",
    (e) => e.preventDefault(),
  )
}

document.querySelector("#close").onclick = function () {
  const width = +document.querySelector("#width").value
  const height = +document.querySelector("#height").value
  if (window.board == undefined) {
    window.board = new Canvas(width, height)
  }
  window.board.canvas.width = 10 * width //display each pixel in 10 by 10pxs
  window.board.canvas.height = 10 * height
  window.board.width = width //Dimentions of x pixels
  window.board.height = height //Dimentions of Y pixels
  window.board.canvas.style.display = "block"
  window.board.canvas.style.height =
    Math.floor((height / width) * window.board.canvas.clientWidth) + "px"
  window.board.w = +window.board.canvas.width
  window.board.h = +window.board.canvas.height
  window.board.ctx = window.board.canvas.getContext("2d")
  window.board.ctx.fillStyle = "white"
  window.board.ctx.globalAlpha = 1
  window.board.ctx.fillRect(0, 0, window.board.w, window.board.h)
  window.board.data = [...Array(window.board.width)].map((_e) =>
    Array(window.board.height).fill([255, 255, 255, 255])
  )
  window.board.steps = []
  window.board.redo_arr = []

  window.board.setcolor([0, 0, 0, 255])
  window.dim.close()
}

function newProject() {
  localStorage.removeItem("pc-canvas-data")
  window.dim = new Popup("#popup")
  window.colors = [
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
function filler(x, y, cc) {
  if (x >= 0 && x < board.width && y >= 0 && y < board.height) {
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
function matrixMult(a, b) {
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

/*
 *  function Template
 *
 *  function Shape_name(data){
 * 	//data -> parameters Required for the Shape
 * 	let points = [];
 *
 * 	// Calculate points
 *
 * 	return points;
 * }
 *
 * example:
 * 	function line(x0, y0, x1, y1){
 * 	  //x0, y0 -> Initial Points of Line
 * 	  //x1, y1 ->  End Points of the line
 *        let points = []
 *
 * 	  //Calculate points
 *
 * 	  return points
 */

class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
  equals(point) {
    return ((this.x == point.x) && (this.y == point.y))
  }
}

function line(p1, p2) {
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

function circle(r, pc) {
  /* This function returns points of Circle with radius r and center as pc*/

  let points = []
  let x = 0
  let y = r
  points.push(new Point(x, y))
  p = 1 - r

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

function _sym8(points) {
  /* This is a helper function for circle which calculates points on all the 8 symmetries */
  const nPoints = []

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

function ellipse(rx, ry, pc) {
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

function _sym4(points) {
  /* This is a helper function for ellipse which calculates points on all the 4 symmetries */
  const nPoints = []

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
/*
 *  function Template
 *
 *  function transformation_name(points, others){
 * 	//points -> array of point of object
 * 	//others -> any othee parameters the specific transformation requires
 *
 * 	return points;//This is the tranaformed Points
 *  }
 *
 *  example:
 *  	function translation(points, tPoint){
 *  	  //points -> array of point of Object
 * 	  //tPoint -> Points to be Translated
 *
 * 	  //Do Processing
 *
 * 	  return points;//This is translated points
 * 	}
 */

// deno-lint-ignore no-unused-vars
function translate(points, pt) {
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
function scale(points, sx, sy, pf) {
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
function rotate(points, angle, pf) {
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
function act(clr) {
  document.querySelectorAll("#palette .item").forEach((x) =>
    x.style.boxShadow = ""
  )
  clr.style.boxShadow = "10px 10px 10px 10px rgba(0,0,0,0.5)"
}

globalThis.addEventListener("message", (e) => {
  console.log("got message event in pixeledit webview", e)
  switch (e.data?.type) {
    case "init": {
      const base64 = btoa(String.fromCharCode(...e.data.bytes?.data))
      const data = {}
      // TODO(kt3k): Get width and height from the source png.
      data.width = 32
      data.height = 32
      // TODO(kt3k): Get colors from somewhere in disk
      window.colors = [
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
      if (window.board == undefined) {
        window.board = new Canvas(data.width, data.height)
      }

      window.board.importImage("data:image/png;base64," + base64)
      //window.board.steps = data.steps
      //window.board.redo_arr = data.redo_arr
      //window.board.setcolor(data.currColor)
    
      break
    }
    case "new": {
      newProject()
      break
    }
  }
  initPalette();
})

acquireVsCodeApi().postMessage({ type: "ready" })
