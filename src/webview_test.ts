// Copyright 2022-2024 Yoshiya Hinosawa. All rights reserved. MIT license.
/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"
import { toCssColor, toHex } from "./webview.ts"
import { DOMParser } from "@b-fuze/deno-dom"
import { mount } from "@kt3k/cell"
import { assertSnapshot } from "@std/testing/snapshot"

const domParser = new DOMParser()

Deno.test("toHex", () => {
  assertEquals(toHex([0, 0, 0, 255]), "#000000")
})

Deno.test("toCssColor", () => {
  assertEquals(toCssColor([0, 0, 0, 255]), "rgba(0,0,0,1)")
})

Deno.test("js-tools", async (t) => {
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).document = domParser.parseFromString(
    `<div class="js-tools"></div>`,
    "text/html",
  )
  mount()
  await assertSnapshot(t, document.querySelector(".js-tools")?.innerHTML)
})

Deno.test("js-palette", async (t) => {
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).document = domParser.parseFromString(
    `<div class="js-palette"></div>`,
    "text/html",
  )
  mount()
  await assertSnapshot(t, document.querySelector(".js-palette")?.innerHTML)
})
