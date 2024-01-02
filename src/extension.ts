// Copyright 2022-2023 Yoshiya Hinosawa. All rights reserved. MIT license.

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
import type { Edit, ExtensionMessageData, WebviewMessage } from "./types"

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
  return uri.scheme === "untitled"
    ? new Uint8Array()
    : workspace.fs.readFile(uri)
}

/** The document */
class PixelDoc implements CustomDocument {
  /** The current edits */
  edits: Edit[] = []
  /** The saved edits */
  #saved: Edit[] = []
  constructor(public readonly uri: Uri, public bytes: Uint8Array) {}
  get key() {
    return this.uri.toString()
  }
  get dataUri() {
    return "data:image/png;base64," +
      Buffer.from(this.bytes).toString("base64")
  }
  dispose() {}
  onSave() {
    this.#saved = [...this.edits]
  }
  onRevert() {
    this.edits = [...this.#saved]
  }
}

class PixelEdit implements CustomEditorProvider<PixelDoc> {
  #requestId = 1
  #callbacks = new Map<number, (response: string) => void>()
  #webviews = new Set<{ key: string; webview: Webview }>()
  #html: Promise<string>

  constructor(public uri: Uri) {
    this.#html = this.#createHtml()
  }

  async #createHtml() {
    return new TextDecoder().decode(
      await readFile(Uri.joinPath(this.uri, "out/webview.html")),
    )
  }

  async openCustomDocument(
    uri: Uri,
    { backupId }: { backupId?: string },
    _token: CancellationToken,
  ): Promise<PixelDoc> {
    const bytes = await readFile(backupId ? Uri.parse(backupId) : uri)
    return new PixelDoc(uri, bytes)
  }

  #updateWebview(doc: PixelDoc) {
    const key = doc.key
    const dataUri = doc.dataUri
    const edits = doc.edits
    for (const entry of this.#webviews) {
      if (entry.key === key) {
        postMessage(entry.webview, { type: "update", doc: { edits, dataUri } })
      }
    }
  }

  async resolveCustomEditor(
    doc: PixelDoc,
    panel: WebviewPanel,
    _token: CancellationToken,
  ) {
    const entry = { key: doc.key, webview: panel.webview }
    this.#webviews.add(entry)
    panel.onDidDispose(() => {
      this.#webviews.delete(entry)
    })
    const webview = panel.webview

    // Setup initial content for the webview
    webview.options = { enableScripts: true }
    const scriptUri = Uri.joinPath(this.uri, "out/webview.js")
    const styleUri = Uri.joinPath(this.uri, "out/style.css")
    const html = await this.#html
    webview.html = html
      .replace("${scriptUri}", webview.asWebviewUri(scriptUri).toString())
      .replace("${styleUri}", webview.asWebviewUri(styleUri).toString())

    webview.onDidReceiveMessage((e: WebviewMessage) => {
      console.log("webview -> extension " + e.type, e)
      switch (e.type) {
        case "edit": {
          doc.edits.push(e.edit)

          this.#changeEvent.fire({
            document: doc,
            label: "Change",
            undo: () => {
              doc.edits.pop()
              this.#updateWebview(doc)
            },
            redo: () => {
              doc.edits.push(e.edit)
              this.#updateWebview(doc)
            },
          })
          return
        }
        case "response": {
          this.#callbacks.get(e.requestId)?.(e.body)
          return
        }
        case "ready": {
          if (doc.uri.scheme === "untitled") {
            postMessage(webview, { type: "new" })
          } else {
            postMessage(webview, {
              type: "init",
              dataUri: doc.dataUri,
            })
          }
        }
      }
    })
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
    const key = doc.key
    const entry = [...this.#webviews].find((entry) => entry.key === key)
    if (!entry) {
      throw new Error("Could not find webview to request bytes for")
    }
    const requestId = this.#requestId++
    const dataUriPromise = new Promise<string>((resolve) =>
      this.#callbacks.set(requestId, resolve)
    )
    postMessage(entry.webview, { type: "getBytes", requestId })
    const dataUri = await dataUriPromise
    if (cancel.isCancellationRequested) {
      return
    }
    await workspace.fs.writeFile(dest, Buffer.from(dataUri.slice(22), "base64"))
  }

  async revertCustomDocument(doc: PixelDoc) {
    doc.bytes = await readFile(doc.uri)
    doc.onRevert()
    this.#updateWebview(doc)
  }

  async backupCustomDocument(
    doc: PixelDoc,
    ctx: CustomDocumentBackupContext,
    cancel: CancellationToken,
  ) {
    const dest = ctx.destination
    await this.saveCustomDocumentAs(doc, dest, cancel)

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
