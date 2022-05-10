import * as vscode from "vscode";
import { PixelEditorProvider } from "./PixelEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(PixelEditorProvider.register(context));
}
