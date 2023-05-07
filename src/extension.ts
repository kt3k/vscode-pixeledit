import * as vscode from "vscode"
import { PixelEditorProvider } from "./PixelEditorProvider"

let newPixelEditFileId = 1

export function activate(context: vscode.ExtensionContext) {
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
      `new-${newPixelEditFileId++}.png`,
    )
      .with({ scheme: "untitled" })

    vscode.commands.executeCommand(
      "vscode.openWith",
      uri,
      "kt3k.pixeledit",
    )
  })

  const disposable = vscode.window.registerCustomEditorProvider(
    "kt3k.pixeledit",
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
  context.subscriptions.push(disposable)
}
