// Copyright 2022-2024 Yoshiya Hinosawa. All rights reserved. MIT license.

// @ts-types="npm:@types/vscode"
import {
  type CancellationToken,
  commands,
  CustomDocument,
  CustomDocumentBackupContext,
  CustomDocumentEditEvent,
  CustomEditorProvider,
  EventEmitter,
  type ExtensionContext,
  Uri,
  type Webview,
  type WebviewPanel,
  window,
  workspace,
} from "vscode"
import { Buffer } from "node:buffer"
import type { Edit, ExtensionMessageData, WebviewMessage } from "./types.ts"
import { dirname, join } from "node:path"

const { fs } = workspace

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
      new PixelEdit(extensionUri),
    ),
  )
}

function postMessage(webview: Webview, message: ExtensionMessageData) {
  webview.postMessage(message)
}

// deno-lint-ignore require-await
async function readFile(uri: Uri): Promise<Uint8Array> {
  return uri.scheme === "untitled" ? new Uint8Array() : fs.readFile(uri)
}

function toDataUri(bytes: Uint8Array) {
  return "data:image/png;base64," + Buffer.from(bytes).toString("base64")
}

/** The document */
class PixelDoc implements CustomDocument {
  /** The current edits */
  edits: Edit[] = []
  /** The saved edits */
  #saved: Edit[] = []
  /** The key */
  readonly key: string
  /** The png files next to the doc */
  images: [string, string][] = []
  constructor(public readonly uri: Uri, public bytes: Uint8Array) {
    this.key = uri.toString()
  }
  async readNextFiles() {
    const dir = Uri.file(dirname(this.uri.fsPath))
    const files = await fs.readDirectory(dir)
    const pngs = files.filter(([name, type]) => name.endsWith(".png"))
    this.images = await Promise.all(
      pngs.map(([name]) =>
        fs.readFile(Uri.file(join(dir.fsPath, name))).then((bytes) =>
          [name, toDataUri(bytes)] as [string, string]
        )
      ),
    )
  }
  get dataUri() {
    return toDataUri(this.bytes)
  }
  dispose() {}
  onEdit(edit: Edit) {
    this.edits.push(edit)
  }
  onUndo() {
    this.edits.pop()
  }
  onSave() {
    this.#saved = [...this.edits]
  }
  onRevert() {
    this.edits = [...this.#saved]
  }
  updateEvent() {
    return {
      type: "update",
      doc: { dataUri: this.dataUri, edits: this.edits },
    } as const
  }
}

class PixelEdit implements CustomEditorProvider<PixelDoc> {
  #requestId = 1
  #callbacks = new Map<number, (response: string) => void>()
  #webviews: Record<string, Webview> = {}
  #html: Promise<string>

  constructor(public uri: Uri) {
    this.#html = readFile(Uri.joinPath(this.uri, "out/webview.html")).then(
      (u8) => new TextDecoder().decode(u8),
    )
  }

  async openCustomDocument(
    uri: Uri,
    { backupId }: { backupId?: string },
    _token: CancellationToken,
  ): Promise<PixelDoc> {
    const bytes = await readFile(backupId ? Uri.parse(backupId) : uri)
    const doc = new PixelDoc(uri, bytes)
    await doc.readNextFiles()
    return doc
  }

  async resolveCustomEditor(
    doc: PixelDoc,
    panel: WebviewPanel,
    _token: CancellationToken,
  ) {
    const webview = panel.webview
    this.#webviews[doc.key] = webview
    panel.onDidDispose(() => {
      delete this.#webviews[doc.key]
    })

    // Setup initial content for the webview
    webview.options = { enableScripts: true }
    const scriptUri = Uri.joinPath(this.uri, "out/webview.js")
    const tailwindUri = Uri.joinPath(this.uri, "out/tailwind.css")
    const html = await this.#html
    webview.html = html
      .replace("${scriptUri}", webview.asWebviewUri(scriptUri).toString())
      .replace("${tailwindUri}", webview.asWebviewUri(tailwindUri).toString())

    webview.onDidReceiveMessage((e: WebviewMessage) => {
      this.#onMessage(doc, e)
    })
  }

  #onMessage(doc: PixelDoc, e: WebviewMessage) {
    const { type } = e
    if (type === "edit") {
      doc.onEdit(e.edit)

      this.#changeEvent.fire({
        document: doc,
        label: "Change",
        undo: () => {
          doc.onUndo()
          postMessage(this.#webviews[doc.key], doc.updateEvent())
        },
        redo: () => {
          doc.onEdit(e.edit)
          postMessage(this.#webviews[doc.key], doc.updateEvent())
        },
      })
    } else if (type === "response") {
      this.#callbacks.get(e.requestId)?.(e.body)
    } else if (type === "ready") {
      if (doc.uri.scheme === "untitled") {
        postMessage(this.#webviews[doc.key], { type: "new" })
      } else {
        postMessage(this.#webviews[doc.key], {
          type: "init",
          dataUri: doc.dataUri,
          edits: doc.edits,
        })
        postMessage(this.#webviews[doc.key], {
          type: "nextImages",
          images: doc.images,
        })
      }
    }
  }

  #changeEvent = new EventEmitter<CustomDocumentEditEvent<PixelDoc>>()
  onDidChangeCustomDocument = this.#changeEvent.event

  async saveCustomDocument(
    doc: PixelDoc,
    cancel: CancellationToken,
  ) {
    await this.saveCustomDocumentAs(doc, doc.uri, cancel)
    doc.onSave()
  }

  async saveCustomDocumentAs(
    doc: PixelDoc,
    dest: Uri,
    cancel: CancellationToken,
  ) {
    const webview = this.#webviews[doc.key]
    if (!webview) {
      throw new Error("Could not find webview to request bytes for")
    }
    const requestId = this.#requestId++
    const dataUriPromise = new Promise<string>((resolve) =>
      this.#callbacks.set(requestId, resolve)
    )
    postMessage(webview, { type: "getBytes", requestId })
    const dataUri = await dataUriPromise
    if (cancel.isCancellationRequested) {
      return
    }
    await fs.writeFile(dest, Buffer.from(dataUri.slice(22), "base64"))
  }

  async revertCustomDocument(doc: PixelDoc) {
    doc.bytes = await readFile(doc.uri)
    doc.onRevert()
    postMessage(this.#webviews[doc.key], doc.updateEvent())
  }

  async backupCustomDocument(
    doc: PixelDoc,
    { destination }: CustomDocumentBackupContext,
    cancel: CancellationToken,
  ) {
    await this.saveCustomDocumentAs(doc, destination, cancel)

    return {
      id: destination.toString(),
      delete: () => fs.delete(destination).then(() => {}, () => {}),
    }
  }
}
