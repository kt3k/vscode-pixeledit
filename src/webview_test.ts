/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert"
import { toCssColor, toHex } from "./webview.ts"

Deno.test("toHex", () => {
  assertEquals(toHex([0, 0, 0, 255]), "#000000")
})

Deno.test("toCssColor", () => {
  assertEquals(toCssColor([0, 0, 0, 255]), "rgba(0,0,0,1)")
})
