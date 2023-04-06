// Copyright 2022 Yoshiya Hinosawa. All rights reserved. MIT license.
// Copyright 2021 PixelCraft. All rights reserved. MIT license.

window.addEventListener("message", (e) => {
  console.log("got message event in pixeledit webview", e)
})

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
      "," + color[3] + ")"
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

window.onload = function () {
  console.log("onload!!")
  const canvasData = null
  localStorage.getItem("pc-canvas-data")
  if (canvasData) {
    data = JSON.parse(canvasData)
    console.log(data)
    window.colors = data.colors
    if (window.board == undefined) {
      window.board = new Canvas(data.width, data.height)
    }

    const img = new Image()
    img.setAttribute("src", data.url)
    img.addEventListener("load", function () {
      window.board.ctx.drawImage(img, 0, 0)
    })
    window.board.steps = data.steps
    window.board.redo_arr = data.redo_arr
    window.board.setcolor(data.currColor)
  } else {
    newProject()
  }
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

// deno-lint-ignore no-unused-vars
function act(clr) {
  document.querySelectorAll("#palette .item").forEach((x) =>
    x.style.boxShadow = ""
  )
  clr.style.boxShadow = "10px 10px 10px 10px rgba(0,0,0,0.5)"
}

window.onbeforeunload = function () {
  board.saveInLocal()
  return "Data will be lost if you leave the page, are you sure?"
}

window.onerror = function (errorMsg, url, lineNumber) {
  alert("Error: " + errorMsg + " Script: " + url + " Line: " + lineNumber)
}
