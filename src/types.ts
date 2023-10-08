// Copyright 2022-2023 Yoshiya Hinosawa. All rights reserved. MIT license.

export type Color = readonly [number, number, number, number]

export type Edit = {
  readonly color: Color
  readonly stroke: ReadonlyArray<[number, number]>
}

export type WebviewMessage = {
  readonly type: "ready"
} | {
  readonly type: "response"
  readonly requestId: number
  readonly body: string
} | {
  readonly type: "edit"
  readonly edit: Edit
}

export type ExtensionMessageEvent = MessageEvent<ExtensionMessageData>

export type ExtensionMessageData = {
  readonly type: "init"
  readonly bytes: string
} | {
  readonly type: "new"
} | {
  readonly type: "getBytes"
  readonly requestId: number
} | {
  readonly type: "update"
  readonly doc: {
    readonly bytes: string
    readonly edits: Edit[]
  }
}
