import test from "node:test"
import assert from "node:assert/strict"
import { openProject, buildSummary, extractJson, evaluateChanges, buildModified, makeExample } from "../src/lib/threemf.js"

const form = { printer: "Bambu Lab A1", nozzle: "0.4", ams: "AMS lite (4 cores)", filType: "PLA", brand: "Multifila", use: "Decorativa", prio: "Equilibrada", notes: "" }
const RESP = '```json\n{"alteracoes":[' +
  '{"chave":"layer_height","valor":"0.16","motivo":"detalhe"},' +
  '{"chave":"wall_loops","valor":4},' +
  '{"chave":"sparse_infill_density","valor":"20"},' +
  '{"chave":"nozzle_temperature","valor":215},' +
  '{"chave":"layer_height","valor":"0.5"},' +
  '{"chave":"machine_max_speed_x","valor":"900"},' +
  '{"chave":"sparse_infill_pattern","valor":"Gyroid"},' +
  '{"chave":"brim_type","valor":"auto_brim"},' +
  '{"chave":"fan_min_speed","valor":[50,50]}' + ']}\n```'

test("lê o projeto de exemplo", async () => {
  const p = await openProject(await makeExample())
  assert.equal(p.objects[0].name, "Suporte de celular")
  assert.deepEqual(p.objects[0].overrides, ["wall_loops"])
  assert.equal(p.plates, 1)
  assert.match(buildSummary(p, form, "x.3mf"), /layer_height = 0.2/)
})

test("valida as alterações", async () => {
  const p = await openProject(await makeExample())
  const it = evaluateChanges(p, extractJson(RESP))
  assert.equal(it[0].status, "change")
  assert.deepEqual(it[1].conflicts, ["Suporte de celular"])
  assert.equal(it[2].after, "20%")
  assert.deepEqual(it[3].after, ["215", "215", "215", "215"])
  assert.equal(it[4].status, "bad")
  assert.equal(it[5].status, "bad")
  assert.equal(it[6].after, "gyroid")
  assert.equal(it[7].status, "same")
  assert.equal(it[8].status, "bad")
})

test("grava um 3MF que reabre com os valores novos", async () => {
  const p = await openProject(await makeExample())
  const acc = evaluateChanges(p, extractJson(RESP)).filter((i) => i.status === "change")
  for (const removeOverrides of [false, true]) {
    const out = new Uint8Array(await (await buildModified(p, acc, { removeOverrides })).arrayBuffer())
    const p2 = await openProject(out)
    assert.equal(p2.cfg.layer_height, "0.16")
    assert.equal(p2.cfg.sparse_infill_density, "20%")
    assert.equal(p2.cfg.printer_model, "Bambu Lab A1")
    assert.equal(p2.objects[0].overrides.length, removeOverrides ? 0 : 1)
  }
})
