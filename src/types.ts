// Copyright 2022-2023 Yoshiya Hinosawa. All rights reserved. MIT license.

/// <reference lib="dom" />

export type Color = readonly [number, number, number, number]

export type Point = readonly [x: number, y: number]
export type Stroke = ReadonlyArray<Point>

export type Edit = {
  readonly color: Color
  readonly stroke: Stroke
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
  readonly dataUri: string
  readonly edits: Edit[]
} | {
  readonly type: "new"
} | {
  readonly type: "getBytes"
  readonly requestId: number
} | {
  readonly type: "update"
  readonly doc: {
    readonly dataUri: string
    readonly edits: Edit[]
  }
} | {
  readonly type: "nextImages"
  readonly images: [string, string][]
}
