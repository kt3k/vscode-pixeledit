import {
  type CancellationToken,
  commands,
  CustomDocument,
  CustomDocumentBackup,
  CustomDocumentBackupContext,
  CustomDocumentEditEvent,
  CustomEditorProvider,
  type Disposable,
  EventEmitter,
  type ExtensionContext,
  Uri,
  type WebviewPanel,
  window,
  workspace,
} from "vscode"

export function activate({ subscriptions, extensionUri }: ExtensionContext) {
  let newId = 1
  commands.registerCommand("kt3k.pixeledit.new", () => {
    if (!workspace.workspaceFolders) {
      window.showErrorMessage(
        "Creating new pixeledit files currently requires opening a workspace",
      )
      return
    }

    commands.executeCommand(
      "vscode.openWith",
      Uri.joinPath(
        workspace.workspaceFolders[0].uri,
        `new-${newId++}.png`,
      ).with({ scheme: "untitled" }),
      "kt3k.pixeledit",
    )
  })

  subscriptions.push(
    window.registerCustomEditorProvider(
      "kt3k.pixeledit",
      new PixelEditProvider(extensionUri),
    ),
  )
}

function disposeAll(disposables: Disposable[]) {
  while (disposables.length) {
    disposables.pop()?.dispose()
  }
}

interface DocEdit {
  color: string
  stroke: ReadonlyArray<[number, number]>
}

async function readFile(uri: Uri): Promise<Uint8Array> {
  return uri.scheme === "untitled"
    ? new Uint8Array()
    : await workspace.fs.readFile(uri)
}

class PixelEditDocument implements CustomDocument {
  readonly uri: Uri
  bytes: Uint8Array
  #isDisposed = false
  #disposables: Disposable[] = []
  #edits: Array<DocEdit> = []
  #savedEdits: Array<DocEdit> = []
  #delegate: PixelEditProvider

  constructor(
    uri: Uri,
    bytes: Uint8Array,
    delegate: PixelEditProvider,
  ) {
    this.uri = uri
    this.bytes = bytes
    this.#delegate = delegate
  }

  /** Called by VS Code when there are no more references to the document.
   *
   * This happens when all editors for it have been closed. */
  dispose() {
    this.#onDidDispose.fire()

    if (this.#isDisposed) {
      return
    }
    this.#isDisposed = true
    disposeAll(this.#disposables)
  }

  _register<T extends Disposable>(value: T): T {
    if (this.#isDisposed) {
      value.dispose()
    } else {
      this.#disposables.push(value)
    }
    return value
  }

  #onDidDispose = this._register(new EventEmitter<void>())
  /** Fired when the document is disposed of. */
  onDidDispose = this.#onDidDispose.event

  #onDidChangeDocument = this._register(
    new EventEmitter<{
      readonly content?: Uint8Array
      readonly edits: readonly DocEdit[]
    }>(),
  )
  /** Fired to notify webviews that the document has changed. */
  onDidChangeContent = this.#onDidChangeDocument.event

  #onDidChange = this._register(
    new EventEmitter<{
      readonly label: string
      undo(): void
      redo(): void
    }>(),
  )
  /** Fired to tell VS Code that an edit has occurred in the document.
   *
   * This updates the document's dirty indicator. */
  onDidChange = this.#onDidChange.event

  /** Called when the user edits the document in a webview.
   *
   * This fires an event to notify VS Code that the document has been edited. */
  makeEdit(edit: DocEdit) {
    this.#edits.push(edit)

    this.#onDidChange.fire({
      label: "Stroke",
      undo: () => {
        this.#edits.pop()
        this.#onDidChangeDocument.fire({
          edits: this.#edits,
        })
      },
      redo: () => {
        this.#edits.push(edit)
        this.#onDidChangeDocument.fire({
          edits: this.#edits,
        })
      },
    })
  }

  /** Called by VS Code when the user saves the document. */
  async save(cancel: CancellationToken): Promise<void> {
    await this.#delegate.saveCustomDocumentAs(this, this.uri, cancel)
    this.#savedEdits = Array.from(this.#edits)
  }

  /** Called by VS Code when the user calls `revert` on a document. */
  async revert(_cancel: CancellationToken): Promise<void> {
    const diskContent = await readFile(this.uri)
    this.bytes = diskContent
    this.#edits = this.#savedEdits
    this.#onDidChangeDocument.fire({
      content: diskContent,
      edits: this.#edits,
    })
  }

  /** Called by VS Code to backup the edited document.
   *
   * These backups are used to implement hot exit. */
  async backup(
    dest: Uri,
    cancel: CancellationToken,
  ): Promise<CustomDocumentBackup> {
    await this.#delegate.saveCustomDocumentAs(this, dest, cancel)

    return {
      id: dest.toString(),
      delete: async () => {
        try {
          await workspace.fs.delete(dest)
        } catch {
          // noop
        }
      },
    }
  }
}

class PixelEditProvider implements CustomEditorProvider<PixelEditDocument> {
  #uri: Uri
  #requestId = 1
  #callbacks = new Map<number, (response: number[]) => void>()
  #webviews = new Set<{ key: string; webviewPanel: WebviewPanel }>()

  constructor(uri: Uri) {
    this.#uri = uri
  }

  #getWebviews(uri: Uri): WebviewPanel[] {
    const key = uri.toString()
    return [...this.#webviews]
      .filter((entry) => entry.key === key)
      .map((entry) => entry.webviewPanel)
  }

  #addWebview(uri: Uri, webviewPanel: WebviewPanel) {
    const entry = { key: uri.toString(), webviewPanel }
    this.#webviews.add(entry)

    webviewPanel.onDidDispose(() => {
      this.#webviews.delete(entry)
    })
  }

  async getBytesFromUi(uri: Uri) {
    const [panel] = this.#getWebviews(uri)
    if (!panel) {
      throw new Error("Could not find webview to request bytes for")
    }
    const requestId = this.#requestId++
    const p = new Promise<number[]>((resolve) =>
      this.#callbacks.set(requestId, resolve)
    )
    panel.webview.postMessage({ type: "getBytes", requestId })
    return new Uint8Array(await p)
  }

  async openCustomDocument(
    uri: Uri,
    openContext: { backupId?: string },
    _token: CancellationToken,
  ): Promise<PixelEditDocument> {
    const { backupId } = openContext
    const dataFile = backupId ? Uri.parse(backupId) : uri
    const document: PixelEditDocument = new PixelEditDocument(
      uri,
      await readFile(dataFile),
      this,
    )

    const listeners: Disposable[] = []

    listeners.push(document.onDidChange((e) => {
      // Tell VS Code that the document has been edited by the use.
      this.#onDidChangeCustomDocument.fire({
        document,
        ...e,
      })
    }))

    listeners.push(document.onDidChangeContent((e) => {
      // Update all webviews when the document changes
      for (const webviewPanel of this.#getWebviews(document.uri)) {
        webviewPanel.webview.postMessage({
          type: "update",
          body: {
            edits: e.edits,
            content: e.content,
          },
        })
      }
    }))

    document.onDidDispose(() => disposeAll(listeners))

    return document
  }

  resolveCustomEditor(
    document: PixelEditDocument,
    webviewPanel: WebviewPanel,
    _token: CancellationToken,
  ) {
    // Add the webview to our internal set of active webviews
    this.#addWebview(document.uri, webviewPanel)
    const webview = webviewPanel.webview

    // Setup initial content for the webview
    webview.options = { enableScripts: true }
    const scriptUri = webview.asWebviewUri(
      Uri.joinPath(this.#uri, "src/edit.js"),
    )
    webview.html = /* html */ `
    <html>
      <head>
        <title>Pixel Edit</title>
        <style>${style}</style>
      </head>
      <body>
        <div id="popup">
          <h3>Select the Dimensions Of the grid</h3>
          <input type="text" id="width" value="16" />X<input
            type="text"
            id="height"
            value="16"
          />
          <button id="close">OK</button>
        </div>
        <canvas id="canvas"></canvas>
        <div id="toolbar">
          <span class="item" onclick="board.setmode(0)" style="background-color: grey">
            <i class="fas fa-pencil-alt"></i>
          </span>
          <span class="item" onclick="board.setmode(1)"><i class="fas fa-eraser"></i></span>
          <span class="item" onclick="board.setmode(2)"><i class="fas fa-fill"></i></span>
          <span class="item" onclick="board.setmode(3)"><i class="fas fa-slash"></i></span>
          <span class="item" onclick="board.setmode(4)"><i class="far fa-circle"></i></span>
          <span class="item" onclick="board.setmode(5)"><i class="far fa-circle" style="transform: rotateX(45deg)"></i></span>
          <span class="item" onclick="board.undo()"><i class="fas fa-undo"></i></span>
          <span class="item" onclick="board.redo()"><i class="fas fa-redo"></i></span>
          <span class="item" onclick="board.clear()"><i class="fas fa-trash"></i></span>
          <span class="item" onclick="board.addImage()"><i class="fa fa-upload"></i></span>
        </div>
        <div id="palette"></div>
      </body>
      <script
        src="https://kit.fontawesome.com/473e8f3a80.js"
        crossorigin="anonymous"
      ></script>
      <script src="${scriptUri}"></script>
    </html>`

    webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case "stroke":
          document.makeEdit(e as DocEdit)
          return

        case "response": {
          this.#callbacks.get(e.requestId)?.(e.body)
          return
        }
        case "ready": {
          if (document.uri.scheme === "untitled") {
            webview.postMessage({
              type: "init",
              body: {
                untitled: true,
                editable: true,
              },
            })
          } else {
            webview.postMessage({
              type: "init",
              body: {
                value: document.bytes,
                editable: workspace.fs.isWritableFileSystem(
                  document.uri.scheme,
                ),
              },
            })
          }
        }
      }
    })
  }

  #onDidChangeCustomDocument = new EventEmitter<
    CustomDocumentEditEvent<PixelEditDocument>
  >()
  onDidChangeCustomDocument = this.#onDidChangeCustomDocument.event

  saveCustomDocument(
    document: PixelEditDocument,
    cancellation: CancellationToken,
  ): Thenable<void> {
    return document.save(cancellation)
  }

  async saveCustomDocumentAs(
    doc: PixelEditDocument,
    dest: Uri,
    cancel: CancellationToken,
  ) {
    const fileData = await this.getBytesFromUi(doc.uri)
    if (cancel.isCancellationRequested) {
      return
    }
    await workspace.fs.writeFile(dest, fileData)
  }

  revertCustomDocument(
    doc: PixelEditDocument,
    cancel: CancellationToken,
  ): Thenable<void> {
    return doc.revert(cancel)
  }

  backupCustomDocument(
    doc: PixelEditDocument,
    ctx: CustomDocumentBackupContext,
    cancel: CancellationToken,
  ): Thenable<CustomDocumentBackup> {
    return doc.backup(ctx.destination, cancel)
  }
}

const style = /* css */ `
body {
  background-color: #232125;
  margin: 0px;
}

#popup,
#frames {
  background-color: #332f35;
  color: white;
  font-size: 20px;
  padding: 30px;
  box-shadow: 0px 0px 10px 0px rgba(0, 0, 0, 0.5);
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.1, 0.1);
  text-align: center;
  max-width: 420px;
  width: 70%;
  transition: 0.2s all;
  z-index: 2;
  border-radius: 5px;
}
#popup {
  display: none;
}
#popup h3 {
  line-height: 30px;
}

#frames {
  display: none;
  padding: 10px;
}

#frames #gallery {
  padding: 10px 10px 10px 10px;
  overflow: hidden;
  white-space: nowrap;
  scroll-behavior: smooth;
}

#frames .btn {
  position: absolute;
  background-color: rgba(255, 255, 255, 0.5);
  color: black;
  font-size: 20px;
  padding: 10px;
  top: 50%;
  transform: translateY(-50%);
  border-radius: 50%;
  z-index: 2;
  box-shadow: 0px 0px 10px 0px rgba(0, 0, 0, 0.5);
}

#frames img {
  width: 100px;
  margin: 10px;
}

#width,
#height {
  background-color: #262327;
  color: white;
  margin: 10px;
  padding: 5px;
  font-size: 14px;
  font-weight: bolder;
  border: none;
  border-radius: 3px;
  max-width: 60px;
}

#close {
  background-color: #262327;
  color: white;
  margin: 15px auto 5px auto;
  padding: 5px 10px 5px 10px;
  font-size: 18px;
  font-weight: bolder;
  display: block;
  border: none;
  border-radius: 3px;
  max-width: 60px;
  transition: 0.2s all;
}

#close:hover {
  box-shadow: 0px 0px 3px 0px rgba(0, 0, 0, 0.5);
}

#canvas {
  box-shadow: 0px 0px 10px 0px rgba(0, 0, 0, 0.5);
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 75%;
  max-width: 550px;
  display: none;
  cursor: crosshair;
  touch-action: none;
  image-rendering: -moz-crisp-edges;
  image-rendering: -webkit-crisp-edges;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

#toolbar {
  position: fixed;
  top: 50%;
  left: 0%;
  transform: translateY(-50%);
  padding: 0px;
  color: white;
  max-width: 150px;
}

#toolbar .item {
  display: inline-block;
  float: left;
  padding: 15px;
  border: 1px solid #fff;
  cursor: pointer;
  height: 32px;
  width: 32px;
  font-family: Arial, FontAwesome;
  font-size: 24px;
}

#palette {
  position: fixed;
  top: 50%;
  right: 0%;
  transform: translateY(-50%);
  padding: 0px;
  color: white;
  max-width: 100px;
}

#palette .item {
  display: inline-block;
  float: left;
  padding: 25px;
  cursor: pointer;
}

path {
  fill: white;
}

.display-none {
  display: none;
}

.item:hover {
  background-color: grey;
}

.menubtn {
  position: fixed;
  left: 20px;
  top: 20px;
  box-shadow: 0px 0px 10px 0px rgba(0, 0, 0, 0.5);
  background-color: #332f35;
  color: white;
  padding: 5px 15px 5px 15px;
  border-radius: 5px;
  font-size: 25px;
  font-weight: bolder;
  cursor: pointer;
  z-index: 3;
}

.menu {
  position: fixed;
  top: 70px;
  left: 20px;
  border-radius: 5px;
  padding: 0px;
  color: white;
  z-index: 3;
  display: none;
}

.menu li {
  padding: 5px 20px 5px 20px;
  list-style: none;
  background-color: #332f35;
  cursor: pointer;
}

.menu li i {
  padding-right: 10px;
}

.menu li a {
  text-decoration: none;
  color: white;
}

@media only screen and (max-width: 600px) {
  #toolbar {
    position: fixed;
    top: 100%;
    left: 50%;
    min-width: 100%;
    transform: translate(-50%, -100%);
    padding: 0px;
    color: white;
  }
  #palette {
    position: fixed;
    top: 0%;
    transform: translateY(0%);
    min-width: 100%;
    padding: 0px;
    color: white;
  }
  #toolbar .item {
    width: 20px;
    height: 20px;
  }
  #palette .item {
    padding: 15px;
  }
  .menubtn {
    top: 70px;
  }
  .menu {
    top: 110px;
  }
}
`
