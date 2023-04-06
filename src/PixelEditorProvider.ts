
// deno-lint-ignore-file no-explicit-any require-await

import * as vscode from "vscode"
import { Disposable, disposeAll } from "./dispose"

interface PixelArtEdit {
  color: string
  stroke: ReadonlyArray<[number, number]>
}

interface PixelArtDocumentDelegate {
  getFileData(): Promise<Uint8Array>
}

class PixelArtDocument extends Disposable implements vscode.CustomDocument {
  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
    delegate: PixelArtDocumentDelegate,
  ): Promise<PixelArtDocument | PromiseLike<PixelArtDocument>> {
    // If we have a backup, read that. Otherwise read the resource from the workspace
    const dataFile = typeof backupId === "string"
      ? vscode.Uri.parse(backupId)
      : uri
    const fileData = await PixelArtDocument.readFile(dataFile)
    return new PixelArtDocument(uri, fileData, delegate)
  }

  static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === "untitled") {
      return new Uint8Array()
    }
    return vscode.workspace.fs.readFile(uri)
  }

  #uri: vscode.Uri

  #documentData: Uint8Array
  #edits: Array<PixelArtEdit> = []
  #savedEdits: Array<PixelArtEdit> = []

  #delegate: PixelArtDocumentDelegate

  constructor(
    uri: vscode.Uri,
    initialContent: Uint8Array,
    delegate: PixelArtDocumentDelegate,
  ) {
    super()
    this.#uri = uri
    this.#documentData = initialContent
    this.#delegate = delegate
  }

  get uri() {
    return this.#uri
  }

  get documentData(): Uint8Array {
    return this.#documentData
  }

  #onDidDispose = this._register(
    new vscode.EventEmitter<void>(),
  )
  /**
   * Fired when the document is disposed of.
   */
  onDidDispose = this.#onDidDispose.event

  #onDidChangeDocument = this._register(
    new vscode.EventEmitter<{
      readonly content?: Uint8Array
      readonly edits: readonly PixelArtEdit[]
    }>(),
  )
  /**
   * Fired to notify webviews that the document has changed.
   */
  onDidChangeContent = this.#onDidChangeDocument.event

  #onDidChange = this._register(
    new vscode.EventEmitter<{
      readonly label: string
      undo(): void
      redo(): void
    }>(),
  )
  /**
   * Fired to tell VS Code that an edit has occurred in the document.
   *
   * This updates the document's dirty indicator.
   */
  onDidChange = this.#onDidChange.event

  /**
   * Called by VS Code when there are no more references to the document.
   *
   * This happens when all editors for it have been closed.
   */
  dispose(): void {
    this.#onDidDispose.fire()
    super.dispose()
  }

  /**
   * Called when the user edits the document in a webview.
   *
   * This fires an event to notify VS Code that the document has been edited.
   */
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

  /**
   * Called by VS Code when the user saves the document.
   */
  async save(cancellation: vscode.CancellationToken): Promise<void> {
    await this.saveAs(this.uri, cancellation)
    this.#savedEdits = Array.from(this.#edits)
  }

  /**
   * Called by VS Code when the user saves the document to a new location.
   */
  async saveAs(
    targetResource: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const fileData = await this.#delegate.getFileData()
    if (cancellation.isCancellationRequested) {
      return
    }
    await vscode.workspace.fs.writeFile(targetResource, fileData)
  }

  /**
   * Called by VS Code when the user calls `revert` on a document.
   */
  async revert(_cancellation: vscode.CancellationToken): Promise<void> {
    const diskContent = await PixelArtDocument.readFile(this.uri)
    this.#documentData = diskContent
    this.#edits = this.#savedEdits
    this.#onDidChangeDocument.fire({
      content: diskContent,
      edits: this.#edits,
    })
  }

  /**
   * Called by VS Code to backup the edited document.
   *
   * These backups are used to implement hot exit.
   */
  async backup(
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination, cancellation)

    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination)
        } catch {
          // noop
        }
      },
    }
  }
}

export class PixelEditorProvider
  implements vscode.CustomEditorProvider<PixelArtDocument> {
  static #newPixelEditFileId = 1

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    vscode.commands.registerCommand("kt3k.pixeledit.new", () => {
      const workspaceFolders = vscode.workspace.workspaceFolders
      if (!workspaceFolders) {
        vscode.window.showErrorMessage(
          "Creating new pixeledit files currently requires opening a workspace",
        )
        return
      }

      const uri = vscode.Uri.joinPath(
        workspaceFolders[0].uri,
        `new-${PixelEditorProvider.#newPixelEditFileId++}.png`,
      )
        .with({ scheme: "untitled" })

      vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        PixelEditorProvider.#viewType,
      )
    })

    return vscode.window.registerCustomEditorProvider(
      PixelEditorProvider.#viewType,
      new PixelEditorProvider(context),
      {
        // For this demo extension, we enable `retainContextWhenHidden` which keeps the
        // webview alive even when it is not visible. You should avoid using this setting
        // unless is absolutely required as it does have memory overhead.
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    )
  }

  static #viewType = "kt3k.pixeledit"

  /** Tracks all known webviews */
  #webviews = new WebviewCollection()
  #context: vscode.ExtensionContext

  constructor(
    context: vscode.ExtensionContext,
  ) {
    this.#context = context
  }

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken,
  ): Promise<PixelArtDocument> {
    const document: PixelArtDocument = await PixelArtDocument.create(
      uri,
      openContext.backupId,
      {
        getFileData: async () => {
          const webviewsForDocument = Array.from(
            this.#webviews.get(document.uri),
          )
          if (!webviewsForDocument.length) {
            throw new Error("Could not find webview to save for")
          }
          const panel = webviewsForDocument[0]
          const response = await this.#postMessageWithResponse<number[]>(
            panel,
            "getFileData",
            {},
          )
          return new Uint8Array(response)
        },
      },
    )

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
        this.#postMessage(webviewPanel, "update", {
          edits: e.edits,
          content: e.content,
        })
      }
    }))

    document.onDidDispose(() => disposeAll(listeners))

    return document
  }

  async resolveCustomEditor(
    document: PixelArtDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.#webviews.add(document.uri, webviewPanel)

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    }
    webviewPanel.webview.html = this.#getHtmlForWebview(webviewPanel.webview)

    webviewPanel.webview.onDidReceiveMessage((e) =>
      this.#onMessage(document, e)
    )

    // Wait for the webview to be properly ready before we init
    webviewPanel.webview.onDidReceiveMessage((e) => {
      if (e.type === "ready") {
        if (document.uri.scheme === "untitled") {
          this.#postMessage(webviewPanel, "init", {
            untitled: true,
            editable: true,
          })
        } else {
          const editable = vscode.workspace.fs.isWritableFileSystem(
            document.uri.scheme,
          )

          this.#postMessage(webviewPanel, "init", {
            value: document.documentData,
            editable,
          })
        }
      }
    })
  }

  #onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<PixelArtDocument>
  >()
  onDidChangeCustomDocument = this.#onDidChangeCustomDocument.event

  saveCustomDocument(
    document: PixelArtDocument,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.save(cancellation)
  }

  saveCustomDocumentAs(
    document: PixelArtDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.saveAs(destination, cancellation)
  }

  revertCustomDocument(
    document: PixelArtDocument,
    cancellation: vscode.CancellationToken,
  ): Thenable<void> {
    return document.revert(cancellation)
  }

  backupCustomDocument(
    document: PixelArtDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken,
  ): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation)
  }
  #getHtmlForWebview(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(
      this.#context.extensionUri,
      "script.js",
    ))
    const scriptMatrix = webview.asWebviewUri(vscode.Uri.joinPath(
      this.#context.extensionUri,
      "lib",
      "Matrix.js",
    ))
    const scriptShapes = webview.asWebviewUri(vscode.Uri.joinPath(
      this.#context.extensionUri,
      "lib",
      "Shapes.js",
    ))
    const scriptTransformation = webview.asWebviewUri(vscode.Uri.joinPath(
      this.#context.extensionUri,
      "lib",
      "Transformation.js",
    ))

    const style = webview.asWebviewUri(vscode.Uri.joinPath(
      this.#context.extensionUri,
      "style.css",
    ))

    return /* html */ `
<html>
  <head>
    <title>Pixel Edit</title>
    <link rel="stylesheet" href="${style}" />
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
  <script src="${scriptMatrix}" async></script>
  <script src="${scriptShapes}" async></script>
  <script src="${scriptTransformation}" async></script>
  <script src="${script}"></script>
</html>`
  }

  #requestId = 1
  #callbacks = new Map<number, (response: any) => void>()

  #postMessageWithResponse<R = unknown>(
    panel: vscode.WebviewPanel,
    type: string,
    body: any,
  ): Promise<R> {
    const requestId = this.#requestId++
    const p = new Promise<R>((resolve) =>
      this.#callbacks.set(requestId, resolve)
    )
    panel.webview.postMessage({ type, requestId, body })
    return p
  }

  #postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: any,
  ): void {
    panel.webview.postMessage({ type, body })
  }

  #onMessage(document: PixelArtDocument, message: any) {
    switch (message.type) {
      case "stroke":
        document.makeEdit(message as PixelArtEdit)
        return

      case "response": {
        const callback = this.#callbacks.get(message.requestId)
        callback?.(message.body)
        return
      }
    }
  }
}

class WebviewCollection {
  #webviews = new Set<{
    resource: string
    webviewPanel: vscode.WebviewPanel
  }>();

  *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString()
    for (const entry of this.#webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel
      }
    }
  }

  add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel }
    this.#webviews.add(entry)

    webviewPanel.onDidDispose(() => {
      this.#webviews.delete(entry)
    })
  }
}
