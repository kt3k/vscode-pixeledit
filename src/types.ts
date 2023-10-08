// Copyright 2022-2023 Yoshiya Hinosawa. All rights reserved. MIT license.

export type Color = readonly [number, number, number, number]

export type Edit = {
  readonly color: Color
  readonly stroke: ReadonlyArray<[number, number]>
}

export type WebviewMessage = {
  type: "ready"
} | {
  type: "response"
  requestId: number
  body: string
} | {
  type: "edit"
  edit: Edit
}
