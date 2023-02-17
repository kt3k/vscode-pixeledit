import { ExtensionContext } from "vscode"
import { PixelEditorProvider } from "./PixelEditorProvider"

console.log("extension.ts")
export function activate(context: ExtensionContext) {
  console.log("activate", context)
  context.subscriptions.push(PixelEditorProvider.register(context))
}
