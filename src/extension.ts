import * as vscode from "vscode"
import {
  type CancellationToken,
  commands,
  type ExtensionContext,
  Uri,
  type Webview,
  type WebviewPanel,
  workspace,
} from "vscode"

let newPixelEditFileId = 1

export function activate({ subscriptions, extensionUri }: ExtensionContext) {
  vscode.commands.registerCommand("kt3k.pixeledit.new", () => {
    const workspaceFolders = workspace.workspaceFolders
    if (!workspaceFolders) {
      vscode.window.showErrorMessage(
        "Creating new pixeledit files currently requires opening a workspace",
      )
      return
    }

    const uri = Uri.joinPath(
      workspaceFolders[0].uri,
      `new-${newPixelEditFileId++}.png`,
    )
      .with({ scheme: "untitled" })

    commands.executeCommand("vscode.openWith", uri, "kt3k.pixeledit")
  })

  const disposable = vscode.window.registerCustomEditorProvider(
    "kt3k.pixeledit",
    new PixelEditProvider(extensionUri),
    { supportsMultipleEditorsPerDocument: false },
  )
  subscriptions.push(disposable)
}

function disposeAll(disposables: vscode.Disposable[]) {
  while (disposables.length) {
    disposables.pop()?.dispose()
  }
}

abstract class Disposable {

}

interface PixelArtEdit {
  color: string
  stroke: ReadonlyArray<[number, number]>
}

interface PixelEditDocumentOptions {
  getFileData(): Promise<Uint8Array>
}

class PixelEditDocument extends Disposable implements vscode.CustomDocument {

  static async readFile(uri: Uri): Promise<Uint8Array> {
    if (uri.scheme === "untitled") {
      return new Uint8Array()
    }
    return workspace.fs.readFile(uri)
  }

  uri: Uri

  documentData: Uint8Array
  #edits: Array<PixelArtEdit> = []
  #savedEdits: Array<PixelArtEdit> = []

  #getFileData: () => Promise<Uint8Array>

  constructor(
    uri: Uri,
    initialContent: Uint8Array,
    options: PixelEditDocumentOptions,
  ) {
    super()
    this.uri = uri
    this.documentData = initialContent
    this.#getFileData = options.getFileData
  }

  isDisposed = false

  disposables: vscode.Disposable[] = []

  /** Called by VS Code when there are no more references to the document.
   *
   * This happens when all editors for it have been closed. */
  dispose() {
    this.#onDidDispose.fire()

    if (this.isDisposed) {
      return
    }
    this.isDisposed = true
    disposeAll(this.disposables)
  }

  _register<T extends vscode.Disposable>(value: T): T {
    if (this.isDisposed) {
      value.dispose()
    } else {
      this.disposables.push(value)
    }
    return value
  }

  #onDidDispose = this._register(
    new vscode.EventEmitter<void>(),
  )
  /** Fired when the document is disposed of. */
  onDidDispose = this.#onDidDispose.event

  #onDidChangeDocument = this._register(
    new vscode.EventEmitter<{
      readonly content?: Uint8Array
      readonly edits: readonly PixelArtEdit[]
    }>(),
  )
  /** Fired to notify webviews that the document has changed. */
  onDidChangeContent = this.#onDidChangeDocument.event

  #onDidChange = this._register(
    new vscode.EventEmitter<{
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
  makeEdit(edit: PixelArtEdit) {
    this.#edits.push(edit)

    this.#onDidChange.fire({
      label: "Stroke",
      undo: async () => {
        this.#edits.pop()
        this.#onDidChangeDocument.fire({
          edits: this.#edits,
        })
      },
      redo: async () => {
        this.#edits.push(edit)
        this.#onDidChangeDocument.fire({
          edits: this.#edits,
        })
      },
    })
  }

  /** Called by VS Code when the user saves the document. */
  async save(cancellation: CancellationToken): Promise<void> {
    await this.saveAs(this.uri, cancellation)
    this.#savedEdits = Array.from(this.#edits)
  }

  /** Called by VS Code when the user saves the document to a new location. */
  async saveAs(
    targetResource: Uri,
    cancellation: CancellationToken,
  ): Promise<void> {
    const fileData = await this.#getFileData()
    if (cancellation.isCancellationRequested) {
      return
    }
    await workspace.fs.writeFile(targetResource, fileData)
  }

  /** Called by VS Code when the user calls `revert` on a document. */
  async revert(_cancellation: CancellationToken): Promise<void> {
    const diskContent = await PixelEditDocument.readFile(this.uri)
    this.documentData = diskContent
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
    destination: Uri,
    cancellation: CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination, cancellation)

    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await workspace.fs.delete(destination)
        } catch {
          // noop
        }
      },
    }
  }
}

class PixelEditProvider
  implements vscode.CustomEditorProvider<PixelEditDocument> {
  #webviews = new WebviewCollection()
  #uri: Uri
  #requestId = 1
  #callbacks = new Map<number, (response: any) => void>()

  constructor(uri: Uri) {
    this.#uri = uri
  }

  async openCustomDocument(
    uri: Uri,
    openContext: { backupId?: string },
    _token: CancellationToken,
  ): Promise<PixelEditDocument> {
    const { backupId } = openContext
    const dataFile = typeof backupId === "string" ? Uri.parse(backupId) : uri
    const fileData = await PixelEditDocument.readFile(dataFile)
    const document = new PixelEditDocument(uri, fileData, {
      getFileData: async () => {
        const [panel] = this.#webviews.get(document.uri)
        if (!panel) {
          throw new Error("Could not find webview to save for")
        }
        const requestId = this.#requestId++
        const p = new Promise<number[]>((resolve) =>
          this.#callbacks.set(requestId, resolve)
        )
        panel.webview.postMessage({
          type: "getFileData",
          requestId,
          body: {},
        })
        return new Uint8Array(await p)
      },
    })

    const listeners: vscode.Disposable[] = []

    listeners.push(document.onDidChange((e) => {
      // Tell VS Code that the document has been edited by the use.
      this.#onDidChangeCustomDocument.fire({
        document,
        ...e,
      })
    }))

    listeners.push(document.onDidChangeContent((e) => {
      // Update all webviews when the document changes
      for (const webviewPanel of this.#webviews.get(document.uri)) {
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

  async resolveCustomEditor(
    document: PixelEditDocument,
    webviewPanel: WebviewPanel,
    _token: CancellationToken,
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.#webviews.add(document.uri, webviewPanel)
    const webview = webviewPanel.webview

    // Setup initial content for the webview
    webview.options = {
      enableScripts: true,
    }
    webview.html = /* html */ `
    <html>
      <head>
        <title>Pixel Edit</title>
        <link rel="stylesheet" href="${
      webview.asWebviewUri(Uri.joinPath(this.#uri, "style.css"))
    }" />
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
          <span
            class="item"
            onclick="board.setmode(0)"
            style="background-color: grey"
            ><i class="fas fa-pencil-alt"></i
          ></span>
          <span class="item" onclick="board.setmode(1)"
            ><i class="fas fa-eraser"></i
          ></span>
          <span class="item" onclick="board.setmode(2)"
            ><i class="fas fa-fill"></i
          ></span>
          <span class="item" onclick="board.setmode(3)"
            ><i class="fas fa-slash"></i
          ></span>
          <span class="item" onclick="board.setmode(4)"
            ><i class="far fa-circle"></i
          ></span>
          <span class="item" onclick="board.setmode(5)"
            ><i class="far fa-circle" style="transform: rotateX(45deg)"></i
          ></span>
          <span class="item" onclick="board.undo()"
            ><i class="fas fa-undo"></i
          ></span>
          <span class="item" onclick="board.redo()"
            ><i class="fas fa-redo"></i
          ></span>
          <span class="item" onclick="board.clear()"
            ><i class="fas fa-trash"></i
          ></span>
          <span class="item" onclick="board.addImage()"
            ><i class="fa fa-upload"></i
          ></span>
        </div>
        <div id="palette"></div>
      </body>
      <script
        src="https://kit.fontawesome.com/473e8f3a80.js"
        crossorigin="anonymous"
      ></script>
      <script src="${
      webview.asWebviewUri(Uri.joinPath(this.#uri, "script.js"))
    }"></script>
    </html>`

    webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case "stroke":
          document.makeEdit(e as PixelArtEdit)
          return

        case "response": {
          const callback = this.#callbacks.get(e.requestId)
          callback?.(e.body)
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
            const editable = workspace.fs.isWritableFileSystem(
              document.uri.scheme,
            )

            webview.postMessage({
              type: "init",
              body: {
                value: document.documentData,
                editable,
              },
            })
          }
        }
      }
    })
  }

  #onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<PixelEditDocument>
  >()
  onDidChangeCustomDocument = this.#onDidChangeCustomDocument.event

  saveCustomDocument(
    document: PixelEditDocument,
    cancellation: CancellationToken,
  ): Thenable<void> {
    return document.save(cancellation)
  }

  saveCustomDocumentAs(
    document: PixelEditDocument,
    destination: Uri,
    cancellation: CancellationToken,
  ): Thenable<void> {
    return document.saveAs(destination, cancellation)
  }

  revertCustomDocument(
    document: PixelEditDocument,
    cancellation: CancellationToken,
  ): Thenable<void> {
    return document.revert(cancellation)
  }

  backupCustomDocument(
    document: PixelEditDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: CancellationToken,
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation)
  }

  #createHtml(webview: Webview) {
    return /* html */ `
<html>
  <head>
    <title>Pixel Edit</title>
    <link rel="stylesheet" href="${
      webview.asWebviewUri(Uri.joinPath(this.#uri, "style.css"))
    }" />
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
      <span
        class="item"
        onclick="board.setmode(0)"
        style="background-color: grey"
        ><i class="fas fa-pencil-alt"></i
      ></span>
      <span class="item" onclick="board.setmode(1)"
        ><i class="fas fa-eraser"></i
      ></span>
      <span class="item" onclick="board.setmode(2)"
        ><i class="fas fa-fill"></i
      ></span>
      <span class="item" onclick="board.setmode(3)"
        ><i class="fas fa-slash"></i
      ></span>
      <span class="item" onclick="board.setmode(4)"
        ><i class="far fa-circle"></i
      ></span>
      <span class="item" onclick="board.setmode(5)"
        ><i class="far fa-circle" style="transform: rotateX(45deg)"></i
      ></span>
      <span class="item" onclick="board.undo()"
        ><i class="fas fa-undo"></i
      ></span>
      <span class="item" onclick="board.redo()"
        ><i class="fas fa-redo"></i
      ></span>
      <span class="item" onclick="board.clear()"
        ><i class="fas fa-trash"></i
      ></span>
      <span class="item" onclick="board.addImage()"
        ><i class="fa fa-upload"></i
      ></span>
    </div>
    <div id="palette"></div>
  </body>
  <script
    src="https://kit.fontawesome.com/473e8f3a80.js"
    crossorigin="anonymous"
  ></script>
  <script src="${
      webview.asWebviewUri(Uri.joinPath(this.#uri, "script.js"))
    }"></script>
</html>`
  }
}

class WebviewCollection {
  webviews = new Set<{ resource: string; webviewPanel: WebviewPanel }>()

  get(uri: Uri): WebviewPanel[] {
    const key = uri.toString()
    const panels = []
    for (const entry of this.webviews) {
      if (entry.resource === key) {
        panels.push(entry.webviewPanel)
      }
    }
    return panels
  }

  add(uri: Uri, webviewPanel: WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel }
    this.webviews.add(entry)

    webviewPanel.onDidDispose(() => {
      this.webviews.delete(entry)
    })
  }
}
