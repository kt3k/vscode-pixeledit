import { ExtensionContext } from "vscode"
import { PixelEditorProvider } from "./PixelEditorProvider"

export function activate(context: ExtensionContext) {
  context.subscriptions.push(PixelEditorProvider.register(context))
}
